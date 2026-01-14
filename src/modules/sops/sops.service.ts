// src/modules/sops/sops.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, SopStatus, NotificationType } from '@prisma/client';
import { CreateSopDto, UpdateSopDto, ApproveSopDto, RejectSopDto, SopQueryDto } from './dto/sops.dto';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../email/email.service'; // Add this import

@Injectable()
export class SopsService {
    constructor(
        private prisma: PrismaService,
        private storageService: StorageService,
        private emailService: EmailService // Add this
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
    // Helper: Get user email and name
    // ============================================
    private async getUserEmailAndName(userId: string): Promise<{ email: string; firstName: string; fullName: string }> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, firstName: true, lastName: true }
        });

        if (!user) {
            throw new NotFoundException(`User ${userId} not found`);
        }

        return {
            email: user.email,
            firstName: user.firstName,
            fullName: `${user.firstName} ${user.lastName}`
        };
    }

    // ============================================
    // Helper: Send SOP email to admins
    // ============================================
    private async sendSopEmailToAdmins(
        companyId: string,
        creatorId: string,
        sopTitle: string,
        sopType: string,
        creatorName: string,
        isResubmitted: boolean = false
    ) {
        const admins = await this.prisma.user.findMany({
            where: {
                companyId,
                role: { in: [UserRole.COMPANY, UserRole.QC_ADMIN] },
                isActive: true,
                id: { not: creatorId },
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
            },
        });

        if (admins.length === 0) return;

        // Send emails to admins
        for (const admin of admins) {
            await this.emailService.sendSopPendingApprovalEmail(
                [admin.email],
                sopTitle,
                sopType,
                creatorName
            );
        }

        // Send bulk notifications
        await this.sendBulkNotifications(
            admins.map(a => a.id),
            NotificationType.SYSTEM,
            isResubmitted ? 'SOP Resubmitted for Approval' : 'New SOP Pending Approval',
            isResubmitted
                ? `"${sopTitle}" has been updated and resubmitted for approval by ${creatorName}.`
                : `"${sopTitle}" has been submitted for approval by ${creatorName}.`,
            {
                sopTitle,
                sopType,
                createdBy: creatorId,
                isResubmitted,
            }
        );
    }

    // ============================================
    // CREATE SOP
    // ============================================
    async create(createDto: CreateSopDto, currentUserId: string, companyId: string) {
        // Get creator details for email
        const creator = await this.getUserEmailAndName(currentUserId);

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
        // EMAIL & NOTIFY ALL ADMINS about new SOP pending approval
        // ============================================
        await this.sendSopEmailToAdmins(
            companyId,
            currentUserId,
            sop.title,
            sop.type,
            creator.fullName
        );

        // ============================================
        // EMAIL: Send confirmation to creator
        // ============================================
        await this.emailService.sendEmail({
            to: creator.email,
            subject: 'SOP Submission Confirmation',
            html: `
                <h2>Your SOP Has Been Submitted! 📄</h2>
                <p>Hi ${creator.firstName},</p>
                <p>Your SOP "<strong>${sop.title}</strong>" has been successfully submitted for approval.</p>
                <p>You'll be notified once it's reviewed by the administrators.</p>
                <p><strong>Status:</strong> Pending Approval</p>
                <p><strong>Submitted:</strong> ${new Date().toLocaleDateString()}</p>
            `
        });

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

        // Get creator details
        const creator = await this.getUserEmailAndName(sop.createdById);

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

        // If resubmitted for approval, notify admins via email
        if (sop.status === SopStatus.REJECTED && status === SopStatus.PENDING_APPROVAL) {
            await this.sendSopEmailToAdmins(
                companyId,
                currentUserId,
                updatedSop.title,
                updatedSop.type,
                creator.fullName,
                true // isResubmitted
            );

            // ============================================
            // EMAIL: Notify creator about resubmission
            // ============================================
            await this.emailService.sendEmail({
                to: creator.email,
                subject: 'SOP Resubmitted for Approval',
                html: `
                    <h2>Your SOP Has Been Resubmitted! 📄</h2>
                    <p>Hi ${creator.firstName},</p>
                    <p>Your SOP "<strong>${sop.title}</strong>" has been updated and resubmitted for approval.</p>
                    <p>The administrators will review it again shortly.</p>
                    <p><strong>Status:</strong> Pending Approval</p>
                    <p><strong>Resubmitted:</strong> ${new Date().toLocaleDateString()}</p>
                `
            });
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
                        email: true,
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
        // EMAIL & NOTIFY CREATOR about approval
        // ============================================
        if (sop.createdById !== currentUserId && approvedSop.createdBy?.email) {
            await this.emailService.sendSopApprovedEmail(
                approvedSop.createdBy.email,
                approvedSop.createdBy.firstName,
                sop.title
            );

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
        // EMAIL & NOTIFY ALL USERS about new approved SOP
        // ============================================
        const allUsers = await this.prisma.user.findMany({
            where: {
                companyId,
                isActive: true,
                id: { notIn: [currentUserId, sop.createdById] },
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true
            },
        });

        // Send email to all active users
        const userEmails = allUsers.map(u => u.email).filter(email => email);
        if (userEmails.length > 0) {
            await this.emailService.sendEmail({
                to: userEmails,
                subject: `New ${sop.type} SOP Available: ${sop.title}`,
                html: `
                    <h2>New SOP Available! 📄</h2>
                    <p>A new ${sop.type.toLowerCase()} SOP has been approved and is now available:</p>
                    <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <h3 style="margin-top: 0;">${sop.title}</h3>
                        ${sop.description ? `<p>${sop.description}</p>` : ''}
                        <p><strong>Type:</strong> ${sop.type}</p>
                        ${sop.tags?.length ? `<p><strong>Tags:</strong> ${sop.tags.join(', ')}</p>` : ''}
                    </div>
                    <p>You can view it in the SOP library.</p>
                `
            });
        }

        // Send bulk notifications
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
                        email: true,
                    },
                },
            },
        });

        // ============================================
        // EMAIL & NOTIFY CREATOR about rejection
        // ============================================
        if (rejectedSop.createdBy?.email) {
            await this.emailService.sendSopRejectedEmail(
                rejectedSop.createdBy.email,
                rejectedSop.createdBy.firstName,
                sop.title,
                dto.rejectionReason
            );

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
        }

        return rejectedSop;
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

        // Get creator details for email
        const creator = await this.getUserEmailAndName(sop.createdById);

        // Get admin details if deleted by admin
        const admin = currentUserId !== sop.createdById
            ? await this.getUserEmailAndName(currentUserId)
            : null;

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

        // ============================================
        // EMAIL: Notify creator if deleted by admin
        // ============================================
        if (sop.createdById !== currentUserId && creator.email) {
            await this.emailService.sendEmail({
                to: creator.email,
                subject: `SOP Deleted: ${sop.title}`,
                html: `
                    <h2>SOP Deleted ⚠️</h2>
                    <p>Hi ${creator.firstName},</p>
                    <p>Your SOP "<strong>${sop.title}</strong>" has been deleted by ${admin?.fullName || 'an administrator'}.</p>
                    <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                    <p>If you believe this was done in error, please contact the administrator.</p>
                `
            });
        }

        // Send notification to creator
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