// src/modules/profile/profile.service.ts
import {
    Injectable,
    NotFoundException,
    BadRequestException,
    UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../email/email.service';
import { User, NotificationType, ActivityType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
    UpdateProfileDto,
    ChangePasswordDto,
    ProfileStatsDto,
    ActivitySummaryDto,
} from './dto/profile.dto';

@Injectable()
export class ProfileService {
    constructor(
        private prisma: PrismaService,
        private storageService: StorageService,
        private emailService: EmailService,
    ) { }

    // ============================================
    // GET FULL PROFILE
    // ============================================
    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                        tag: true,
                        lead: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                avatar: true,
                            },
                        },
                    },
                },
                company: {
                    select: {
                        id: true,
                        name: true,
                        logo: true,
                        companyCode: true,
                        subscriptionStatus: true,
                        screenCaptureEnabled: true,
                    },
                },
                // Get project memberships
                projectMemberships: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                status: true,
                            },
                        },
                    },
                },
                // Get subproject memberships
                subProjectMemberships: {
                    include: {
                        subProject: {
                            select: {
                                id: true,
                                title: true,
                                status: true,
                            },
                        },
                    },
                },
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Get achievements count separately (if Achievement model exists)
        let achievementsCount = 0;
        let recentAchievements: any[] = [];

        try {
            // Check if Achievement model exists and get data
            achievementsCount = await this.prisma.achievement.count({
                where: { userId },
            });

            recentAchievements = await this.prisma.achievement.findMany({
                where: { userId },
                orderBy: { earnedAt: 'desc' },
                take: 5,
                select: {
                    id: true,
                    type: true,
                    title: true,
                    description: true,
                    iconUrl: true,
                    earnedAt: true,
                },
            });
        } catch (error) {
            // Achievement model might not exist, continue without it
            console.log('Achievement model not available:', error.message);
        }

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        return {
            ...userWithoutPassword,
            // Add computed fields
            fullName: `${user.firstName} ${user.lastName}`,
            projectsCount: user.projectMemberships?.length || 0,
            subProjectsCount: user.subProjectMemberships?.length || 0,
            achievementsCount,
            achievements: recentAchievements,
        };
    }

    // ============================================
    // UPDATE PROFILE
    // ============================================
    async updateProfile(userId: string, updateDto: UpdateProfileDto) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Build update data
        const updateData: any = {};

        if (updateDto.firstName !== undefined) {
            updateData.firstName = updateDto.firstName.trim();
        }

        if (updateDto.lastName !== undefined) {
            updateData.lastName = updateDto.lastName.trim();
        }

        if (updateDto.phone !== undefined) {
            updateData.phone = updateDto.phone.trim() || null;
        }

        if (updateDto.startDate !== undefined) {
            updateData.startDate = new Date(updateDto.startDate);
        }

        // Update user
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: updateData,
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                        tag: true,
                    },
                },
                company: {
                    select: {
                        id: true,
                        name: true,
                        logo: true,
                        companyCode: true,
                    },
                },
            },
        });

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId: user.companyId,
                userId,
                activityType: ActivityType.USER_ROLE_CHANGED, // Using existing type for profile updates
                description: 'Updated profile information',
                metadata: {
                    updatedFields: Object.keys(updateData),
                },
            },
        });

        const { password: _, ...result } = updatedUser;
        return {
            ...result,
            fullName: `${result.firstName} ${result.lastName}`,
        };
    }

    // ============================================
    // CHANGE PASSWORD
    // ============================================
    async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
        const { currentPassword, newPassword, confirmPassword } = changePasswordDto;

        // Validate new password matches confirmation
        if (newPassword !== confirmPassword) {
            throw new BadRequestException('New password and confirmation do not match');
        }

        // Get user with password
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                password: true,
                firstName: true,
                companyId: true,
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            throw new UnauthorizedException('Current password is incorrect');
        }

        // Check if new password is same as current
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            throw new BadRequestException('New password must be different from current password');
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await this.prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId: user.companyId,
                userId,
                activityType: ActivityType.USER_LOGIN, // Using existing type
                description: 'Password changed successfully',
                metadata: {
                    action: 'password_change',
                },
            },
        });

        // Send notification to user
        await this.prisma.notification.create({
            data: {
                userId,
                type: NotificationType.SYSTEM,
                title: 'Password Changed',
                message:
                    'Your password has been changed successfully. If you did not make this change, please contact support immediately.',
                metadata: {
                    action: 'password_changed',
                    timestamp: new Date().toISOString(),
                },
            },
        });

        // Send email notification
        try {
            await this.emailService.sendPasswordChangedEmail(user.email, user.firstName);
        } catch (error) {
            console.error('Failed to send password change email:', error);
        }

        return {
            success: true,
            message: 'Password changed successfully',
        };
    }

    // ============================================
    // UPLOAD AVATAR
    // ============================================
    async uploadAvatar(userId: string, file: Express.Multer.File) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                avatar: true,
                companyId: true,
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Delete old avatar if exists
        if (user.avatar) {
            const oldPath = this.storageService.extractPathFromUrl(user.avatar);
            if (oldPath) {
                try {
                    await this.storageService.deleteFile(oldPath);
                } catch (error) {
                    console.error('Failed to delete old avatar:', error);
                }
            }
        }

        // Upload new avatar to Supabase
        const uploadResult = await this.storageService.uploadFile(
            file,
            user.companyId,
            'avatars',
            {
                maxSizeMB: 5,
                allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            },
        );

        // Update user avatar
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { avatar: uploadResult.url },
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                company: {
                    select: {
                        id: true,
                        name: true,
                        logo: true,
                    },
                },
            },
        });

        const { password: _, ...result } = updatedUser;

        return {
            success: true,
            message: 'Avatar uploaded successfully',
            avatar: uploadResult.url,
            user: result,
        };
    }

    // ============================================
    // DELETE AVATAR
    // ============================================
    async deleteAvatar(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                avatar: true,
                companyId: true,
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (!user.avatar) {
            throw new BadRequestException('No avatar to delete');
        }

        // Delete avatar from storage
        const avatarPath = this.storageService.extractPathFromUrl(user.avatar);
        if (avatarPath) {
            try {
                await this.storageService.deleteFile(avatarPath);
            } catch (error) {
                console.error('Failed to delete avatar from storage:', error);
            }
        }

        // Update user to remove avatar
        await this.prisma.user.update({
            where: { id: userId },
            data: { avatar: null },
        });

        return {
            success: true,
            message: 'Avatar deleted successfully',
        };
    }

    // ============================================
    // GET PROFILE STATS
    // ============================================
    async getProfileStats(userId: string): Promise<ProfileStatsDto> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                companyId: true,
                points: true,
                totalTasksCompleted: true,
                totalTimeTrackedMinutes: true,
                totalPointsEarned: true,
                currentStreak: true,
                longestStreak: true,
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Count projects
        const projectsCount = await this.prisma.projectMember.count({
            where: { userId },
        });

        // Count subprojects
        const subProjectsCount = await this.prisma.subProjectMember.count({
            where: { userId },
        });

        // Count achievements (with error handling)
        let achievementsCount = 0;
        try {
            achievementsCount = await this.prisma.achievement.count({
                where: { userId },
            });
        } catch (error) {
            // Achievement model might not exist
            console.log('Achievement model not available');
        }

        // Get leaderboard rank
        const usersWithMorePoints = await this.prisma.user.count({
            where: {
                companyId: user.companyId,
                isActive: true,
                points: { gt: user.points },
            },
        });
        const leaderboardRank = usersWithMorePoints + 1;

        return {
            totalTasksCompleted: user.totalTasksCompleted,
            totalTimeTrackedMinutes: user.totalTimeTrackedMinutes,
            totalTimeFormatted: this.formatDuration(user.totalTimeTrackedMinutes),
            totalPointsEarned: user.totalPointsEarned,
            currentStreak: user.currentStreak,
            longestStreak: user.longestStreak,
            projectsCount,
            subProjectsCount,
            achievementsCount,
            leaderboardRank,
        };
    }

    // ============================================
    // GET ACTIVITY SUMMARY (Last 30 days)
    // ============================================
    async getActivitySummary(userId: string, days: number = 30): Promise<ActivitySummaryDto[]> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        // Get time tracking data grouped by date
        const timeTrackings = await this.prisma.timeTracking.findMany({
            where: {
                userId,
                startTime: { gte: startDate },
                isActive: false,
            },
            select: {
                startTime: true,
                durationMinutes: true,
            },
        });

        // Get tasks completed grouped by date
        const tasksCompleted = await this.prisma.task.findMany({
            where: {
                assignedToId: userId,
                completedAt: { gte: startDate },
                status: 'COMPLETED',
            },
            select: {
                completedAt: true,
                pointsValue: true,
            },
        });

        // Build activity map
        const activityMap = new Map<string, ActivitySummaryDto>();

        // Initialize all days
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            activityMap.set(dateStr, {
                date: dateStr,
                minutesTracked: 0,
                tasksCompleted: 0,
                pointsEarned: 0,
            });
        }

        // Aggregate time tracking
        for (const tt of timeTrackings) {
            const dateStr = tt.startTime.toISOString().split('T')[0];
            const existing = activityMap.get(dateStr);
            if (existing) {
                existing.minutesTracked += tt.durationMinutes;
            }
        }

        // Aggregate tasks
        for (const task of tasksCompleted) {
            if (task.completedAt) {
                const dateStr = task.completedAt.toISOString().split('T')[0];
                const existing = activityMap.get(dateStr);
                if (existing) {
                    existing.tasksCompleted += 1;
                    existing.pointsEarned += task.pointsValue;
                }
            }
        }

        // Convert to array and sort by date descending
        return Array.from(activityMap.values()).sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
    }

    // ============================================
    // GET USER ACHIEVEMENTS
    // ============================================
    async getAchievements(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        try {
            const achievements = await this.prisma.achievement.findMany({
                where: { userId },
                orderBy: { earnedAt: 'desc' },
            });

            return {
                total: achievements.length,
                achievements,
            };
        } catch (error) {
            // Achievement model might not exist
            return {
                total: 0,
                achievements: [],
            };
        }
    }

    // ============================================
    // GET USER'S PROJECTS
    // ============================================
    async getMyProjects(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const projects = await this.prisma.project.findMany({
            where: {
                OR: [
                    { projectLeadId: userId },
                    { members: { some: { userId } } },
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
                _count: {
                    select: {
                        members: true,
                        subProjects: true,
                    },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        return projects;
    }

    // ============================================
    // GET USER'S RECENT TIME TRACKINGS
    // ============================================
    async getRecentTimeTrackings(userId: string, limit: number = 10) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const timeTrackings = await this.prisma.timeTracking.findMany({
            where: { userId },
            include: {
                subProject: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                _count: {
                    select: { screenCaptures: true },
                },
            },
            orderBy: { startTime: 'desc' },
            take: limit,
        });

        return timeTrackings.map((tt) => ({
            id: tt.id,
            startTime: tt.startTime,
            endTime: tt.endTime,
            durationMinutes: tt.durationMinutes,
            durationFormatted: this.formatDuration(tt.durationMinutes),
            notes: tt.notes,
            isActive: tt.isActive,
            subProject: {
                id: tt.subProject.id,
                title: tt.subProject.title,
            },
            project: tt.subProject.project,
            screenshotsCount: tt._count.screenCaptures,
        }));
    }

    // ============================================
    // GET USER'S NOTIFICATIONS
    // ============================================
    async getNotifications(userId: string, unreadOnly: boolean = false, limit: number = 20) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const whereClause: any = { userId };
        if (unreadOnly) {
            whereClause.isRead = false;
        }

        const notifications = await this.prisma.notification.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        const unreadCount = await this.prisma.notification.count({
            where: { userId, isRead: false },
        });

        return {
            notifications,
            unreadCount,
            total: notifications.length,
        };
    }

    // ============================================
    // MARK NOTIFICATIONS AS READ
    // ============================================
    async markNotificationsAsRead(userId: string, notificationIds?: string[]) {
        const whereClause: any = { userId };
        if (notificationIds && notificationIds.length > 0) {
            whereClause.id = { in: notificationIds };
        }

        const result = await this.prisma.notification.updateMany({
            where: whereClause,
            data: { isRead: true },
        });

        return {
            success: true,
            markedCount: result.count,
        };
    }

    // ============================================
    // HELPER: Format Duration
    // ============================================
    private formatDuration(minutes: number): string {
        if (minutes < 60) {
            return `${minutes}m`;
        }
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
}