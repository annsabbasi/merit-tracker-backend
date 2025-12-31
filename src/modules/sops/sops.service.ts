// src/modules/sops/sops.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, SopStatus, NotificationType } from '@prisma/client';
import { CreateSopDto, UpdateSopDto, ApproveSopDto, RejectSopDto, SopQueryDto } from './dto/sops.dto';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class SopsService {
    constructor(
        private prisma: PrismaService,
        private storageService: StorageService
    ) { }

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
    // Helper: Send bulk notifications
    // ============================================
    private async sendBulkNotifications(
        userIds: string[],
        type: NotificationType,
        title: string,
        message: string,
        metadata?: Record<string, any>
    ) {
        if (userIds.length === 0) return;

        await this.prisma.notification.createMany({
            data: userIds.map(userId => ({
                userId,
                type,
                title,
                message,
                metadata: metadata || {},
            })),
        });
    }

    // ============================================
    // CREATE SOP
    // ============================================
    async create(createDto: CreateSopDto, currentUserId: string, companyId: string) {
        const sop = await this.prisma.sop.create({
            data: {
                ...createDto,
                companyId,
                createdById: currentUserId,
                status: SopStatus.PENDING_APPROVAL,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        email: true,
                    },
                },
            },
        });

        // ============================================
        // NOTIFY ALL ADMINS about new SOP pending approval
        // ============================================
        const admins = await this.prisma.user.findMany({
            where: {
                companyId,
                role: { in: [UserRole.COMPANY, UserRole.QC_ADMIN] },
                isActive: true,
                id: { not: currentUserId }, // Don't notify creator
            },
            select: { id: true },
        });

        await this.sendBulkNotifications(
            admins.map(a => a.id),
            NotificationType.SYSTEM,
            'New SOP Pending Approval',
            `"${sop.title}" has been submitted for approval by ${sop.createdBy?.firstName} ${sop.createdBy?.lastName}.`,
            {
                sopId: sop.id,
                sopTitle: sop.title,
                sopType: sop.type,
                createdBy: currentUserId,
            }
        );

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId,
                userId: currentUserId,
                activityType: 'SOP_CREATED',
                description: `Created SOP "${sop.title}"`,
                metadata: {
                    sopId: sop.id,
                    sopTitle: sop.title,
                    sopType: sop.type,
                },
            },
        });

        return sop;
    }

    // ============================================
    // CREATE SOP WITH FILE UPLOAD
    // ============================================
    async createWithFile(
        file: Express.Multer.File,
        thumbnailFile: Express.Multer.File | undefined,
        createDto: Omit<CreateSopDto, 'fileUrl' | 'thumbnailUrl' | 'type'>,
        currentUserId: string,
        companyId: string
    ) {
        // Upload main file
        const fileResult = await this.storageService.uploadFile(file, companyId, 'sops');

        // Detect type from file
        const detectedType = this.storageService.getFileCategory(file.mimetype);

        // Upload thumbnail if provided
        let thumbnailUrl: string | undefined;
        if (thumbnailFile) {
            const thumbResult = await this.storageService.uploadFile(
                thumbnailFile,
                companyId,
                'sops/thumbnails'
            );
            thumbnailUrl = thumbResult.url;
        }

        // Create SOP with uploaded file URL
        return this.create(
            {
                ...createDto,
                type: detectedType,
                fileUrl: fileResult.url,
                thumbnailUrl,
            },
            currentUserId,
            companyId
        );
    }

    // ============================================
    // FIND ALL
    // ============================================
    async findAll(companyId: string, query?: SopQueryDto) {
        const where: any = { companyId };

        if (query?.type) where.type = query.type;
        if (query?.status) where.status = query.status;
        if (query?.search) {
            where.OR = [
                { title: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
            ];
        }
        if (query?.tags?.length) {
            where.tags = { hasSome: query.tags };
        }

        return this.prisma.sop.findMany({
            where,
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                    },
                },
                approvedBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ============================================
    // FIND APPROVED
    // ============================================
    async findApproved(companyId: string, query?: SopQueryDto) {
        return this.findAll(companyId, { ...query, status: SopStatus.APPROVED });
    }

    // ============================================
    // FIND PENDING APPROVAL
    // ============================================
    async findPendingApproval(companyId: string) {
        return this.prisma.sop.findMany({
            where: {
                companyId,
                status: SopStatus.PENDING_APPROVAL,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        email: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    // ============================================
    // FIND ONE
    // ============================================
    async findOne(id: string, companyId: string) {
        const sop = await this.prisma.sop.findFirst({
            where: { id, companyId },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                    },
                },
                approvedBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        if (!sop) {
            throw new NotFoundException('SOP not found');
        }

        return sop;
    }

    // ============================================
    // UPDATE
    // ============================================
    async update(
        id: string,
        updateDto: UpdateSopDto,
        currentUserId: string,
        currentUserRole: UserRole,
        companyId: string
    ) {
        const sop = await this.findOne(id, companyId);

        // Only creator or admin can update
        if (sop.createdById !== currentUserId && currentUserRole === UserRole.USER) {
            throw new ForbiddenException('You can only update your own SOPs');
        }

        // If rejected, resubmit for approval
        const status = sop.status === SopStatus.REJECTED ? SopStatus.PENDING_APPROVAL : sop.status;

        const updatedSop = await this.prisma.sop.update({
            where: { id },
            data: {
                ...updateDto,
                status,
                rejectionReason: status === SopStatus.PENDING_APPROVAL ? null : sop.rejectionReason,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                    },
                },
            },
        });

        // If resubmitted for approval, notify admins
        if (sop.status === SopStatus.REJECTED && status === SopStatus.PENDING_APPROVAL) {
            const admins = await this.prisma.user.findMany({
                where: {
                    companyId,
                    role: { in: [UserRole.COMPANY, UserRole.QC_ADMIN] },
                    isActive: true,
                },
                select: { id: true },
            });

            await this.sendBulkNotifications(
                admins.map(a => a.id),
                NotificationType.SYSTEM,
                'SOP Resubmitted for Approval',
                `"${updatedSop.title}" has been updated and resubmitted for approval.`,
                {
                    sopId: updatedSop.id,
                    sopTitle: updatedSop.title,
                    resubmittedBy: currentUserId,
                }
            );
        }

        return updatedSop;
    }

    // ============================================
    // APPROVE
    // ============================================
    async approve(
        id: string,
        dto: ApproveSopDto,
        currentUserId: string,
        currentUserRole: UserRole,
        companyId: string
    ) {
        // Only admins can approve
        if (currentUserRole === UserRole.USER) {
            throw new ForbiddenException('Only admins can approve SOPs');
        }

        const sop = await this.findOne(id, companyId);

        if (sop.status !== SopStatus.PENDING_APPROVAL) {
            throw new ForbiddenException('SOP is not pending approval');
        }

        const approvedSop = await this.prisma.sop.update({
            where: { id },
            data: {
                status: SopStatus.APPROVED,
                approvedById: currentUserId,
                approvedAt: new Date(),
                rejectionReason: null,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
                approvedBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        // ============================================
        // NOTIFY CREATOR about approval
        // ============================================
        if (sop.createdById !== currentUserId) {
            await this.sendNotification(
                sop.createdById,
                NotificationType.SOP_APPROVAL,
                'SOP Approved! 🎉',
                `Your SOP "${sop.title}" has been approved and is now available to all users.`,
                {
                    sopId: sop.id,
                    sopTitle: sop.title,
                    approvedBy: currentUserId,
                    approvedAt: new Date().toISOString(),
                }
            );
        }

        // ============================================
        // NOTIFY ALL USERS about new approved SOP
        // ============================================
        const allUsers = await this.prisma.user.findMany({
            where: {
                companyId,
                isActive: true,
                id: { notIn: [currentUserId, sop.createdById] },
            },
            select: { id: true },
        });

        await this.sendBulkNotifications(
            allUsers.map(u => u.id),
            NotificationType.SYSTEM,
            'New SOP Available',
            `A new ${sop.type.toLowerCase()} SOP "${sop.title}" is now available to view.`,
            {
                sopId: sop.id,
                sopTitle: sop.title,
                sopType: sop.type,
            }
        );

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId,
                userId: currentUserId,
                activityType: 'SOP_APPROVED',
                description: `Approved SOP "${sop.title}"`,
                metadata: {
                    sopId: sop.id,
                    sopTitle: sop.title,
                    createdBy: sop.createdById,
                },
            },
        });

        return approvedSop;
    }

    // ============================================
    // REJECT
    // ============================================
    async reject(
        id: string,
        dto: RejectSopDto,
        currentUserId: string,
        currentUserRole: UserRole,
        companyId: string
    ) {
        // Only admins can reject
        if (currentUserRole === UserRole.USER) {
            throw new ForbiddenException('Only admins can reject SOPs');
        }

        const sop = await this.findOne(id, companyId);

        if (sop.status !== SopStatus.PENDING_APPROVAL) {
            throw new ForbiddenException('SOP is not pending approval');
        }

        const rejectedSop = await this.prisma.sop.update({
            where: { id },
            data: {
                status: SopStatus.REJECTED,
                rejectionReason: dto.rejectionReason,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        // ============================================
        // NOTIFY CREATOR about rejection
        // ============================================
        await this.sendNotification(
            sop.createdById,
            NotificationType.SOP_REJECTION,
            'SOP Rejected',
            `Your SOP "${sop.title}" has been rejected. Reason: ${dto.rejectionReason}`,
            {
                sopId: sop.id,
                sopTitle: sop.title,
                rejectionReason: dto.rejectionReason,
                rejectedBy: currentUserId,
            }
        );

        return rejectedSop;
    }

    // ============================================
    // INCREMENT VIEW COUNT
    // ============================================
    async incrementViewCount(id: string, companyId: string) {
        await this.findOne(id, companyId);

        return this.prisma.sop.update({
            where: { id },
            data: { viewCount: { increment: 1 } },
        });
    }

    // ============================================
    // DELETE
    // ============================================
    async delete(
        id: string,
        currentUserId: string,
        currentUserRole: UserRole,
        companyId: string
    ) {
        const sop = await this.findOne(id, companyId);

        // Only creator or admin can delete
        if (sop.createdById !== currentUserId && currentUserRole === UserRole.USER) {
            throw new ForbiddenException('You can only delete your own SOPs');
        }

        // Delete file from storage if exists
        if (sop.fileUrl) {
            const filePath = this.storageService.extractPathFromUrl(sop.fileUrl);
            if (filePath) {
                try {
                    await this.storageService.deleteFile(filePath);
                } catch (error) {
                    console.error('Failed to delete SOP file from storage:', error);
                }
            }
        }

        // Delete thumbnail from storage if exists
        if (sop.thumbnailUrl) {
            const thumbPath = this.storageService.extractPathFromUrl(sop.thumbnailUrl);
            if (thumbPath) {
                try {
                    await this.storageService.deleteFile(thumbPath);
                } catch (error) {
                    console.error('Failed to delete SOP thumbnail from storage:', error);
                }
            }
        }

        await this.prisma.sop.delete({ where: { id } });

        // Notify creator if deleted by admin
        if (sop.createdById !== currentUserId) {
            await this.sendNotification(
                sop.createdById,
                NotificationType.SYSTEM,
                'SOP Deleted',
                `Your SOP "${sop.title}" has been deleted by an administrator.`,
                {
                    sopTitle: sop.title,
                    deletedBy: currentUserId,
                }
            );
        }

        return { message: 'SOP deleted successfully' };
    }

    // ============================================
    // GET STATS
    // ============================================
    async getStats(companyId: string) {
        const [total, approved, pending, rejected, byType] = await Promise.all([
            this.prisma.sop.count({ where: { companyId } }),
            this.prisma.sop.count({ where: { companyId, status: SopStatus.APPROVED } }),
            this.prisma.sop.count({ where: { companyId, status: SopStatus.PENDING_APPROVAL } }),
            this.prisma.sop.count({ where: { companyId, status: SopStatus.REJECTED } }),
            this.prisma.sop.groupBy({
                by: ['type'],
                where: { companyId },
                _count: true,
            }),
        ]);

        // Get total views
        const totalViews = await this.prisma.sop.aggregate({
            where: { companyId },
            _sum: { viewCount: true },
        });

        // Get most viewed SOPs
        const mostViewed = await this.prisma.sop.findMany({
            where: { companyId, status: SopStatus.APPROVED },
            orderBy: { viewCount: 'desc' },
            take: 5,
            select: {
                id: true,
                title: true,
                type: true,
                viewCount: true,
            },
        });

        return {
            total,
            approved,
            pending,
            rejected,
            totalViews: totalViews._sum.viewCount || 0,
            byType: byType.map((t) => ({ type: t.type, count: t._count })),
            mostViewed,
        };
    }

    // ============================================
    // GET USER'S SOPs
    // ============================================
    async findUserSops(userId: string, companyId: string) {
        return this.prisma.sop.findMany({
            where: {
                companyId,
                createdById: userId,
            },
            include: {
                approvedBy: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
}