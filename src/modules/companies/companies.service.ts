// src/modules/companies/companies.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { StorageService } from '../storage/storage.service';
import { UpdateCompanyDto, UpdateCompanyLogoDto, UpdateCompanyNameDto } from './dto/companies.dto';

@Injectable()
export class CompaniesService {
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
        private storageService: StorageService,
    ) { }

    async findOne(id: string) {
        const company = await this.prisma.company.findUnique({
            where: { id },
            include: {
                users: true,
                departments: true,
                projects: true,
                sops: true,
            },
        });

        if (!company) {
            throw new NotFoundException('Company not found');
        }

        // Add helper field for frontend
        return {
            ...company,
            canChangeName: company.nameChangedAt === null,
        };
    }

    /**
     * Update company details
     * Note: Name can only be changed once (if nameChangedAt is null)
     */
    async update(id: string, updateDto: UpdateCompanyDto, currentUserRole: UserRole) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can update company details');
        }

        const company = await this.prisma.company.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                nameChangedAt: true,
                subscriptionStatus: true,
                trialEndsAt: true,
                subscriptionEndsAt: true,
            }
        });

        if (!company) {
            throw new NotFoundException('Company not found');
        }

        // Check if trying to change name when already changed
        if (updateDto.name && updateDto.name !== company.name) {
            if (company.nameChangedAt !== null) {
                throw new BadRequestException(
                    'Company name can only be changed once. The name has already been changed previously.'
                );
            }

            // Check if new name is unique
            const existingCompany = await this.prisma.company.findUnique({
                where: { name: updateDto.name },
            });

            if (existingCompany && existingCompany.id !== id) {
                throw new ConflictException('A company with this name already exists');
            }
        }

        // Prepare update data
        const updateData: any = { ...updateDto };

        // If name is being changed and it's allowed, set nameChangedAt
        if (updateDto.name && updateDto.name !== company.name && company.nameChangedAt === null) {
            updateData.nameChangedAt = new Date();
        }

        // Remove name from update if it's the same (no need to update)
        if (updateDto.name === company.name) {
            delete updateData.name;
        }

        const updatedCompany = await this.prisma.company.update({
            where: { id },
            data: updateData,
        });

        // Handle subscription status email notifications
        if ((updateDto as any).subscriptionStatus && (updateDto as any).subscriptionStatus !== company.subscriptionStatus) {
            try {
                const companyAdmin = await this.prisma.user.findFirst({
                    where: {
                        companyId: id,
                        role: UserRole.COMPANY
                    },
                    select: { email: true, firstName: true }
                });

                if (companyAdmin) {
                    switch ((updateDto as any).subscriptionStatus) {
                        case SubscriptionStatus.ACTIVE:
                            await this.emailService.sendAccountActivatedEmail(
                                companyAdmin.email,
                                companyAdmin.firstName
                            );
                            break;
                        case SubscriptionStatus.EXPIRED:
                        case SubscriptionStatus.CANCELLED:
                            await this.emailService.sendSubscriptionExpiredEmail(
                                companyAdmin.email,
                                companyAdmin.firstName,
                                updatedCompany.name
                            );
                            break;
                    }
                }
            } catch (error) {
                console.error('Failed to send subscription status email:', error);
            }
        }

        return {
            ...updatedCompany,
            canChangeName: updatedCompany.nameChangedAt === null,
        };
    }

    /**
     * Update company name (can only be done once)
     */
    async updateName(id: string, dto: UpdateCompanyNameDto, currentUserRole: UserRole) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can update company name');
        }

        const company = await this.prisma.company.findUnique({
            where: { id },
            select: { id: true, name: true, nameChangedAt: true }
        });

        if (!company) {
            throw new NotFoundException('Company not found');
        }

        // Check if name has already been changed
        if (company.nameChangedAt !== null) {
            throw new BadRequestException(
                'Company name can only be changed once. The name was already changed on ' +
                company.nameChangedAt.toISOString().split('T')[0]
            );
        }

        // Check if new name is same as current
        if (dto.name === company.name) {
            throw new BadRequestException('New name is the same as current name');
        }

        // Check if new name is unique
        const existingCompany = await this.prisma.company.findUnique({
            where: { name: dto.name },
        });

        if (existingCompany) {
            throw new ConflictException('A company with this name already exists');
        }

        const updatedCompany = await this.prisma.company.update({
            where: { id },
            data: {
                name: dto.name,
                nameChangedAt: new Date(),
            },
        });

        return {
            ...updatedCompany,
            canChangeName: false,
            message: 'Company name updated successfully. Note: This was your one-time name change.',
        };
    }

    /**
     * Update company logo
     * Logo can be changed anytime
     */
    async updateLogo(
        id: string,
        file: Express.Multer.File,
        currentUserRole: UserRole
    ) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can update company logo');
        }

        const company = await this.prisma.company.findUnique({
            where: { id },
            select: { id: true, logo: true }
        });

        if (!company) {
            throw new NotFoundException('Company not found');
        }

        // Delete old logo if exists
        if (company.logo) {
            try {
                const oldPath = this.storageService.extractPathFromUrl(company.logo);
                if (oldPath) {
                    await this.storageService.deleteFile(oldPath);
                }
            } catch (error) {
                console.error('Failed to delete old logo:', error);
                // Continue with upload even if delete fails
            }
        }

        // Upload new logo
        const uploadResult = await this.storageService.uploadFile(
            file,
            id,
            'logos',
            {
                maxSizeMB: 5,
                allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
            }
        );

        const updatedCompany = await this.prisma.company.update({
            where: { id },
            data: { logo: uploadResult.url },
        });

        return {
            ...updatedCompany,
            canChangeName: updatedCompany.nameChangedAt === null,
            logoUpload: {
                url: uploadResult.url,
                path: uploadResult.path,
                size: uploadResult.size,
            },
        };
    }

    /**
     * Remove company logo
     */
    async removeLogo(id: string, currentUserRole: UserRole) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can remove company logo');
        }

        const company = await this.prisma.company.findUnique({
            where: { id },
            select: { id: true, logo: true }
        });

        if (!company) {
            throw new NotFoundException('Company not found');
        }

        if (!company.logo) {
            throw new BadRequestException('Company does not have a logo to remove');
        }

        // Delete logo from storage
        try {
            const logoPath = this.storageService.extractPathFromUrl(company.logo);
            if (logoPath) {
                await this.storageService.deleteFile(logoPath);
            }
        } catch (error) {
            console.error('Failed to delete logo from storage:', error);
        }

        const updatedCompany = await this.prisma.company.update({
            where: { id },
            data: { logo: null },
        });

        return {
            ...updatedCompany,
            canChangeName: updatedCompany.nameChangedAt === null,
            message: 'Logo removed successfully',
        };
    }

    async getCompanyStats(companyId: string) {
        const [company, totalUsers, activeUsers, totalDepartments, totalProjects, totalSops] = await Promise.all([
            this.prisma.company.findUnique({ where: { id: companyId } }),
            this.prisma.user.count({ where: { companyId } }),
            this.prisma.user.count({ where: { companyId, isActive: true } }),
            this.prisma.department.count({ where: { companyId } }),
            this.prisma.project.count({ where: { companyId } }),
            this.prisma.sop.count({ where: { companyId } }),
        ]);

        if (!company) {
            throw new NotFoundException('Company not found');
        }

        // Check for trial ending soon (3 days or less)
        const now = new Date();
        if (company.subscriptionStatus === SubscriptionStatus.TRIAL && company.trialEndsAt) {
            const daysRemaining = Math.ceil((company.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

            if (daysRemaining <= 3 && daysRemaining > 0) {
                try {
                    const companyAdmin = await this.prisma.user.findFirst({
                        where: {
                            companyId,
                            role: UserRole.COMPANY
                        },
                        select: { email: true, firstName: true }
                    });

                    if (companyAdmin) {
                        await this.emailService.sendTrialEndingSoonEmail(
                            companyAdmin.email,
                            companyAdmin.firstName,
                            company.name,
                            daysRemaining
                        );
                    }
                } catch (error) {
                    console.error('Failed to send trial ending email:', error);
                }
            }
        }

        return {
            totalUsers,
            activeUsers,
            totalDepartments,
            totalProjects,
            totalSops,
            subscriptionStatus: company.subscriptionStatus,
            trialEndsAt: company.trialEndsAt,
            canChangeName: company.nameChangedAt === null,
            nameChangedAt: company.nameChangedAt,
        };
    }
}