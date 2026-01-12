// src/modules/desktop-agent/desktop-agent.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, Platform, NotificationType, ActivityType, AgentActivityType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
    RegisterAgentDto,
    UpdateAgentDto,
    HeartbeatDto,
    AgentConfigDto,
    AgentStartTrackingDto,
    AgentStopTrackingDto,
} from './dto/desktop-agent.dto';

// Constants
const AGENT_TOKEN_EXPIRY_DAYS = 30;
const HEARTBEAT_TIMEOUT_MINUTES = 5;
const CAPTURE_MIN_INTERVAL_SECONDS = 120; // 2 minutes
const CAPTURE_MAX_INTERVAL_SECONDS = 300; // 5 minutes

// Current agent versions (update when releasing new versions)
const CURRENT_AGENT_VERSIONS = {
    WINDOWS: '1.0.0',
    MAC: '1.0.0',
    LINUX: '1.0.0',
};

// Download URLs (these would be your actual download URLs)
// const AGENT_DOWNLOAD_URLS = {
//     WINDOWS: 'https://downloads.merittracker.com/agent/MeritTracker-Setup-1.0.0.exe',
//     MAC: 'https://downloads.merittracker.com/agent/MeritTracker-1.0.0.dmg',
//     LINUX: 'https://downloads.merittracker.com/agent/merit-tracker-1.0.0.AppImage',
// };
const AGENT_DOWNLOAD_URLS = {
    WINDOWS: 'https://h2oqis7bxnp74uea.public.blob.vercel-storage.com/MeritTracker-Setup-1.0.0.exe',
    MAC: 'https://downloads.merittracker.com/agent/MeritTracker-1.0.0.dmg',
    LINUX: 'https://downloads.merittracker.com/agent/merit-tracker-1.0.0.AppImage',
};

@Injectable()
export class DesktopAgentService {
    constructor(private prisma: PrismaService) { }

    // ============================================
    // Helper: Generate secure token
    // ============================================
    private generateAgentToken(): string {
        return `mta_${crypto.randomBytes(32).toString('hex')}`;
    }

    // ============================================
    // Helper: Get token expiry date
    // ============================================
    private getTokenExpiryDate(): Date {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + AGENT_TOKEN_EXPIRY_DAYS);
        return expiry;
    }

    // ============================================
    // Helper: Send notification
    // ============================================
    private async sendNotification(
        userId: string,
        type: NotificationType,
        title: string,
        message: string,
        metadata?: Record<string, any>,
    ) {
        await this.prisma.notification.create({
            data: {
                userId,
                type,
                title,
                message,
                metadata: metadata || {},
            },
        });
    }

    // ============================================
    // Helper: Log agent activity
    // ============================================
    private async logAgentActivity(
        agentId: string,
        activityType: AgentActivityType,
        description: string,
        metadata?: Record<string, any>,
    ) {
        await this.prisma.agentActivityLog.create({
            data: {
                agentId,
                activityType,
                description,
                metadata,
            },
        });
    }

    // ============================================
    // REGISTER NEW AGENT
    // ============================================
    async registerAgent(dto: RegisterAgentDto, userId: string, companyId: string) {
        // Check if agent already exists for this user and machine
        const existingAgent = await this.prisma.desktopAgent.findUnique({
            where: {
                userId_machineId: {
                    userId,
                    machineId: dto.machineId,
                },
            },
        });

        if (existingAgent) {
            // Update existing agent with new token
            const newToken = this.generateAgentToken();
            const agent = await this.prisma.desktopAgent.update({
                where: { id: existingAgent.id },
                data: {
                    agentVersion: dto.agentVersion,
                    machineName: dto.machineName,
                    agentToken: newToken,
                    tokenExpiresAt: this.getTokenExpiryDate(),
                    isOnline: true,
                    lastHeartbeat: new Date(),
                    updatedAt: new Date(),
                },
            });

            await this.logAgentActivity(
                agent.id,
                AgentActivityType.STARTED,
                'Agent re-registered',
                { platform: dto.platform, version: dto.agentVersion },
            );

            return {
                agent: this.sanitizeAgent(agent),
                token: newToken,
                config: await this.getAgentConfig(userId, companyId),
            };
        }

        // Create new agent
        const agentToken = this.generateAgentToken();
        const agent = await this.prisma.desktopAgent.create({
            data: {
                userId,
                machineId: dto.machineId,
                machineName: dto.machineName,
                platform: dto.platform,
                agentVersion: dto.agentVersion,
                agentToken,
                tokenExpiresAt: this.getTokenExpiryDate(),
                isOnline: true,
                lastHeartbeat: new Date(),
            },
        });

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId,
                userId,
                activityType: ActivityType.AGENT_REGISTERED,
                description: `Desktop agent registered on ${dto.machineName || dto.machineId}`,
                metadata: {
                    agentId: agent.id,
                    platform: dto.platform,
                    version: dto.agentVersion,
                },
            },
        });

        await this.logAgentActivity(
            agent.id,
            AgentActivityType.STARTED,
            'New agent registered',
            { platform: dto.platform, version: dto.agentVersion },
        );

        // Notify user
        await this.sendNotification(
            userId,
            NotificationType.AGENT_INSTALLED,
            'Desktop Agent Installed',
            `Merit Tracker Desktop has been installed on ${dto.machineName || 'your computer'}. Time tracking with screen capture is now available.`,
            { agentId: agent.id, platform: dto.platform },
        );

        return {
            agent: this.sanitizeAgent(agent),
            token: agentToken,
            config: await this.getAgentConfig(userId, companyId),
        };
    }

    // ============================================
    // VALIDATE AGENT TOKEN
    // ============================================
    async validateAgentToken(token: string): Promise<{ agent: any; user: any }> {
        const agent = await this.prisma.desktopAgent.findUnique({
            where: { agentToken: token },
            include: {
                user: {
                    include: {
                        company: { select: { id: true, screenCaptureEnabled: true } },
                    },
                },
            },
        });

        if (!agent) {
            throw new UnauthorizedException('Invalid agent token');
        }

        if (agent.tokenExpiresAt < new Date()) {
            throw new UnauthorizedException('Agent token has expired. Please re-authenticate.');
        }

        if (!agent.isActive) {
            throw new ForbiddenException('Agent has been deactivated');
        }

        if (!agent.user.isActive) {
            throw new ForbiddenException('User account is inactive');
        }

        return { agent, user: agent.user };
    }

    // ============================================
    // HEARTBEAT (keep-alive from agent)
    // ============================================
    async heartbeat(dto: HeartbeatDto) {
        const { agent } = await this.validateAgentToken(dto.agentToken);

        const updateData: any = {
            lastHeartbeat: new Date(),
            isOnline: true,
        };

        if (dto.agentVersion) {
            updateData.agentVersion = dto.agentVersion;
        }

        const updatedAgent = await this.prisma.desktopAgent.update({
            where: { id: agent.id },
            data: updateData,
            include: {
                user: {
                    include: {
                        company: { select: { id: true, screenCaptureEnabled: true } },
                    },
                },
            },
        });

        // Return current config
        return {
            status: 'ok',
            config: await this.getAgentConfig(agent.userId, agent.user.companyId),
        };
    }

    // ============================================
    // GET AGENT CONFIG
    // ============================================
    async getAgentConfig(userId: string, companyId: string): Promise<AgentConfigDto> {
        // Get company settings
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { screenCaptureEnabled: true },
        });

        // Get agent settings
        const agent = await this.prisma.desktopAgent.findFirst({
            where: { userId, isActive: true },
            orderBy: { lastHeartbeat: 'desc' },
        });

        // Get active time tracking
        const activeTracking = await this.prisma.timeTracking.findFirst({
            where: { userId, isActive: true },
            include: {
                subProject: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                screenCaptureEnabled: true,
                            },
                        },
                    },
                },
            },
        });

        return {
            userId,
            companyId,
            screenCaptureEnabled: company?.screenCaptureEnabled ?? true,
            captureQuality: agent?.captureQuality ?? 70,
            captureAllMonitors: agent?.captureAllMonitors ?? false,
            minIntervalSeconds: CAPTURE_MIN_INTERVAL_SECONDS,
            maxIntervalSeconds: CAPTURE_MAX_INTERVAL_SECONDS,
            activeTimeTracking: activeTracking
                ? {
                    id: activeTracking.id,
                    subProjectId: activeTracking.subProjectId,
                    subProjectTitle: activeTracking.subProject.title,
                    projectId: activeTracking.subProject.project.id,
                    projectName: activeTracking.subProject.project.name,
                    screenCaptureRequired: activeTracking.subProject.project.screenCaptureEnabled,
                    startTime: activeTracking.startTime,
                }
                : null,
            serverTime: new Date(),
        };
    }

    // ============================================
    // GET USER'S AGENTS
    // ============================================
    async getUserAgents(userId: string) {
        const agents = await this.prisma.desktopAgent.findMany({
            where: { userId },
            orderBy: { lastHeartbeat: 'desc' },
        });

        return agents.map((agent) => this.sanitizeAgent(agent));
    }

    // ============================================
    // GET AGENT BY ID
    // ============================================
    async getAgent(id: string, userId: string, userRole: UserRole) {
        const agent = await this.prisma.desktopAgent.findUnique({
            where: { id },
            include: {
                user: {
                    select: { id: true, firstName: true, lastName: true, companyId: true },
                },
            },
        });

        if (!agent) {
            throw new NotFoundException('Agent not found');
        }

        // Users can only see their own agents
        if (userRole === UserRole.USER && agent.userId !== userId) {
            throw new ForbiddenException('Access denied');
        }

        return this.sanitizeAgent(agent);
    }

    // ============================================
    // UPDATE AGENT SETTINGS
    // ============================================
    async updateAgent(id: string, dto: UpdateAgentDto, userId: string, userRole: UserRole) {
        const agent = await this.getAgent(id, userId, userRole);

        // Users can only update their own agents
        if (userRole === UserRole.USER && agent.userId !== userId) {
            throw new ForbiddenException('Access denied');
        }

        const updated = await this.prisma.desktopAgent.update({
            where: { id },
            data: dto,
        });

        return this.sanitizeAgent(updated);
    }

    // ============================================
    // DEACTIVATE AGENT
    // ============================================
    async deactivateAgent(id: string, userId: string, userRole: UserRole, companyId: string) {
        const agent = await this.prisma.desktopAgent.findUnique({
            where: { id },
            include: { user: { select: { companyId: true } } },
        });

        if (!agent) {
            throw new NotFoundException('Agent not found');
        }

        // Verify company access
        if (agent.user.companyId !== companyId) {
            throw new ForbiddenException('Access denied');
        }

        // Users can only deactivate their own agents, admins can deactivate any
        if (userRole === UserRole.USER && agent.userId !== userId) {
            throw new ForbiddenException('Access denied');
        }

        const updated = await this.prisma.desktopAgent.update({
            where: { id },
            data: {
                isActive: false,
                isOnline: false,
            },
        });

        await this.logAgentActivity(
            id,
            AgentActivityType.STOPPED,
            'Agent deactivated',
            { deactivatedBy: userId },
        );

        // Notify user if deactivated by admin
        if (agent.userId !== userId) {
            await this.sendNotification(
                agent.userId,
                NotificationType.SYSTEM,
                'Desktop Agent Deactivated',
                `Your desktop agent on ${agent.machineName || agent.machineId} has been deactivated by an administrator.`,
                { agentId: id },
            );
        }

        return this.sanitizeAgent(updated);
    }

    // ============================================
    // DELETE AGENT
    // ============================================
    async deleteAgent(id: string, userId: string, userRole: UserRole, companyId: string) {
        const agent = await this.prisma.desktopAgent.findUnique({
            where: { id },
            include: { user: { select: { companyId: true } } },
        });

        if (!agent) {
            throw new NotFoundException('Agent not found');
        }

        if (agent.user.companyId !== companyId) {
            throw new ForbiddenException('Access denied');
        }

        if (userRole === UserRole.USER && agent.userId !== userId) {
            throw new ForbiddenException('Access denied');
        }

        await this.prisma.desktopAgent.delete({ where: { id } });

        return { message: 'Agent deleted successfully' };
    }

    // ============================================
    // CHECK AGENT INSTALLATION STATUS
    // ============================================
    async checkAgentInstalled(userId: string): Promise<{
        installed: boolean;
        agents: any[];
        hasOnlineAgent: boolean;
    }> {
        const agents = await this.prisma.desktopAgent.findMany({
            where: { userId, isActive: true },
        });

        const hasOnlineAgent = agents.some((a) => a.isOnline);

        return {
            installed: agents.length > 0,
            agents: agents.map((a) => this.sanitizeAgent(a)),
            hasOnlineAgent,
        };
    }

    // ============================================
    // GET DOWNLOAD INFO
    // ============================================
    getDownloadInfo(platform?: Platform) {
        const downloads = [
            {
                platform: Platform.WINDOWS,
                version: CURRENT_AGENT_VERSIONS.WINDOWS,
                downloadUrl: AGENT_DOWNLOAD_URLS.WINDOWS,
                releaseDate: new Date('2024-01-15'),
                fileSize: 85 * 1024 * 1024, // 85MB
                checksum: 'sha256:abc123...', // Replace with actual checksum
                releaseNotes: 'Initial release with screen capture support.',
            },
            {
                platform: Platform.MAC,
                version: CURRENT_AGENT_VERSIONS.MAC,
                downloadUrl: AGENT_DOWNLOAD_URLS.MAC,
                releaseDate: new Date('2024-01-15'),
                fileSize: 78 * 1024 * 1024, // 78MB
                checksum: 'sha256:def456...',
                releaseNotes: 'Initial release with screen capture support.',
            },
            {
                platform: Platform.LINUX,
                version: CURRENT_AGENT_VERSIONS.LINUX,
                downloadUrl: AGENT_DOWNLOAD_URLS.LINUX,
                releaseDate: new Date('2024-01-15'),
                fileSize: 72 * 1024 * 1024, // 72MB
                checksum: 'sha256:ghi789...',
                releaseNotes: 'Initial release with screen capture support.',
            },
        ];

        if (platform) {
            return downloads.find((d) => d.platform === platform) || null;
        }

        return downloads;
    }

    // ============================================
    // UPDATE OFFLINE AGENTS (called by cron)
    // ============================================
    async markOfflineAgents() {
        const timeoutThreshold = new Date();
        timeoutThreshold.setMinutes(timeoutThreshold.getMinutes() - HEARTBEAT_TIMEOUT_MINUTES);

        const result = await this.prisma.desktopAgent.updateMany({
            where: {
                isOnline: true,
                lastHeartbeat: { lt: timeoutThreshold },
            },
            data: { isOnline: false },
        });

        if (result.count > 0) {
            console.log(`Marked ${result.count} agents as offline`);
        }

        return { markedOffline: result.count };
    }

    // ============================================
    // GET COMPANY AGENTS (admin view)
    // ============================================
    async getCompanyAgents(companyId: string, userRole: UserRole) {
        if (userRole === UserRole.USER) {
            throw new ForbiddenException('Access denied');
        }

        const agents = await this.prisma.desktopAgent.findMany({
            where: {
                user: { companyId },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                    },
                },
            },
            orderBy: { lastHeartbeat: 'desc' },
        });

        return agents.map((agent) => ({
            ...this.sanitizeAgent(agent),
            user: agent.user,
        }));
    }

    // ============================================
    // Helper: Remove sensitive data from agent
    // ============================================
    private sanitizeAgent(agent: any) {
        const { agentToken, ...safe } = agent;
        return safe;
    }
}