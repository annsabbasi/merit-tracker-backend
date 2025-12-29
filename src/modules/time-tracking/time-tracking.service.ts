// src/modules/time-tracking/time-tracking.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, NotificationType } from '@prisma/client';
import { StartTimeTrackingDto, StopTimeTrackingDto, UpdateTimeTrackingDto, AddScreenshotDto, TimeTrackingQueryDto, ManualTimeEntryDto } from './dto/time-tracking.dto';

const POINTS_CONFIG = {
    MINUTES_PER_POINT: 30,
    MAX_POINTS_PER_SESSION: 16,
    MIN_MINUTES_FOR_POINT: 15,
    MILESTONE_HOURS: [10, 50, 100, 500, 1000], // Hours milestones for achievements
};

@Injectable()
export class TimeTrackingService {
    constructor(private prisma: PrismaService) { }

    // ============================================
    // Helper: Send notification
    // ============================================
    private async sendNotification(
        userId: string,
        type: NotificationType,
        title: string,
        message: string,
        metadata?: Record<string, any>
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
    // START TRACKING
    // ============================================
    async start(dto: StartTimeTrackingDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const subProject = await this.prisma.subProject.findFirst({
            where: { id: dto.subProjectId, project: { companyId } },
            include: {
                project: {
                    include: {
                        members: true,
                        projectLead: { select: { id: true, firstName: true, lastName: true } },
                    },
                },
            },
        });

        if (!subProject) throw new NotFoundException('Task not found');

        const isMember = subProject.project.members.some((m) => m.userId === currentUserId);
        const isProjectLead = subProject.project.projectLeadId === currentUserId;
        const isAdmin = currentUserRole === UserRole.COMPANY_ADMIN || currentUserRole === UserRole.QC_ADMIN;

        if (!isMember && !isProjectLead && !isAdmin) {
            throw new ForbiddenException('You must be a member of this project');
        }

        const activeTimer = await this.prisma.timeTracking.findFirst({
            where: { userId: currentUserId, isActive: true },
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
                    elapsedMinutes: this.calculateElapsedMinutes(activeTimer.startTime),
                },
            });
        }

        const timeTracking = await this.prisma.timeTracking.create({
            data: {
                userId: currentUserId,
                subProjectId: dto.subProjectId,
                startTime: new Date(),
                notes: dto.notes,
                isActive: true,
            },
            include: {
                subProject: {
                    include: {
                        project: { select: { id: true, name: true } },
                    },
                },
                user: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId,
                userId: currentUserId,
                activityType: 'TIME_TRACKING_START',
                description: `Started tracking time on task "${subProject.title}"`,
                metadata: {
                    taskId: subProject.id,
                    taskTitle: subProject.title,
                    projectId: subProject.project.id,
                    projectName: subProject.project.name,
                },
            },
        });

        return timeTracking;
    }

    // ============================================
    // STOP TRACKING
    // ============================================
    async stop(id: string, dto: StopTimeTrackingDto, currentUserId: string) {
        const timeTracking = await this.prisma.timeTracking.findFirst({
            where: { id, userId: currentUserId, isActive: true },
            include: {
                subProject: {
                    include: {
                        project: { select: { id: true, name: true, companyId: true } },
                    },
                },
                user: { select: { id: true, firstName: true, lastName: true, points: true } },
            },
        });

        if (!timeTracking) throw new NotFoundException('Active session not found');

        const endTime = new Date();
        const durationMinutes = this.calculateElapsedMinutes(timeTracking.startTime, endTime);
        const pointsEarned = this.calculatePoints(durationMinutes);

        const result = await this.prisma.$transaction(async (prisma) => {
            const updated = await prisma.timeTracking.update({
                where: { id },
                data: {
                    endTime,
                    durationMinutes,
                    isActive: false,
                    notes: dto.notes || timeTracking.notes,
                },
                include: {
                    subProject: {
                        include: {
                            project: { select: { id: true, name: true } },
                        },
                    },
                },
            });

            let newTotalPoints = timeTracking.user.points;

            if (pointsEarned > 0) {
                const updatedUser = await prisma.user.update({
                    where: { id: currentUserId },
                    data: { points: { increment: pointsEarned } },
                });
                newTotalPoints = updatedUser.points;

                await prisma.projectMember.updateMany({
                    where: { projectId: timeTracking.subProject.projectId, userId: currentUserId },
                    data: { pointsEarned: { increment: pointsEarned } },
                });
            }

            return { updated, pointsEarned, newTotalPoints };
        });

        // ============================================
        // SEND NOTIFICATIONS
        // ============================================

        // Notify about points earned
        if (pointsEarned > 0) {
            await this.sendNotification(
                currentUserId,
                NotificationType.SYSTEM,
                'Points Earned! 🎉',
                `You earned ${pointsEarned} points for tracking ${this.formatDuration(durationMinutes)} on "${timeTracking.subProject.title}".`,
                {
                    taskId: timeTracking.subProjectId,
                    taskTitle: timeTracking.subProject.title,
                    pointsEarned,
                    totalPoints: result.newTotalPoints,
                    duration: durationMinutes,
                }
            );
        }

        // Check for milestone achievements
        await this.checkMilestones(currentUserId, timeTracking.subProject.project.companyId);

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId: timeTracking.subProject.project.companyId,
                userId: currentUserId,
                activityType: 'TIME_TRACKING_END',
                description: `Tracked ${this.formatDuration(durationMinutes)} on task "${timeTracking.subProject.title}"`,
                metadata: {
                    taskId: timeTracking.subProjectId,
                    taskTitle: timeTracking.subProject.title,
                    projectId: timeTracking.subProject.project.id,
                    projectName: timeTracking.subProject.project.name,
                    durationMinutes,
                    pointsEarned,
                },
            },
        });

        return { ...result.updated, pointsEarned };
    }

    // ============================================
    // CHECK MILESTONES
    // ============================================
    private async checkMilestones(userId: string, companyId: string) {
        const totalTime = await this.prisma.timeTracking.aggregate({
            where: { userId, isActive: false },
            _sum: { durationMinutes: true },
        });

        const totalHours = Math.floor((totalTime._sum.durationMinutes || 0) / 60);

        for (const milestone of POINTS_CONFIG.MILESTONE_HOURS) {
            if (totalHours >= milestone) {
                // Check if milestone already achieved
                const existingNotification = await this.prisma.notification.findFirst({
                    where: {
                        userId,
                        type: NotificationType.SYSTEM,
                        metadata: {
                            path: ['milestoneHours'],
                            equals: milestone,
                        },
                    },
                });

                if (!existingNotification) {
                    await this.sendNotification(
                        userId,
                        NotificationType.SYSTEM,
                        `🏆 ${milestone} Hours Milestone!`,
                        `Congratulations! You've tracked over ${milestone} hours of work. Keep up the great work!`,
                        {
                            milestoneHours: milestone,
                            totalHours,
                            achievement: `${milestone}_HOURS_TRACKED`,
                        }
                    );
                }
            }
        }
    }

    // ============================================
    // STOP ACTIVE (cross-device)
    // ============================================
    async stopActive(dto: StopTimeTrackingDto, currentUserId: string) {
        const activeTimer = await this.prisma.timeTracking.findFirst({
            where: { userId: currentUserId, isActive: true },
        });

        if (!activeTimer) throw new NotFoundException('No active timer found');

        return this.stop(activeTimer.id, dto, currentUserId);
    }

    // ============================================
    // GET ACTIVE TIMER
    // ============================================
    async getActiveTimer(currentUserId: string) {
        const activeTimer = await this.prisma.timeTracking.findFirst({
            where: { userId: currentUserId, isActive: true },
            include: {
                subProject: {
                    include: {
                        project: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!activeTimer) return { active: false, timer: null };

        const elapsedMinutes = this.calculateElapsedMinutes(activeTimer.startTime);

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
                notes: activeTimer.notes,
                screenshots: activeTimer.screenshots,
                potentialPoints: this.calculatePoints(elapsedMinutes),
            },
        };
    }

    // ============================================
    // FIND ALL
    // ============================================
    async findAll(query: TimeTrackingQueryDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const where: any = { subProject: { project: { companyId } } };

        if (currentUserRole === UserRole.USER) {
            where.userId = currentUserId;
        } else if (query.userId) {
            where.userId = query.userId;
        }

        if (query.subProjectId) where.subProjectId = query.subProjectId;
        if (query.activeOnly) where.isActive = true;
        if (query.startDate) where.startTime = { gte: new Date(query.startDate) };
        if (query.endDate) where.startTime = { ...where.startTime, lte: new Date(query.endDate) };

        return this.prisma.timeTracking.findMany({
            where,
            include: {
                user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                subProject: {
                    include: {
                        project: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { startTime: 'desc' },
            take: 100,
        });
    }

    // ============================================
    // FIND ONE
    // ============================================
    async findOne(id: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const timeTracking = await this.prisma.timeTracking.findFirst({
            where: { id, subProject: { project: { companyId } } },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                subProject: {
                    include: {
                        project: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!timeTracking) throw new NotFoundException('Time tracking entry not found');

        if (currentUserRole === UserRole.USER && timeTracking.userId !== currentUserId) {
            throw new ForbiddenException('Access denied');
        }

        return timeTracking;
    }

    // ============================================
    // UPDATE
    // ============================================
    async update(id: string, dto: UpdateTimeTrackingDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const timeTracking = await this.findOne(id, currentUserId, currentUserRole, companyId);

        if (timeTracking.userId !== currentUserId && currentUserRole === UserRole.USER) {
            throw new ForbiddenException('You can only update your own entries');
        }

        return this.prisma.timeTracking.update({
            where: { id },
            data: dto,
        });
    }

    // ============================================
    // ADD SCREENSHOT
    // ============================================
    async addScreenshot(id: string, dto: AddScreenshotDto, currentUserId: string) {
        const timeTracking = await this.prisma.timeTracking.findFirst({
            where: { id, userId: currentUserId, isActive: true },
        });

        if (!timeTracking) throw new NotFoundException('Active session not found');

        return this.prisma.timeTracking.update({
            where: { id },
            data: { screenshots: { push: dto.screenshotUrl } },
        });
    }

    // ============================================
    // CREATE MANUAL ENTRY
    // ============================================
    async createManualEntry(dto: ManualTimeEntryDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        if (currentUserRole === UserRole.USER) {
            throw new ForbiddenException('Only admins can create manual entries');
        }

        const startTime = new Date(dto.startTime);
        const endTime = new Date(dto.endTime);

        if (endTime <= startTime) {
            throw new BadRequestException('End time must be after start time');
        }

        const durationMinutes = this.calculateElapsedMinutes(startTime, endTime);

        const subProject = await this.prisma.subProject.findFirst({
            where: { id: dto.subProjectId, project: { companyId } },
            include: {
                project: { select: { id: true, name: true } },
            },
        });

        if (!subProject) throw new NotFoundException('Task not found');

        const entry = await this.prisma.timeTracking.create({
            data: {
                userId: dto.userId || currentUserId,
                subProjectId: dto.subProjectId,
                startTime,
                endTime,
                durationMinutes,
                notes: dto.notes,
                isActive: false,
            },
            include: { subProject: true },
        });

        // Notify the user if entry was created for them
        if (dto.userId && dto.userId !== currentUserId) {
            await this.sendNotification(
                dto.userId,
                NotificationType.SYSTEM,
                'Manual Time Entry Added',
                `A manual time entry of ${this.formatDuration(durationMinutes)} was added for task "${subProject.title}".`,
                {
                    taskId: subProject.id,
                    taskTitle: subProject.title,
                    projectId: subProject.project.id,
                    projectName: subProject.project.name,
                    duration: durationMinutes,
                    addedBy: currentUserId,
                }
            );
        }

        return entry;
    }

    // ============================================
    // DELETE
    // ============================================
    async delete(id: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const timeTracking = await this.findOne(id, currentUserId, currentUserRole, companyId);

        if (timeTracking.userId !== currentUserId && currentUserRole === UserRole.USER) {
            throw new ForbiddenException('You can only delete your own entries');
        }

        await this.prisma.timeTracking.delete({ where: { id } });

        return { message: 'Time tracking entry deleted' };
    }

    // ============================================
    // USER SUMMARY
    // ============================================
    async getUserSummary(userId: string, companyId: string) {
        const where = { userId, isActive: false, subProject: { project: { companyId } } };

        const [entries, totals] = await Promise.all([
            this.prisma.timeTracking.findMany({
                where,
                include: {
                    subProject: {
                        include: {
                            project: { select: { id: true, name: true } },
                        },
                    },
                },
                orderBy: { startTime: 'desc' },
            }),
            this.prisma.timeTracking.aggregate({
                where,
                _sum: { durationMinutes: true },
                _count: true,
            }),
        ]);

        const totalMinutes = totals._sum.durationMinutes || 0;

        return {
            entries,
            summary: {
                totalSessions: totals._count,
                totalMinutes,
                totalHours: Math.round(totalMinutes / 60 * 100) / 100,
                totalFormatted: this.formatDuration(totalMinutes),
            },
        };
    }

    // ============================================
    // PROJECT SUMMARY
    // ============================================
    async getProjectSummary(projectId: string, companyId: string) {
        const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
        if (!project) throw new NotFoundException('Project not found');

        const [byUser, byTask, totals] = await Promise.all([
            this.prisma.timeTracking.groupBy({
                by: ['userId'],
                where: { subProject: { projectId }, isActive: false },
                _sum: { durationMinutes: true },
                _count: true,
            }),
            this.prisma.timeTracking.groupBy({
                by: ['subProjectId'],
                where: { subProject: { projectId }, isActive: false },
                _sum: { durationMinutes: true },
                _count: true,
            }),
            this.prisma.timeTracking.aggregate({
                where: { subProject: { projectId }, isActive: false },
                _sum: { durationMinutes: true },
                _count: true,
            }),
        ]);

        const userIds = byUser.map((u) => u.userId);
        const taskIds = byTask.map((t) => t.subProjectId);

        const [users, tasks] = await Promise.all([
            this.prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, firstName: true, lastName: true, avatar: true },
            }),
            this.prisma.subProject.findMany({
                where: { id: { in: taskIds } },
                select: { id: true, title: true },
            }),
        ]);

        const totalMinutes = totals._sum.durationMinutes || 0;

        return {
            projectId,
            summary: {
                totalSessions: totals._count,
                totalMinutes,
                totalHours: Math.round(totalMinutes / 60 * 100) / 100,
                totalFormatted: this.formatDuration(totalMinutes),
            },
            byUser: byUser.map((u) => ({
                user: users.find((usr) => usr.id === u.userId),
                sessions: u._count,
                totalMinutes: u._sum.durationMinutes || 0,
                totalHours: Math.round((u._sum.durationMinutes || 0) / 60 * 100) / 100,
            })),
            byTask: byTask.map((t) => ({
                task: tasks.find((tsk) => tsk.id === t.subProjectId),
                sessions: t._count,
                totalMinutes: t._sum.durationMinutes || 0,
                totalHours: Math.round((t._sum.durationMinutes || 0) / 60 * 100) / 100,
            })),
        };
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    private calculateElapsedMinutes(startTime: Date, endTime?: Date): number {
        return Math.floor(((endTime || new Date()).getTime() - new Date(startTime).getTime()) / 1000 / 60);
    }

    private calculatePoints(durationMinutes: number): number {
        if (durationMinutes < POINTS_CONFIG.MIN_MINUTES_FOR_POINT) return 0;
        return Math.min(
            Math.floor(durationMinutes / POINTS_CONFIG.MINUTES_PER_POINT),
            POINTS_CONFIG.MAX_POINTS_PER_SESSION
        );
    }

    private formatDuration(minutes: number): string {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours === 0 ? `${mins}m` : `${hours}h ${mins}m`;
    }
}