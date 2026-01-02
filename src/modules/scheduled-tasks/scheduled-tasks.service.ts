// src/modules/scheduled-tasks/scheduled-tasks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ScreenshotsService } from '../screenshots/screenshots.service';
import { DesktopAgentService } from '../desktop-agent/desktop-agent.service';

@Injectable()
export class ScheduledTasksService {
    private readonly logger = new Logger(ScheduledTasksService.name);

    constructor(
        private prisma: PrismaService,
        private screenshotsService: ScreenshotsService,
        private agentService: DesktopAgentService,
    ) { }

    // ============================================
    // CLEANUP EXPIRED SCREENSHOTS (Daily at 2 AM)
    // ============================================
    @Cron(CronExpression.EVERY_DAY_AT_2AM)
    async cleanupExpiredScreenshots() {
        this.logger.log('Starting expired screenshots cleanup...');

        try {
            const result = await this.screenshotsService.cleanupExpiredScreenshots();
            this.logger.log(`Cleaned up ${result.deleted} expired screenshots`);
        } catch (error) {
            this.logger.error('Failed to cleanup expired screenshots', error);
        }
    }

    // ============================================
    // MARK OFFLINE AGENTS (Every 5 minutes)
    // ============================================
    @Cron(CronExpression.EVERY_5_MINUTES)
    async markOfflineAgents() {
        try {
            const result = await this.agentService.markOfflineAgents();
            if (result.markedOffline > 0) {
                this.logger.log(`Marked ${result.markedOffline} agents as offline`);
            }
        } catch (error) {
            this.logger.error('Failed to mark offline agents', error);
        }
    }

    // ============================================
    // CLEANUP OLD AGENT ACTIVITY LOGS (Weekly)
    // ============================================
    @Cron(CronExpression.EVERY_WEEK)
    async cleanupOldAgentLogs() {
        this.logger.log('Starting old agent activity logs cleanup...');

        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const result = await this.prisma.agentActivityLog.deleteMany({
                where: {
                    createdAt: { lt: thirtyDaysAgo },
                },
            });

            this.logger.log(`Cleaned up ${result.count} old agent activity logs`);
        } catch (error) {
            this.logger.error('Failed to cleanup old agent logs', error);
        }
    }

    // ============================================
    // CHECK STALE TIME TRACKING SESSIONS (Hourly)
    // Auto-stop sessions that have been running for more than 12 hours
    // ============================================
    @Cron(CronExpression.EVERY_HOUR)
    async checkStaleTimeSessions() {
        this.logger.log('Checking for stale time tracking sessions...');

        try {
            const twelveHoursAgo = new Date();
            twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

            const staleSessions = await this.prisma.timeTracking.findMany({
                where: {
                    isActive: true,
                    startTime: { lt: twelveHoursAgo },
                },
                include: {
                    user: { select: { id: true, firstName: true, lastName: true } },
                    subProject: { select: { title: true } },
                },
            });

            for (const session of staleSessions) {
                const endTime = new Date();
                const durationMinutes = Math.floor(
                    (endTime.getTime() - session.startTime.getTime()) / 1000 / 60
                );

                // Auto-stop the session
                await this.prisma.timeTracking.update({
                    where: { id: session.id },
                    data: {
                        isActive: false,
                        endTime,
                        durationMinutes,
                        notes: `${session.notes || ''}\n[Auto-stopped after 12 hours]`.trim(),
                    },
                });

                // Notify user
                await this.prisma.notification.create({
                    data: {
                        userId: session.userId,
                        type: 'SYSTEM',
                        title: 'Time Tracking Auto-Stopped',
                        message: `Your time tracking session for "${session.subProject.title}" was automatically stopped after running for 12 hours.`,
                        metadata: {
                            timeTrackingId: session.id,
                            taskTitle: session.subProject.title,
                            duration: durationMinutes,
                        },
                    },
                });

                this.logger.warn(
                    `Auto-stopped stale session for user ${session.user.firstName} ${session.user.lastName}`
                );
            }

            if (staleSessions.length > 0) {
                this.logger.log(`Auto-stopped ${staleSessions.length} stale time tracking sessions`);
            }
        } catch (error) {
            this.logger.error('Failed to check stale time sessions', error);
        }
    }

    // ============================================
    // CLEANUP OLD NOTIFICATIONS (Monthly)
    // ============================================
    @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
    async cleanupOldNotifications() {
        this.logger.log('Starting old notifications cleanup...');

        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

            // Delete read notifications older than 90 days
            const result = await this.prisma.notification.deleteMany({
                where: {
                    isRead: true,
                    createdAt: { lt: ninetyDaysAgo },
                },
            });

            this.logger.log(`Cleaned up ${result.count} old notifications`);
        } catch (error) {
            this.logger.error('Failed to cleanup old notifications', error);
        }
    }

    // ============================================
    // UPDATE EXPIRED SUBSCRIPTIONS (Daily at midnight)
    // ============================================
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async updateExpiredSubscriptions() {
        this.logger.log('Checking for expired subscriptions...');

        try {
            const now = new Date();

            // Update trial subscriptions that have expired
            const expiredTrials = await this.prisma.company.updateMany({
                where: {
                    subscriptionStatus: 'TRIAL',
                    trialEndsAt: { lt: now },
                },
                data: {
                    subscriptionStatus: 'EXPIRED',
                },
            });

            // Update active subscriptions that have expired
            const expiredActive = await this.prisma.company.updateMany({
                where: {
                    subscriptionStatus: 'ACTIVE',
                    subscriptionEndsAt: { lt: now },
                },
                data: {
                    subscriptionStatus: 'EXPIRED',
                },
            });

            if (expiredTrials.count > 0 || expiredActive.count > 0) {
                this.logger.log(
                    `Updated subscriptions: ${expiredTrials.count} trials expired, ${expiredActive.count} active expired`
                );
            }
        } catch (error) {
            this.logger.error('Failed to update expired subscriptions', error);
        }
    }
}