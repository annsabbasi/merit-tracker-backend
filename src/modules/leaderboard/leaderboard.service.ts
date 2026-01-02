// src/modules/leaderboard/leaderboard.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeaderboardPeriod, NotificationType, AchievementType } from '@prisma/client';
import { LeaderboardQueryDto, UserPerformanceQueryDto } from './dto/leaderboard.dto';

// Performance score weights
const PERFORMANCE_WEIGHTS = {
    TASKS_COMPLETED: 0.35,      // 35% weight for tasks completed
    TIME_TRACKED: 0.25,         // 25% weight for time tracked
    POINTS_EARNED: 0.20,        // 20% weight for points earned
    SUBPROJECTS_CONTRIBUTED: 0.10, // 10% weight for subproject participation
    PROJECTS_CONTRIBUTED: 0.05,    // 5% weight for project participation
    STREAK_BONUS: 0.05,            // 5% weight for consistency streak
};

// Achievement thresholds
const ACHIEVEMENT_THRESHOLDS = {
    TASKS: [1, 10, 50, 100, 500],
    HOURS: [10, 50, 100, 500, 1000],
    STREAK: [7, 30, 90, 365],
};

@Injectable()
export class LeaderboardService {
    constructor(private prisma: PrismaService) { }

    // ============================================
    // GET COMPANY LEADERBOARD
    // ============================================
    async getCompanyLeaderboard(companyId: string, query: LeaderboardQueryDto) {
        const { startDate, endDate } = this.getPeriodDates(query.period, query.startDate, query.endDate);
        const limit = query.limit || 50;

        // Base where clause for time tracking
        const timeTrackingWhere: any = {
            user: { companyId },
            isActive: false,
            startTime: { gte: startDate },
        };
        if (endDate) timeTrackingWhere.startTime = { ...timeTrackingWhere.startTime, lte: endDate };

        // Filter by project if specified
        if (query.projectId) {
            timeTrackingWhere.subProject = { projectId: query.projectId };
        }

        // Filter by subproject if specified
        if (query.subProjectId) {
            timeTrackingWhere.subProjectId = query.subProjectId;
        }

        // Get all users in company with their stats
        const users = await this.prisma.user.findMany({
            where: { companyId, isActive: true },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                email: true,
                points: true,
                totalTasksCompleted: true,
                totalTimeTrackedMinutes: true,
                currentStreak: true,
                longestStreak: true,
            },
        });

        // Get aggregated stats for each user
        const userStats = await Promise.all(
            users.map(async (user) => {
                const [timeStats, taskStats, subProjectCount, projectCount] = await Promise.all([
                    // Time tracking stats
                    this.prisma.timeTracking.aggregate({
                        where: { ...timeTrackingWhere, userId: user.id },
                        _sum: { durationMinutes: true },
                        _count: true,
                    }),
                    // Task completion stats
                    this.prisma.task.count({
                        where: {
                            assignedToId: user.id,
                            status: 'COMPLETED',
                            completedAt: { gte: startDate, ...(endDate ? { lte: endDate } : {}) },
                        },
                    }),
                    // Subprojects contributed to
                    this.prisma.subProjectMember.count({
                        where: {
                            userId: user.id,
                            subProject: { project: { companyId } },
                        },
                    }),
                    // Projects contributed to
                    this.prisma.projectMember.count({
                        where: {
                            userId: user.id,
                            project: { companyId },
                        },
                    }),
                ]);

                const totalMinutes = timeStats._sum.durationMinutes || 0;
                const tasksCompleted = taskStats;
                const averageTaskTime = tasksCompleted > 0 ? Math.round(totalMinutes / tasksCompleted) : 0;

                // Calculate performance score
                const performanceScore = this.calculatePerformanceScore({
                    tasksCompleted,
                    totalMinutes,
                    pointsEarned: user.points,
                    subProjectsContributed: subProjectCount,
                    projectsContributed: projectCount,
                    currentStreak: user.currentStreak,
                });

                return {
                    user: {
                        id: user.id,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        avatar: user.avatar,
                        email: user.email,
                    },
                    metrics: {
                        tasksCompleted,
                        totalMinutes,
                        totalHours: Math.round(totalMinutes / 60 * 100) / 100,
                        pointsEarned: user.points,
                        subProjectsContributed: subProjectCount,
                        projectsContributed: projectCount,
                        averageTaskCompletionTime: averageTaskTime,
                        sessionCount: timeStats._count,
                    },
                    performanceScore,
                    currentStreak: user.currentStreak,
                    longestStreak: user.longestStreak,
                };
            })
        );

        // Sort by performance score and add ranks
        const sortedStats = userStats
            .sort((a, b) => b.performanceScore - a.performanceScore)
            .slice(0, limit)
            .map((stat, index) => ({
                rank: index + 1,
                ...stat,
            }));

        // Get previous period rankings for trend calculation
        const previousPeriodRanks = await this.getPreviousPeriodRanks(companyId, query.period);

        // Add trend information
        const leaderboardWithTrends = sortedStats.map(entry => {
            const previousRank = previousPeriodRanks.get(entry.user.id);
            let trend: 'up' | 'down' | 'stable' = 'stable';
            if (previousRank) {
                if (entry.rank < previousRank) trend = 'up';
                else if (entry.rank > previousRank) trend = 'down';
            }
            return { ...entry, trend, previousRank };
        });

        return {
            period: query.period || LeaderboardPeriod.ALL_TIME,
            startDate,
            endDate,
            totalParticipants: users.length,
            leaderboard: leaderboardWithTrends,
        };
    }

    // ============================================
    // GET PROJECT LEADERBOARD
    // ============================================
    async getProjectLeaderboard(projectId: string, companyId: string, query: LeaderboardQueryDto) {
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, companyId },
        });

        if (!project) throw new NotFoundException('Project not found');

        const { startDate, endDate } = this.getPeriodDates(query.period, query.startDate, query.endDate);

        // Get project members with their stats
        const members = await this.prisma.projectMember.findMany({
            where: { projectId },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        email: true,
                        points: true,
                        currentStreak: true,
                    },
                },
            },
        });

        const memberStats = await Promise.all(
            members.map(async (member) => {
                const [timeStats, taskStats, subProjectCount] = await Promise.all([
                    this.prisma.timeTracking.aggregate({
                        where: {
                            userId: member.userId,
                            subProject: { projectId },
                            isActive: false,
                            startTime: { gte: startDate, ...(endDate ? { lte: endDate } : {}) },
                        },
                        _sum: { durationMinutes: true },
                    }),
                    this.prisma.task.count({
                        where: {
                            assignedToId: member.userId,
                            subProject: { projectId },
                            status: 'COMPLETED',
                            completedAt: { gte: startDate, ...(endDate ? { lte: endDate } : {}) },
                        },
                    }),
                    this.prisma.subProjectMember.count({
                        where: {
                            userId: member.userId,
                            subProject: { projectId },
                        },
                    }),
                ]);

                const totalMinutes = timeStats._sum.durationMinutes || 0;
                const performanceScore = this.calculatePerformanceScore({
                    tasksCompleted: taskStats,
                    totalMinutes,
                    pointsEarned: member.pointsEarned,
                    subProjectsContributed: subProjectCount,
                    projectsContributed: 1,
                    currentStreak: member.user.currentStreak,
                });

                return {
                    user: member.user,
                    role: member.role,
                    projectPointsEarned: member.pointsEarned,
                    metrics: {
                        tasksCompleted: taskStats,
                        totalMinutes,
                        totalHours: Math.round(totalMinutes / 60 * 100) / 100,
                        subProjectsContributed: subProjectCount,
                    },
                    performanceScore,
                };
            })
        );

        const sortedStats = memberStats
            .sort((a, b) => b.performanceScore - a.performanceScore)
            .map((stat, index) => ({ rank: index + 1, ...stat }));

        return {
            projectId,
            projectName: project.name,
            period: query.period || LeaderboardPeriod.ALL_TIME,
            startDate,
            endDate,
            totalMembers: members.length,
            leaderboard: sortedStats,
        };
    }

    // ============================================
    // GET SUBPROJECT LEADERBOARD
    // ============================================
    async getSubProjectLeaderboard(subProjectId: string, companyId: string, query: LeaderboardQueryDto) {
        const subProject = await this.prisma.subProject.findFirst({
            where: { id: subProjectId, project: { companyId } },
            include: { project: { select: { name: true } } },
        });

        if (!subProject) throw new NotFoundException('Subproject not found');

        const { startDate, endDate } = this.getPeriodDates(query.period, query.startDate, query.endDate);

        const members = await this.prisma.subProjectMember.findMany({
            where: { subProjectId },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        email: true,
                        points: true,
                    },
                },
            },
        });

        const memberStats = await Promise.all(
            members.map(async (member) => {
                const [timeStats, taskStats] = await Promise.all([
                    this.prisma.timeTracking.aggregate({
                        where: {
                            userId: member.userId,
                            subProjectId,
                            isActive: false,
                            startTime: { gte: startDate, ...(endDate ? { lte: endDate } : {}) },
                        },
                        _sum: { durationMinutes: true },
                    }),
                    this.prisma.task.count({
                        where: {
                            assignedToId: member.userId,
                            subProjectId,
                            status: 'COMPLETED',
                            completedAt: { gte: startDate, ...(endDate ? { lte: endDate } : {}) },
                        },
                    }),
                ]);

                const totalMinutes = timeStats._sum.durationMinutes || 0;

                return {
                    user: member.user,
                    role: member.role,
                    memberStats: {
                        tasksCompleted: member.tasksCompleted,
                        totalTimeMinutes: member.totalTimeMinutes,
                        pointsEarned: member.pointsEarned,
                    },
                    periodStats: {
                        tasksCompleted: taskStats,
                        totalMinutes,
                        totalHours: Math.round(totalMinutes / 60 * 100) / 100,
                    },
                    performanceScore: this.calculatePerformanceScore({
                        tasksCompleted: taskStats,
                        totalMinutes,
                        pointsEarned: member.pointsEarned,
                        subProjectsContributed: 1,
                        projectsContributed: 1,
                        currentStreak: 0,
                    }),
                };
            })
        );

        const sortedStats = memberStats
            .sort((a, b) => b.performanceScore - a.performanceScore)
            .map((stat, index) => ({ rank: index + 1, ...stat }));

        return {
            subProjectId,
            subProjectTitle: subProject.title,
            projectName: subProject.project.name,
            period: query.period || LeaderboardPeriod.ALL_TIME,
            startDate,
            endDate,
            totalMembers: members.length,
            leaderboard: sortedStats,
        };
    }

    // ============================================
    // GET USER PERFORMANCE DETAILS
    // ============================================
    async getUserPerformance(userId: string, companyId: string, query: UserPerformanceQueryDto) {
        const user = await this.prisma.user.findFirst({
            where: { id: userId, companyId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                email: true,
                role: true,
                points: true,
                totalTasksCompleted: true,
                totalTimeTrackedMinutes: true,
                currentStreak: true,
                longestStreak: true,
                lastActiveDate: true,
            },
        });

        if (!user) throw new NotFoundException('User not found');

        const { startDate, endDate } = this.getPeriodDates(query.period, query.startDate, query.endDate);
        const { startDate: prevStartDate, endDate: prevEndDate } = this.getPreviousPeriodDates(query.period, startDate, endDate);

        // Current period stats
        const [currentTimeStats, currentTaskStats, currentSubProjects, currentProjects] = await Promise.all([
            this.prisma.timeTracking.aggregate({
                where: {
                    userId,
                    isActive: false,
                    startTime: { gte: startDate, ...(endDate ? { lte: endDate } : {}) },
                },
                _sum: { durationMinutes: true },
                _count: true,
            }),
            this.prisma.task.count({
                where: {
                    assignedToId: userId,
                    status: 'COMPLETED',
                    completedAt: { gte: startDate, ...(endDate ? { lte: endDate } : {}) },
                },
            }),
            this.prisma.subProjectMember.count({
                where: { userId, subProject: { project: { companyId } } },
            }),
            this.prisma.projectMember.count({
                where: { userId, project: { companyId } },
            }),
        ]);

        // Previous period stats
        const [prevTimeStats, prevTaskStats] = await Promise.all([
            this.prisma.timeTracking.aggregate({
                where: {
                    userId,
                    isActive: false,
                    startTime: { gte: prevStartDate, lte: prevEndDate },
                },
                _sum: { durationMinutes: true },
            }),
            this.prisma.task.count({
                where: {
                    assignedToId: userId,
                    status: 'COMPLETED',
                    completedAt: { gte: prevStartDate, lte: prevEndDate },
                },
            }),
        ]);

        // Get achievements
        const achievements = await this.prisma.achievement.findMany({
            where: { userId },
            orderBy: { earnedAt: 'desc' },
            take: 10,
        });

        // Get recent activity (last 14 days)
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const recentActivity = await this.prisma.timeTracking.groupBy({
            by: ['startTime'],
            where: {
                userId,
                isActive: false,
                startTime: { gte: fourteenDaysAgo },
            },
            _sum: { durationMinutes: true },
        });

        // Calculate metrics
        const currentMinutes = currentTimeStats._sum.durationMinutes || 0;
        const prevMinutes = prevTimeStats._sum.durationMinutes || 0;

        const currentScore = this.calculatePerformanceScore({
            tasksCompleted: currentTaskStats,
            totalMinutes: currentMinutes,
            pointsEarned: user.points,
            subProjectsContributed: currentSubProjects,
            projectsContributed: currentProjects,
            currentStreak: user.currentStreak,
        });

        const prevScore = this.calculatePerformanceScore({
            tasksCompleted: prevTaskStats,
            totalMinutes: prevMinutes,
            pointsEarned: 0,
            subProjectsContributed: 0,
            projectsContributed: 0,
            currentStreak: 0,
        });

        // Get current and previous rank
        const companyLeaderboard = await this.getCompanyLeaderboard(companyId, { period: query.period, limit: 100 });
        const currentRank = companyLeaderboard.leaderboard.find(e => e.user.id === userId)?.rank || 0;
        const previousRank = companyLeaderboard.leaderboard.find(e => e.user.id === userId)?.previousRank || 0;

        return {
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.avatar,
                email: user.email,
                role: user.role,
                totalPoints: user.points,
            },
            currentPeriod: {
                tasksCompleted: currentTaskStats,
                totalMinutes: currentMinutes,
                totalHours: Math.round(currentMinutes / 60 * 100) / 100,
                pointsEarned: user.points,
                subProjectsContributed: currentSubProjects,
                projectsContributed: currentProjects,
                sessionCount: currentTimeStats._count,
                averageTaskCompletionTime: currentTaskStats > 0 ? Math.round(currentMinutes / currentTaskStats) : 0,
                performanceScore: currentScore,
            },
            previousPeriod: {
                tasksCompleted: prevTaskStats,
                totalMinutes: prevMinutes,
                performanceScore: prevScore,
            },
            change: {
                tasksCompletedChange: currentTaskStats - prevTaskStats,
                tasksCompletedPercentage: prevTaskStats > 0 ? Math.round(((currentTaskStats - prevTaskStats) / prevTaskStats) * 100) : 0,
                timeChange: currentMinutes - prevMinutes,
                timeChangePercentage: prevMinutes > 0 ? Math.round(((currentMinutes - prevMinutes) / prevMinutes) * 100) : 0,
                scoreChange: currentScore - prevScore,
            },
            rank: {
                current: currentRank,
                previous: previousRank,
                change: previousRank - currentRank,
            },
            achievements: achievements.map(a => ({
                type: a.type,
                title: a.title,
                description: a.description,
                earnedAt: a.earnedAt,
            })),
            streaks: {
                current: user.currentStreak,
                longest: user.longestStreak,
            },
            allTimeStats: {
                totalTasksCompleted: user.totalTasksCompleted,
                totalTimeMinutes: user.totalTimeTrackedMinutes,
                totalTimeHours: Math.round(user.totalTimeTrackedMinutes / 60 * 100) / 100,
                lastActiveDate: user.lastActiveDate,
            },
            recentActivity: this.aggregateRecentActivity(recentActivity),
        };
    }

    // ============================================
    // GET MY PERFORMANCE
    // ============================================
    async getMyPerformance(userId: string, companyId: string, query: UserPerformanceQueryDto) {
        return this.getUserPerformance(userId, companyId, query);
    }

    // ============================================
    // CHECK AND AWARD ACHIEVEMENTS
    // ============================================
    async checkAndAwardAchievements(userId: string, companyId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                totalTasksCompleted: true,
                totalTimeTrackedMinutes: true,
                currentStreak: true,
            },
        });

        if (!user) return;

        const existingAchievements = await this.prisma.achievement.findMany({
            where: { userId },
            select: { type: true },
        });

        const existingTypes = new Set(existingAchievements.map(a => a.type));
        const newAchievements: { type: AchievementType; title: string; description: string }[] = [];

        // Check task achievements
        const taskAchievements: [number, AchievementType, string, string][] = [
            [1, AchievementType.FIRST_TASK_COMPLETED, 'First Task!', 'Completed your first task'],
            [10, AchievementType.TASKS_10_COMPLETED, 'Task Master', 'Completed 10 tasks'],
            [50, AchievementType.TASKS_50_COMPLETED, 'Task Champion', 'Completed 50 tasks'],
            [100, AchievementType.TASKS_100_COMPLETED, 'Task Legend', 'Completed 100 tasks'],
            [500, AchievementType.TASKS_500_COMPLETED, 'Task God', 'Completed 500 tasks'],
        ];

        for (const [threshold, type, title, description] of taskAchievements) {
            if (user.totalTasksCompleted >= threshold && !existingTypes.has(type)) {
                newAchievements.push({ type, title, description });
            }
        }

        // Check time achievements
        const totalHours = user.totalTimeTrackedMinutes / 60;
        const timeAchievements: [number, AchievementType, string, string][] = [
            [10, AchievementType.HOURS_10_TRACKED, '10 Hour Club', 'Tracked 10 hours of work'],
            [50, AchievementType.HOURS_50_TRACKED, '50 Hour Milestone', 'Tracked 50 hours of work'],
            [100, AchievementType.HOURS_100_TRACKED, 'Century Worker', 'Tracked 100 hours of work'],
            [500, AchievementType.HOURS_500_TRACKED, 'Half Thousand', 'Tracked 500 hours of work'],
            [1000, AchievementType.HOURS_1000_TRACKED, 'Time Lord', 'Tracked 1000 hours of work'],
        ];

        for (const [threshold, type, title, description] of timeAchievements) {
            if (totalHours >= threshold && !existingTypes.has(type)) {
                newAchievements.push({ type, title, description });
            }
        }

        // Check streak achievements
        const streakAchievements: [number, AchievementType, string, string][] = [
            [7, AchievementType.STREAK_7_DAYS, 'Week Warrior', '7 day work streak'],
            [30, AchievementType.STREAK_30_DAYS, 'Monthly Master', '30 day work streak'],
            [90, AchievementType.STREAK_90_DAYS, 'Quarterly Champion', '90 day work streak'],
            [365, AchievementType.STREAK_365_DAYS, 'Year Round Hero', '365 day work streak'],
        ];

        for (const [threshold, type, title, description] of streakAchievements) {
            if (user.currentStreak >= threshold && !existingTypes.has(type)) {
                newAchievements.push({ type, title, description });
            }
        }

        // Create new achievements and notify user
        for (const achievement of newAchievements) {
            await this.prisma.achievement.create({
                data: {
                    userId,
                    companyId,
                    ...achievement,
                },
            });

            await this.prisma.notification.create({
                data: {
                    userId,
                    type: NotificationType.ACHIEVEMENT_EARNED,
                    title: '🏆 Achievement Unlocked!',
                    message: `You earned "${achievement.title}": ${achievement.description}`,
                    metadata: { achievementType: achievement.type },
                },
            });
        }

        return newAchievements;
    }

    // ============================================
    // UPDATE USER STREAK
    // ============================================
    async updateUserStreak(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { lastActiveDate: true, currentStreak: true, longestStreak: true, companyId: true },
        });

        if (!user) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const lastActive = user.lastActiveDate ? new Date(user.lastActiveDate) : null;
        if (lastActive) lastActive.setHours(0, 0, 0, 0);

        let newStreak = 1;

        if (lastActive) {
            const diffDays = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                // Same day, no change
                return;
            } else if (diffDays === 1) {
                // Consecutive day
                newStreak = user.currentStreak + 1;
            }
            // If more than 1 day, streak resets to 1
        }

        const newLongest = Math.max(newStreak, user.longestStreak);

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                currentStreak: newStreak,
                longestStreak: newLongest,
                lastActiveDate: today,
            },
        });

        // Check for streak achievements
        await this.checkAndAwardAchievements(userId, user.companyId);
    }

    // ============================================
    // HELPER: Calculate performance score
    // ============================================
    private calculatePerformanceScore(metrics: {
        tasksCompleted: number;
        totalMinutes: number;
        pointsEarned: number;
        subProjectsContributed: number;
        projectsContributed: number;
        currentStreak: number;
    }): number {
        // Normalize metrics (using reasonable maximums for scaling)
        const normalizedTasks = Math.min(metrics.tasksCompleted / 100, 1);
        const normalizedTime = Math.min(metrics.totalMinutes / 6000, 1); // 100 hours
        const normalizedPoints = Math.min(metrics.pointsEarned / 1000, 1);
        const normalizedSubProjects = Math.min(metrics.subProjectsContributed / 20, 1);
        const normalizedProjects = Math.min(metrics.projectsContributed / 10, 1);
        const normalizedStreak = Math.min(metrics.currentStreak / 30, 1);

        const score =
            normalizedTasks * PERFORMANCE_WEIGHTS.TASKS_COMPLETED +
            normalizedTime * PERFORMANCE_WEIGHTS.TIME_TRACKED +
            normalizedPoints * PERFORMANCE_WEIGHTS.POINTS_EARNED +
            normalizedSubProjects * PERFORMANCE_WEIGHTS.SUBPROJECTS_CONTRIBUTED +
            normalizedProjects * PERFORMANCE_WEIGHTS.PROJECTS_CONTRIBUTED +
            normalizedStreak * PERFORMANCE_WEIGHTS.STREAK_BONUS;

        return Math.round(score * 1000) / 10; // Score out of 100
    }

    // ============================================
    // HELPER: Get period dates
    // ============================================
    private getPeriodDates(period?: LeaderboardPeriod, customStart?: string, customEnd?: string): { startDate: Date; endDate: Date | null } {
        const now = new Date();
        let startDate: Date;
        let endDate: Date | null = null;

        if (customStart && customEnd) {
            return { startDate: new Date(customStart), endDate: new Date(customEnd) };
        }

        switch (period) {
            case LeaderboardPeriod.DAILY:
                startDate = new Date(now.setHours(0, 0, 0, 0));
                break;
            case LeaderboardPeriod.WEEKLY:
                startDate = new Date(now);
                startDate.setDate(now.getDate() - now.getDay());
                startDate.setHours(0, 0, 0, 0);
                break;
            case LeaderboardPeriod.MONTHLY:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case LeaderboardPeriod.QUARTERLY:
                const quarter = Math.floor(now.getMonth() / 3);
                startDate = new Date(now.getFullYear(), quarter * 3, 1);
                break;
            case LeaderboardPeriod.YEARLY:
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            case LeaderboardPeriod.ALL_TIME:
            default:
                startDate = new Date(0); // Beginning of time
                break;
        }

        return { startDate, endDate };
    }

    // ============================================
    // HELPER: Get previous period dates
    // ============================================
    private getPreviousPeriodDates(period?: LeaderboardPeriod, currentStart?: Date, currentEnd?: Date | null): { startDate: Date; endDate: Date } {
        const now = new Date();
        let startDate: Date;
        let endDate: Date;

        switch (period) {
            case LeaderboardPeriod.DAILY:
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setHours(23, 59, 59, 999);
                break;
            case LeaderboardPeriod.WEEKLY:
                startDate = new Date(now);
                startDate.setDate(now.getDate() - now.getDay() - 7);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 6);
                endDate.setHours(23, 59, 59, 999);
                break;
            case LeaderboardPeriod.MONTHLY:
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            default:
                startDate = new Date(0);
                endDate = currentStart ? new Date(currentStart) : new Date();
                break;
        }

        return { startDate, endDate };
    }

    // ============================================
    // HELPER: Get previous period ranks
    // ============================================
    private async getPreviousPeriodRanks(companyId: string, period?: LeaderboardPeriod): Promise<Map<string, number>> {
        const { startDate, endDate } = this.getPreviousPeriodDates(period);

        // Try to get from snapshot
        const snapshots = await this.prisma.leaderboardSnapshot.findMany({
            where: {
                companyId,
                periodType: period || LeaderboardPeriod.ALL_TIME,
                periodStart: { gte: startDate, lte: endDate },
            },
            orderBy: { rank: 'asc' },
        });

        const rankMap = new Map<string, number>();
        snapshots.forEach(s => rankMap.set(s.userId, s.rank));

        return rankMap;
    }

    // ============================================
    // HELPER: Aggregate recent activity
    // ============================================
    private aggregateRecentActivity(rawActivity: any[]): { date: string; minutesWorked: number }[] {
        const activityMap = new Map<string, number>();

        rawActivity.forEach(a => {
            const dateStr = new Date(a.startTime).toISOString().split('T')[0];
            activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + (a._sum.durationMinutes || 0));
        });

        return Array.from(activityMap.entries())
            .map(([date, minutesWorked]) => ({ date, minutesWorked }))
            .sort((a, b) => b.date.localeCompare(a.date));
    }

    // ============================================
    // SAVE LEADERBOARD SNAPSHOT (for cron job)
    // ============================================
    async saveLeaderboardSnapshot(companyId: string, period: LeaderboardPeriod) {
        const leaderboard = await this.getCompanyLeaderboard(companyId, { period, limit: 100 });

        const now = new Date();
        const { startDate, endDate } = this.getPeriodDates(period);

        // Delete existing snapshots for this period
        await this.prisma.leaderboardSnapshot.deleteMany({
            where: {
                companyId,
                periodType: period,
                periodStart: startDate,
            },
        });

        // Create new snapshots
        await this.prisma.leaderboardSnapshot.createMany({
            data: leaderboard.leaderboard.map(entry => ({
                companyId,
                userId: entry.user.id,
                periodType: period,
                periodStart: startDate,
                periodEnd: endDate || now,
                rank: entry.rank,
                tasksCompleted: entry.metrics.tasksCompleted,
                totalMinutes: entry.metrics.totalMinutes,
                pointsEarned: entry.metrics.pointsEarned,
                subProjectsContributed: entry.metrics.subProjectsContributed,
                projectsContributed: entry.metrics.projectsContributed,
                performanceScore: entry.performanceScore,
            })),
        });
    }
}