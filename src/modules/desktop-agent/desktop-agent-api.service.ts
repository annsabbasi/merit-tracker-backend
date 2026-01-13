// src/modules/desktop-agent/desktop-agent-api.service.ts
import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    UnauthorizedException,
    ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
    UserRole,
    NotificationType,
    ActivityType,
    CaptureStatus,
} from '@prisma/client';

// Points configuration (same as time-tracking service)
const POINTS_CONFIG = {
    MINUTES_PER_POINT: 30,
    MAX_POINTS_PER_SESSION: 16,
    MIN_MINUTES_FOR_POINT: 15,
};

// Screenshot retention
const SCREENSHOT_RETENTION_DAYS = 60;

@Injectable()
export class DesktopAgentApiService {
    constructor(
        private prisma: PrismaService,
        private storageService: StorageService,
    ) { }

    // ============================================
    // HELPER: Validate Agent Token & Get User
    // ============================================
    async validateAgentToken(agentToken: string): Promise<{
        agent: any;
        user: any;
        company: any;
    }> {
        if (!agentToken) {
            throw new UnauthorizedException('Agent token required');
        }

        const agent = await this.prisma.desktopAgent.findUnique({
            where: { agentToken },
            include: {
                user: {
                    include: {
                        company: {
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

        if (!agent) {
            throw new UnauthorizedException('Invalid agent token');
        }

        if (agent.tokenExpiresAt < new Date()) {
            throw new UnauthorizedException('Agent token expired. Please sign in again.');
        }

        if (!agent.isActive) {
            throw new ForbiddenException('Agent has been deactivated');
        }

        if (!agent.user.isActive) {
            throw new ForbiddenException('User account is inactive');
        }

        return {
            agent,
            user: agent.user,
            company: agent.user.company,
        };
    }

    // ============================================
    // GET USER'S PROJECTS & SUBPROJECTS
    // ============================================
    async getMyProjects(agentToken: string) {
        const { user, company } = await this.validateAgentToken(agentToken);

        let projects: any[];

        // COMPANY role sees all projects, others see only their assigned projects
        if (user.role === UserRole.COMPANY) {
            // Company admin sees all projects
            projects = await this.prisma.project.findMany({
                where: { companyId: company.id },
                include: {
                    projectLead: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            avatar: true,
                        },
                    },
                    subProjects: {
                        include: {
                            qcHead: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    avatar: true,
                                },
                            },
                            members: {
                                include: {
                                    user: {
                                        select: {
                                            id: true,
                                            firstName: true,
                                            lastName: true,
                                            avatar: true,
                                        },
                                    },
                                },
                            },
                            _count: {
                                select: { tasks: true, members: true },
                            },
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                    _count: {
                        select: { members: true, subProjects: true },
                    },
                },
                orderBy: { updatedAt: 'desc' },
            });
        } else {
            // USER, QC_ADMIN, etc. - only see projects where they are a member
            projects = await this.prisma.project.findMany({
                where: {
                    companyId: company.id,
                    OR: [
                        { projectLeadId: user.id },
                        { members: { some: { userId: user.id } } },
                    ],
                },
                include: {
                    projectLead: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            avatar: true,
                        },
                    },
                    subProjects: {
                        where: {
                            OR: [
                                { createdById: user.id },
                                { qcHeadId: user.id },
                                { members: { some: { userId: user.id } } },
                            ],
                        },
                        include: {
                            qcHead: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    avatar: true,
                                },
                            },
                            members: {
                                include: {
                                    user: {
                                        select: {
                                            id: true,
                                            firstName: true,
                                            lastName: true,
                                            avatar: true,
                                        },
                                    },
                                },
                            },
                            _count: {
                                select: { tasks: true, members: true },
                            },
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                    _count: {
                        select: { members: true, subProjects: true },
                    },
                },
                orderBy: { updatedAt: 'desc' },
            });
        }

        // Transform data for desktop app
        return {
            projects: projects.map((project) => ({
                id: project.id,
                name: project.name,
                description: project.description,
                status: project.status,
                screenCaptureEnabled: project.screenCaptureEnabled,
                projectLead: project.projectLead,
                memberCount: project._count.members,
                subProjectCount: project._count.subProjects,
                subProjects: project.subProjects.map((sp: any) => ({
                    id: sp.id,
                    title: sp.title,
                    description: sp.description,
                    status: sp.status,
                    priority: sp.priority,
                    qcHead: sp.qcHead,
                    memberCount: sp._count.members,
                    taskCount: sp._count.tasks,
                })),
            })),
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
            },
            company: {
                id: company.id,
                name: company.name,
                screenCaptureEnabled: company.screenCaptureEnabled,
            },
        };
    }

    // ============================================
    // START TIME TRACKING
    // ============================================
    async startTimeTracking(
        agentToken: string,
        subProjectId: string,
        notes?: string,
    ) {
        const { user, company, agent } = await this.validateAgentToken(agentToken);

        // Get subproject with project info
        const subProject = await this.prisma.subProject.findFirst({
            where: {
                id: subProjectId,
                project: { companyId: company.id },
            },
            include: {
                project: {
                    include: {
                        members: true,
                        company: { select: { screenCaptureEnabled: true } },
                    },
                },
                members: true,
            },
        });

        if (!subProject) {
            throw new NotFoundException('SubProject not found');
        }

        // Check if user has access to this subproject
        if (user.role !== UserRole.COMPANY) {
            const isMember =
                subProject.project.members.some((m) => m.userId === user.id) ||
                subProject.project.projectLeadId === user.id ||
                subProject.members.some((m) => m.userId === user.id) ||
                subProject.qcHeadId === user.id ||
                subProject.createdById === user.id;

            if (!isMember) {
                throw new ForbiddenException('You do not have access to this subproject');
            }
        }

        // Check for existing active timer
        const activeTimer = await this.prisma.timeTracking.findFirst({
            where: { userId: user.id, isActive: true },
            include: {
                subProject: {
                    include: {
                        project: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (activeTimer) {
            throw new ConflictException({
                message: 'You already have an active timer',
                activeTimer: {
                    id: activeTimer.id,
                    subProjectId: activeTimer.subProjectId,
                    subProjectTitle: activeTimer.subProject.title,
                    projectId: activeTimer.subProject.project.id,
                    projectName: activeTimer.subProject.project.name,
                    startTime: activeTimer.startTime,
                },
            });
        }

        // Check screen capture requirements
        const screenCaptureRequired =
            subProject.project.company.screenCaptureEnabled &&
            subProject.project.screenCaptureEnabled;

        if (screenCaptureRequired && !agent.isOnline) {
            throw new BadRequestException({
                code: 'AGENT_OFFLINE',
                message: 'Your desktop agent must be online to track time on this project.',
            });
        }

        // Create time tracking entry
        const timeTracking = await this.prisma.timeTracking.create({
            data: {
                userId: user.id,
                subProjectId,
                startTime: new Date(),
                notes,
                isActive: true,
                screenCaptureRequired,
            },
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

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId: company.id,
                userId: user.id,
                activityType: ActivityType.TIME_TRACKING_START,
                description: `Started tracking time on "${subProject.title}" via desktop agent`,
                metadata: {
                    timeTrackingId: timeTracking.id,
                    subProjectId,
                    projectId: subProject.project.id,
                    screenCaptureRequired,
                    source: 'desktop-agent',
                },
            },
        });

        return {
            id: timeTracking.id,
            subProjectId: timeTracking.subProjectId,
            subProjectTitle: timeTracking.subProject.title,
            projectId: timeTracking.subProject.project.id,
            projectName: timeTracking.subProject.project.name,
            startTime: timeTracking.startTime,
            screenCaptureRequired,
            message: screenCaptureRequired
                ? 'Time tracking started. Screen capture is active.'
                : 'Time tracking started.',
        };
    }

    // ============================================
    // STOP TIME TRACKING
    // ============================================
    async stopTimeTracking(agentToken: string, timeTrackingId?: string, notes?: string) {
        const { user, company } = await this.validateAgentToken(agentToken);

        // Find active timer
        let timeTracking: any;

        if (timeTrackingId) {
            timeTracking = await this.prisma.timeTracking.findFirst({
                where: {
                    id: timeTrackingId,
                    userId: user.id,
                    isActive: true,
                },
                include: {
                    subProject: {
                        include: {
                            project: { select: { id: true, name: true, companyId: true } },
                        },
                    },
                    screenCaptures: {
                        where: { isDeleted: false },
                        select: { id: true, intervalMinutes: true },
                    },
                },
            });
        } else {
            // Find any active timer for this user
            timeTracking = await this.prisma.timeTracking.findFirst({
                where: {
                    userId: user.id,
                    isActive: true,
                },
                include: {
                    subProject: {
                        include: {
                            project: { select: { id: true, name: true, companyId: true } },
                        },
                    },
                    screenCaptures: {
                        where: { isDeleted: false },
                        select: { id: true, intervalMinutes: true },
                    },
                },
            });
        }

        if (!timeTracking) {
            throw new NotFoundException('No active time tracking session found');
        }

        const endTime = new Date();
        const rawDurationMinutes = Math.floor(
            (endTime.getTime() - timeTracking.startTime.getTime()) / 1000 / 60,
        );

        // Calculate effective duration
        const durationMinutes = Math.max(0, rawDurationMinutes - timeTracking.timeDeducted);
        const pointsEarned = this.calculatePoints(durationMinutes);

        // Update time tracking
        const result = await this.prisma.$transaction(async (prisma) => {
            const updated = await prisma.timeTracking.update({
                where: { id: timeTracking.id },
                data: {
                    endTime,
                    durationMinutes,
                    isActive: false,
                    notes: notes || timeTracking.notes,
                },
            });

            let newTotalPoints = user.points;

            if (pointsEarned > 0) {
                const updatedUser = await prisma.user.update({
                    where: { id: user.id },
                    data: { points: { increment: pointsEarned } },
                });
                newTotalPoints = updatedUser.points;

                await prisma.projectMember.updateMany({
                    where: {
                        projectId: timeTracking.subProject.projectId,
                        userId: user.id,
                    },
                    data: { pointsEarned: { increment: pointsEarned } },
                });
            }

            return { updated, pointsEarned, newTotalPoints };
        });

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId: company.id,
                userId: user.id,
                activityType: ActivityType.TIME_TRACKING_END,
                description: `Tracked ${this.formatDuration(durationMinutes)} on "${timeTracking.subProject.title}" via desktop agent`,
                metadata: {
                    timeTrackingId: timeTracking.id,
                    durationMinutes,
                    pointsEarned,
                    screenshotsCount: timeTracking.screenCaptures.length,
                    source: 'desktop-agent',
                },
            },
        });

        return {
            id: timeTracking.id,
            subProjectId: timeTracking.subProjectId,
            subProjectTitle: timeTracking.subProject.title,
            projectId: timeTracking.subProject.project.id,
            projectName: timeTracking.subProject.project.name,
            startTime: timeTracking.startTime,
            endTime,
            durationMinutes,
            durationFormatted: this.formatDuration(durationMinutes),
            pointsEarned: result.pointsEarned,
            totalPoints: result.newTotalPoints,
            screenshotsCount: timeTracking.screenCaptures.length,
        };
    }

    // ============================================
    // GET ACTIVE TIME TRACKING
    // ============================================
    async getActiveTimeTracking(agentToken: string) {
        const { user } = await this.validateAgentToken(agentToken);

        const activeTimer = await this.prisma.timeTracking.findFirst({
            where: { userId: user.id, isActive: true },
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
                screenCaptures: {
                    where: { isDeleted: false },
                    orderBy: { capturedAt: 'desc' },
                    take: 5,
                    select: {
                        id: true,
                        fileUrl: true,
                        capturedAt: true,
                        intervalMinutes: true,
                    },
                },
            },
        });

        if (!activeTimer) {
            return { active: false, timer: null };
        }

        const elapsedMinutes = Math.floor(
            (new Date().getTime() - activeTimer.startTime.getTime()) / 1000 / 60,
        );

        return {
            active: true,
            timer: {
                id: activeTimer.id,
                subProjectId: activeTimer.subProjectId,
                subProjectTitle: activeTimer.subProject.title,
                projectId: activeTimer.subProject.project.id,
                projectName: activeTimer.subProject.project.name,
                startTime: activeTimer.startTime,
                elapsedMinutes,
                elapsedFormatted: this.formatDuration(elapsedMinutes),
                potentialPoints: this.calculatePoints(elapsedMinutes),
                screenCaptureRequired: activeTimer.screenCaptureRequired,
                screenCaptureEnabled: activeTimer.subProject.project.screenCaptureEnabled,
                recentScreenshots: activeTimer.screenCaptures,
                screenshotsCount: activeTimer.screenCaptures.length,
                timeDeducted: activeTimer.timeDeducted,
            },
        };
    }

    // ============================================
    // UPLOAD SCREENSHOT (Agent Authenticated) - Uses Supabase Storage
    // ============================================
    async uploadScreenshot(
        agentToken: string,
        file: Express.Multer.File,
        timeTrackingId: string,
        capturedAt: string,
        screenWidth?: number,
        screenHeight?: number,
        monitorIndex?: number,
        checksum?: string,
    ) {
        const { user, company } = await this.validateAgentToken(agentToken);

        // Verify time tracking session
        const timeTracking = await this.prisma.timeTracking.findFirst({
            where: {
                id: timeTrackingId,
                userId: user.id,
                isActive: true,
            },
            include: {
                subProject: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                screenCaptureEnabled: true,
                                companyId: true,
                            },
                        },
                    },
                },
            },
        });

        if (!timeTracking) {
            throw new NotFoundException('Active time tracking session not found');
        }

        if (timeTracking.subProject.project.companyId !== company.id) {
            throw new ForbiddenException('Access denied');
        }

        if (!timeTracking.subProject.project.screenCaptureEnabled) {
            throw new BadRequestException('Screen capture is not enabled for this project');
        }

        // Upload to Supabase using StorageService
        const uploadResult = await this.storageService.uploadScreenshot(
            file,
            company.id,
            user.id,
            timeTrackingId,
        );

        // Get previous screenshot for interval calculation
        const previousScreenshot = await this.prisma.screenshot.findFirst({
            where: {
                timeTrackingId,
                isDeleted: false,
            },
            orderBy: { capturedAt: 'desc' },
        });

        const capturedAtDate = new Date(capturedAt);
        const intervalStart = previousScreenshot
            ? previousScreenshot.capturedAt
            : timeTracking.startTime;
        const intervalMinutes = Math.floor(
            (capturedAtDate.getTime() - intervalStart.getTime()) / 1000 / 60,
        );

        // Calculate expiry date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + SCREENSHOT_RETENTION_DAYS);

        // Create screenshot record with Supabase URL
        const screenshot = await this.prisma.screenshot.create({
            data: {
                timeTrackingId,
                userId: user.id,
                filePath: uploadResult.path,      // Supabase path
                fileUrl: uploadResult.url,        // Supabase public URL
                fileSize: uploadResult.size,
                capturedAt: capturedAtDate,
                intervalStart,
                intervalEnd: capturedAtDate,
                intervalMinutes,
                screenWidth: screenWidth || 1920,
                screenHeight: screenHeight || 1080,
                monitorIndex: monitorIndex || 0,
                checksum: checksum || '',
                captureStatus: CaptureStatus.SUCCESS,
                expiresAt,
            },
        });

        // Update previous screenshot's intervalEnd
        if (previousScreenshot) {
            await this.prisma.screenshot.update({
                where: { id: previousScreenshot.id },
                data: { intervalEnd: capturedAtDate },
            });
        }

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId: company.id,
                userId: user.id,
                activityType: ActivityType.SCREENSHOT_CAPTURED,
                description: `Screenshot captured for "${timeTracking.subProject.title}"`,
                metadata: {
                    screenshotId: screenshot.id,
                    timeTrackingId,
                    intervalMinutes,
                    supabasePath: uploadResult.path,
                },
            },
        });

        return {
            id: screenshot.id,
            fileUrl: screenshot.fileUrl,
            filePath: screenshot.filePath,
            capturedAt: screenshot.capturedAt,
            intervalMinutes: screenshot.intervalMinutes,
        };
    }

    // ============================================
    // REPORT FAILED CAPTURE
    // ============================================
    async reportFailedCapture(
        agentToken: string,
        timeTrackingId: string,
        status: CaptureStatus,
        attemptedAt: string,
        errorMessage?: string,
    ) {
        const { user, company } = await this.validateAgentToken(agentToken);

        // Verify time tracking session
        const timeTracking = await this.prisma.timeTracking.findFirst({
            where: {
                id: timeTrackingId,
                userId: user.id,
                isActive: true,
            },
        });

        if (!timeTracking) {
            throw new NotFoundException('Active time tracking session not found');
        }

        const attemptedAtDate = new Date(attemptedAt);

        // Get previous screenshot for interval
        const previousScreenshot = await this.prisma.screenshot.findFirst({
            where: {
                timeTrackingId,
                isDeleted: false,
            },
            orderBy: { capturedAt: 'desc' },
        });

        const intervalStart = previousScreenshot
            ? previousScreenshot.capturedAt
            : timeTracking.startTime;
        const intervalMinutes = Math.floor(
            (attemptedAtDate.getTime() - intervalStart.getTime()) / 1000 / 60,
        );

        // Calculate expiry
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + SCREENSHOT_RETENTION_DAYS);

        // Create failed capture record
        const screenshot = await this.prisma.screenshot.create({
            data: {
                timeTrackingId,
                userId: user.id,
                filePath: '',
                fileUrl: '',
                fileSize: 0,
                capturedAt: attemptedAtDate,
                intervalStart,
                intervalEnd: attemptedAtDate,
                intervalMinutes,
                captureStatus: status,
                expiresAt,
            },
        });

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId: company.id,
                userId: user.id,
                activityType: ActivityType.SCREENSHOT_CAPTURED,
                description: `Screenshot capture failed: ${status}`,
                metadata: {
                    screenshotId: screenshot.id,
                    timeTrackingId,
                    status,
                    errorMessage,
                },
            },
        });

        return {
            id: screenshot.id,
            status,
            recorded: true,
        };
    }

    // ============================================
    // GET RECENT SCREENSHOTS
    // ============================================
    async getRecentScreenshots(agentToken: string, limit: number = 10) {
        const { user, company } = await this.validateAgentToken(agentToken);

        const screenshots = await this.prisma.screenshot.findMany({
            where: {
                userId: user.id,
                isDeleted: false,
                captureStatus: CaptureStatus.SUCCESS,
                timeTracking: {
                    subProject: {
                        project: { companyId: company.id },
                    },
                },
            },
            orderBy: { capturedAt: 'desc' },
            take: limit,
            select: {
                id: true,
                fileUrl: true,
                capturedAt: true,
                intervalMinutes: true,
                timeTracking: {
                    select: {
                        subProject: {
                            select: {
                                title: true,
                                project: {
                                    select: { name: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        return screenshots.map((s) => ({
            id: s.id,
            fileUrl: s.fileUrl,
            capturedAt: s.capturedAt,
            intervalMinutes: s.intervalMinutes,
            subProjectTitle: s.timeTracking.subProject.title,
            projectName: s.timeTracking.subProject.project.name,
        }));
    }

    // ============================================
    // HELPER: Calculate Points
    // ============================================
    private calculatePoints(durationMinutes: number): number {
        if (durationMinutes < POINTS_CONFIG.MIN_MINUTES_FOR_POINT) return 0;
        return Math.min(
            Math.floor(durationMinutes / POINTS_CONFIG.MINUTES_PER_POINT),
            POINTS_CONFIG.MAX_POINTS_PER_SESSION,
        );
    }

    // ============================================
    // HELPER: Format Duration
    // ============================================
    private formatDuration(minutes: number): string {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours === 0 ? `${mins}m` : `${hours}h ${mins}m`;
    }
}