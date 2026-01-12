// src/modules/screenshots/screenshots.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UserRole, NotificationType, CaptureStatus, ActivityType } from '@prisma/client';
import {
    UploadScreenshotDto,
    DeleteScreenshotDto,
    BulkDeleteScreenshotsDto,
    ScreenshotQueryDto,
    ReportFailedCaptureDto,
} from './dto/screenshots.dto';

// Constants for screenshot management
const SCREENSHOT_RETENTION_DAYS = 60;
const SCREENSHOT_BUCKET = 'screenshots';

@Injectable()
export class ScreenshotsService {
    constructor(
        private prisma: PrismaService,
        private storageService: StorageService,
    ) { }

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
    // Helper: Calculate interval minutes
    // ============================================
    private calculateIntervalMinutes(intervalStart: Date, intervalEnd: Date): number {
        return Math.floor((intervalEnd.getTime() - intervalStart.getTime()) / 1000 / 60);
    }

    // ============================================
    // Helper: Get expiry date (60 days from now)
    // ============================================
    private getExpiryDate(): Date {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + SCREENSHOT_RETENTION_DAYS);
        return expiryDate;
    }

    // ============================================
    // UPLOAD SCREENSHOT (from Desktop Agent)
    // ============================================
    async uploadScreenshot(
        file: Express.Multer.File,
        dto: UploadScreenshotDto,
        agentUserId: string,
        companyId: string,
    ) {
        // Verify the time tracking session exists and belongs to user
        const timeTracking = await this.prisma.timeTracking.findFirst({
            where: {
                id: dto.timeTrackingId,
                userId: agentUserId,
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

        // Verify company matches
        if (timeTracking.subProject.project.companyId !== companyId) {
            throw new ForbiddenException('Access denied');
        }

        // Verify screen capture is enabled for this project
        if (!timeTracking.subProject.project.screenCaptureEnabled) {
            throw new BadRequestException('Screen capture is not enabled for this project');
        }

        // Upload file to storage
        const uploadResult = await this.storageService.uploadScreenshot(
            file,
            companyId,
            agentUserId,
            dto.timeTrackingId,
        );

        // Get previous screenshot to calculate interval
        const previousScreenshot = await this.prisma.screenshot.findFirst({
            where: {
                timeTrackingId: dto.timeTrackingId,
                isDeleted: false,
            },
            orderBy: { capturedAt: 'desc' },
        });

        const capturedAt = new Date(dto.capturedAt);
        const intervalStart = previousScreenshot
            ? previousScreenshot.capturedAt
            : timeTracking.startTime;
        const intervalMinutes = this.calculateIntervalMinutes(intervalStart, capturedAt);

        // Create screenshot record in database
        const screenshot = await this.prisma.screenshot.create({
            data: {
                timeTrackingId: dto.timeTrackingId,
                userId: agentUserId,
                filePath: uploadResult.path,       // Save the Supabase path
                fileUrl: uploadResult.url,         // Save the public URL
                fileSize: uploadResult.size,
                capturedAt,
                intervalStart,
                intervalEnd: capturedAt,
                intervalMinutes,
                screenWidth: dto.screenWidth,
                screenHeight: dto.screenHeight,
                monitorIndex: dto.monitorIndex || 0,
                checksum: dto.checksum,
                captureStatus: dto.captureStatus || CaptureStatus.SUCCESS,
                expiresAt: this.getExpiryDate(),
            },
        });

        // Update previous screenshot's intervalEnd if exists
        if (previousScreenshot) {
            await this.prisma.screenshot.update({
                where: { id: previousScreenshot.id },
                data: { intervalEnd: capturedAt },
            });
        }

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId,
                userId: agentUserId,
                activityType: ActivityType.SCREENSHOT_CAPTURED,
                description: `Screenshot captured for task "${timeTracking.subProject.title}"`,
                metadata: {
                    screenshotId: screenshot.id,
                    timeTrackingId: dto.timeTrackingId,
                    projectId: timeTracking.subProject.project.id,
                    intervalMinutes,
                },
            },
        });

        return screenshot;
    }

    // ============================================
    // REPORT FAILED CAPTURE
    // ============================================
    async reportFailedCapture(
        dto: ReportFailedCaptureDto,
        agentUserId: string,
        companyId: string,
    ) {
        // Verify the time tracking session
        const timeTracking = await this.prisma.timeTracking.findFirst({
            where: {
                id: dto.timeTrackingId,
                userId: agentUserId,
                isActive: true,
            },
            include: {
                subProject: {
                    include: {
                        project: { select: { companyId: true } },
                    },
                },
            },
        });

        if (!timeTracking) {
            throw new NotFoundException('Active time tracking session not found');
        }

        if (timeTracking.subProject.project.companyId !== companyId) {
            throw new ForbiddenException('Access denied');
        }

        const attemptedAt = new Date(dto.attemptedAt);

        // Get previous screenshot for interval calculation
        const previousScreenshot = await this.prisma.screenshot.findFirst({
            where: {
                timeTrackingId: dto.timeTrackingId,
                isDeleted: false,
            },
            orderBy: { capturedAt: 'desc' },
        });

        const intervalStart = previousScreenshot
            ? previousScreenshot.capturedAt
            : timeTracking.startTime;
        const intervalMinutes = this.calculateIntervalMinutes(intervalStart, attemptedAt);

        // Create failed capture record (no file)
        const screenshot = await this.prisma.screenshot.create({
            data: {
                timeTrackingId: dto.timeTrackingId,
                userId: agentUserId,
                filePath: '',
                fileUrl: '',
                fileSize: 0,
                capturedAt: attemptedAt,
                intervalStart,
                intervalEnd: attemptedAt,
                intervalMinutes,
                captureStatus: dto.status,
                expiresAt: this.getExpiryDate(),
            },
        });

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId,
                userId: agentUserId,
                activityType: ActivityType.SCREENSHOT_CAPTURED,
                description: `Screenshot capture failed: ${dto.status}`,
                metadata: {
                    screenshotId: screenshot.id,
                    timeTrackingId: dto.timeTrackingId,
                    status: dto.status,
                    errorMessage: dto.errorMessage,
                },
            },
        });

        return screenshot;
    }

    // ============================================
    // GET SCREENSHOTS FOR TIME TRACKING SESSION
    // ============================================
    async getScreenshotsByTimeTracking(
        timeTrackingId: string,
        currentUserId: string,
        currentUserRole: UserRole,
        companyId: string,
        includeDeleted: boolean = false,
    ) {
        // Verify access to time tracking session
        const timeTracking = await this.prisma.timeTracking.findFirst({
            where: { id: timeTrackingId },
            include: {
                subProject: {
                    include: {
                        project: { select: { companyId: true } },
                    },
                },
            },
        });

        if (!timeTracking) {
            throw new NotFoundException('Time tracking session not found');
        }

        if (timeTracking.subProject.project.companyId !== companyId) {
            throw new ForbiddenException('Access denied');
        }

        // Regular users can only view their own screenshots
        if (currentUserRole === UserRole.USER && timeTracking.userId !== currentUserId) {
            throw new ForbiddenException('You can only view your own screenshots');
        }

        const where: any = { timeTrackingId };
        if (!includeDeleted) {
            where.isDeleted = false;
        }

        return this.prisma.screenshot.findMany({
            where,
            orderBy: { capturedAt: 'asc' },
        });
    }

    // ============================================
    // GET SCREENSHOTS (with filters)
    // ============================================
    async getScreenshots(
        query: ScreenshotQueryDto,
        currentUserId: string,
        currentUserRole: UserRole,
        companyId: string,
    ) {
        const page = query.page || 1;
        const limit = query.limit || 50;
        const skip = (page - 1) * limit;

        const where: any = {
            timeTracking: {
                subProject: {
                    project: { companyId },
                },
            },
        };

        // Regular users can only see their own screenshots
        if (currentUserRole === UserRole.USER) {
            where.userId = currentUserId;
        } else if (query.userId) {
            where.userId = query.userId;
        }

        if (query.timeTrackingId) {
            where.timeTrackingId = query.timeTrackingId;
        }

        if (query.projectId) {
            where.timeTracking = {
                ...where.timeTracking,
                subProject: {
                    ...where.timeTracking?.subProject,
                    projectId: query.projectId,
                },
            };
        }

        if (query.subProjectId) {
            where.timeTracking = {
                ...where.timeTracking,
                subProjectId: query.subProjectId,
            };
        }

        if (query.startDate) {
            where.capturedAt = { gte: new Date(query.startDate) };
        }

        if (query.endDate) {
            where.capturedAt = {
                ...where.capturedAt,
                lte: new Date(query.endDate),
            };
        }

        if (!query.includeDeleted) {
            where.isDeleted = false;
        }

        const [screenshots, total] = await Promise.all([
            this.prisma.screenshot.findMany({
                where,
                include: {
                    timeTracking: {
                        include: {
                            subProject: {
                                select: {
                                    id: true,
                                    title: true,
                                    project: {
                                        select: { id: true, name: true },
                                    },
                                },
                            },
                        },
                    },
                },
                orderBy: { capturedAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.screenshot.count({ where }),
        ]);

        return {
            data: screenshots,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    // ============================================
    // GET SINGLE SCREENSHOT
    // ============================================
    async getScreenshot(
        id: string,
        currentUserId: string,
        currentUserRole: UserRole,
        companyId: string,
    ) {
        const screenshot = await this.prisma.screenshot.findFirst({
            where: { id },
            include: {
                timeTracking: {
                    include: {
                        subProject: {
                            include: {
                                project: { select: { id: true, name: true, companyId: true } },
                            },
                        },
                        user: {
                            select: { id: true, firstName: true, lastName: true },
                        },
                    },
                },
            },
        });

        if (!screenshot) {
            throw new NotFoundException('Screenshot not found');
        }

        if (screenshot.timeTracking.subProject.project.companyId !== companyId) {
            throw new ForbiddenException('Access denied');
        }

        // Regular users can only view their own screenshots
        if (currentUserRole === UserRole.USER && screenshot.userId !== currentUserId) {
            throw new ForbiddenException('You can only view your own screenshots');
        }

        return screenshot;
    }

    // ============================================
    // DELETE SCREENSHOT (with time deduction)
    // ============================================
    async deleteScreenshot(
        id: string,
        dto: DeleteScreenshotDto,
        currentUserId: string,
        currentUserRole: UserRole,
        companyId: string,
    ) {
        const screenshot = await this.getScreenshot(id, currentUserId, currentUserRole, companyId);

        if (screenshot.isDeleted) {
            throw new BadRequestException('Screenshot is already deleted');
        }

        // Calculate time to deduct (the interval this screenshot covers)
        const minutesToDeduct = screenshot.intervalMinutes;

        // Use transaction for atomic update
        const result = await this.prisma.$transaction(async (prisma) => {
            // Soft delete the screenshot
            const deletedScreenshot = await prisma.screenshot.update({
                where: { id },
                data: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: currentUserId,
                    deletionReason: dto.reason,
                },
            });

            // Update time tracking with deducted time
            const updatedTimeTracking = await prisma.timeTracking.update({
                where: { id: screenshot.timeTrackingId },
                data: {
                    timeDeducted: { increment: minutesToDeduct },
                    durationMinutes: { decrement: minutesToDeduct },
                },
            });

            // If time tracking is completed, also deduct points
            if (!updatedTimeTracking.isActive && minutesToDeduct > 0) {
                const pointsToDeduct = Math.floor(minutesToDeduct / 30); // 1 point per 30 mins
                if (pointsToDeduct > 0) {
                    await prisma.user.update({
                        where: { id: screenshot.userId },
                        data: { points: { decrement: pointsToDeduct } },
                    });

                    // Update project member points
                    await prisma.projectMember.updateMany({
                        where: {
                            projectId: screenshot.timeTracking.subProject.project.id,
                            userId: screenshot.userId,
                        },
                        data: { pointsEarned: { decrement: pointsToDeduct } },
                    });
                }
            }

            return { deletedScreenshot, updatedTimeTracking, minutesToDeduct };
        });

        // Delete file from storage
        if (screenshot.filePath) {
            try {
                await this.storageService.deleteFile(screenshot.filePath);
            } catch (error) {
                console.error('Failed to delete screenshot file:', error);
            }
        }

        // Notify user about time deduction (if deleted by admin)
        if (currentUserId !== screenshot.userId) {
            await this.sendNotification(
                screenshot.userId,
                NotificationType.TIME_DEDUCTED,
                'Screenshot Deleted - Time Adjusted',
                `A screenshot was deleted from your time tracking session. ${minutesToDeduct} minutes have been deducted.`,
                {
                    screenshotId: id,
                    timeTrackingId: screenshot.timeTrackingId,
                    minutesDeducted: minutesToDeduct,
                    deletedBy: currentUserId,
                    reason: dto.reason,
                },
            );
        }

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId,
                userId: currentUserId,
                activityType: ActivityType.SCREENSHOT_DELETED,
                description: `Screenshot deleted. ${minutesToDeduct} minutes deducted.`,
                metadata: {
                    screenshotId: id,
                    timeTrackingId: screenshot.timeTrackingId,
                    minutesDeducted: minutesToDeduct,
                    reason: dto.reason,
                },
            },
        });

        return {
            message: 'Screenshot deleted successfully',
            minutesDeducted: minutesToDeduct,
            newDuration: result.updatedTimeTracking.durationMinutes,
            totalTimeDeducted: result.updatedTimeTracking.timeDeducted,
        };
    }

    // ============================================
    // BULK DELETE SCREENSHOTS
    // ============================================
    async bulkDeleteScreenshots(
        dto: BulkDeleteScreenshotsDto,
        currentUserId: string,
        currentUserRole: UserRole,
        companyId: string,
    ) {
        // Define the result type
        type BulkDeleteResult =
            | { id: string; success: true; message: string; minutesDeducted: number; newDuration: number; totalTimeDeducted: number }
            | { id: string; success: false; error: string };

        const results: BulkDeleteResult[] = [];  // Add type annotation here
        let totalMinutesDeducted = 0;

        for (const screenshotId of dto.screenshotIds) {
            try {
                const result = await this.deleteScreenshot(
                    screenshotId,
                    { reason: dto.reason },
                    currentUserId,
                    currentUserRole,
                    companyId,
                );
                results.push({ id: screenshotId, success: true, ...result });
                totalMinutesDeducted += result.minutesDeducted;
            } catch (error: any) {  // Add :any to error
                results.push({
                    id: screenshotId,
                    success: false,
                    error: error.message,
                });
            }
        }

        return {
            results,
            summary: {
                total: dto.screenshotIds.length,
                successful: results.filter((r) => r.success).length,
                failed: results.filter((r) => !r.success).length,
                totalMinutesDeducted,
            },
        };
    }

    // ============================================
    // GET SCREENSHOT STATS
    // ============================================
    async getScreenshotStats(
        timeTrackingId: string,
        currentUserId: string,
        currentUserRole: UserRole,
        companyId: string,
    ) {
        // Verify access
        const timeTracking = await this.prisma.timeTracking.findFirst({
            where: { id: timeTrackingId },
            include: {
                subProject: {
                    include: {
                        project: { select: { companyId: true } },
                    },
                },
            },
        });

        if (!timeTracking) {
            throw new NotFoundException('Time tracking session not found');
        }

        if (timeTracking.subProject.project.companyId !== companyId) {
            throw new ForbiddenException('Access denied');
        }

        if (currentUserRole === UserRole.USER && timeTracking.userId !== currentUserId) {
            throw new ForbiddenException('Access denied');
        }

        const [stats, statusCounts] = await Promise.all([
            this.prisma.screenshot.aggregate({
                where: { timeTrackingId },
                _count: true,
                _sum: { intervalMinutes: true },
            }),
            this.prisma.screenshot.groupBy({
                by: ['captureStatus', 'isDeleted'],
                where: { timeTrackingId },
                _count: true,
            }),
        ]);

        const successfulCaptures = statusCounts
            .filter((s) => s.captureStatus === CaptureStatus.SUCCESS && !s.isDeleted)
            .reduce((sum, s) => sum + s._count, 0);

        const failedCaptures = statusCounts
            .filter((s) => s.captureStatus !== CaptureStatus.SUCCESS)
            .reduce((sum, s) => sum + s._count, 0);

        const deletedCaptures = statusCounts
            .filter((s) => s.isDeleted)
            .reduce((sum, s) => sum + s._count, 0);

        const totalMinutesTracked = stats._sum.intervalMinutes || 0;
        const effectiveMinutes = timeTracking.durationMinutes;
        const totalMinutesDeducted = timeTracking.timeDeducted;

        // Calculate expected captures based on duration and interval
        const expectedCaptures = Math.floor(timeTracking.durationMinutes / 3); // Assuming ~3 min average
        const captureRate = expectedCaptures > 0
            ? Math.round((successfulCaptures / expectedCaptures) * 100)
            : 100;

        return {
            totalCaptures: stats._count,
            successfulCaptures,
            failedCaptures,
            deletedCaptures,
            totalMinutesTracked,
            totalMinutesDeducted,
            effectiveMinutes,
            captureRate,
        };
    }

    // ============================================
    // GET USER SCREENSHOT SUMMARY
    // ============================================
    async getUserScreenshotSummary(
        userId: string,
        companyId: string,
        startDate?: Date,
        endDate?: Date,
    ) {
        const where: any = {
            userId,
            timeTracking: {
                subProject: {
                    project: { companyId },
                },
            },
        };

        if (startDate || endDate) {
            where.capturedAt = {};
            if (startDate) where.capturedAt.gte = startDate;
            if (endDate) where.capturedAt.lte = endDate;
        }

        const [total, byStatus, deletedStats] = await Promise.all([
            this.prisma.screenshot.count({ where }),
            this.prisma.screenshot.groupBy({
                by: ['captureStatus'],
                where: { ...where, isDeleted: false },
                _count: true,
            }),
            this.prisma.screenshot.aggregate({
                where: { ...where, isDeleted: true },
                _count: true,
                _sum: { intervalMinutes: true },
            }),
        ]);

        return {
            total,
            byStatus: byStatus.map((s) => ({
                status: s.captureStatus,
                count: s._count,
            })),
            deleted: {
                count: deletedStats._count,
                totalMinutesDeducted: deletedStats._sum.intervalMinutes || 0,
            },
        };
    }

    // ============================================
    // CLEANUP EXPIRED SCREENSHOTS (Called by cron)
    // ============================================
    async cleanupExpiredScreenshots() {
        const now = new Date();

        // Find expired screenshots
        const expiredScreenshots = await this.prisma.screenshot.findMany({
            where: {
                expiresAt: { lte: now },
            },
            select: {
                id: true,
                filePath: true,
            },
        });

        if (expiredScreenshots.length === 0) {
            return { deleted: 0 };
        }

        // Delete files from storage
        const filePaths = expiredScreenshots
            .filter((s) => s.filePath)
            .map((s) => s.filePath);

        if (filePaths.length > 0) {
            try {
                await this.storageService.deleteMultipleFiles(filePaths);
            } catch (error) {
                console.error('Failed to delete expired screenshot files:', error);
            }
        }

        // Delete records from database
        const deleteResult = await this.prisma.screenshot.deleteMany({
            where: {
                id: { in: expiredScreenshots.map((s) => s.id) },
            },
        });

        console.log(`Cleaned up ${deleteResult.count} expired screenshots`);

        return { deleted: deleteResult.count };
    }
}