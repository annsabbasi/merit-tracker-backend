// src/modules/companies/companies.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import { EmailService } from '../email/email.service'; // ADD THIS
import { EmailType } from '../email/interfaces/email.interface'; // ADD THIS
import { UpdateCompanyDto } from './dto/companies.dto';

@Injectable()
export class CompaniesService {
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService, // ADD THIS
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

        return company;
    }

    async update(id: string, updateDto: UpdateCompanyDto, currentUserRole: UserRole) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can update company details');
        }

        const oldCompany = await this.prisma.company.findUnique({
            where: { id },
            select: {
                subscriptionStatus: true,
                trialEndsAt: true,
                subscriptionEndsAt: true,
            }
        });

        const updatedCompany = await this.prisma.company.update({
            where: { id },
            data: updateDto,
        });

        // 🔥 SEND EMAIL IF SUBSCRIPTION STATUS CHANGED
        if ((updateDto as any).subscriptionStatus && (updateDto as any).subscriptionStatus !== oldCompany?.subscriptionStatus) {
            try {
                // Get company admin for notification
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
                            // Subscription activated
                            await this.emailService.sendAccountActivatedEmail(
                                companyAdmin.email,
                                companyAdmin.firstName
                            );
                            break;
                        case SubscriptionStatus.EXPIRED:
                        case SubscriptionStatus.CANCELLED:
                            // Subscription expired/cancelled
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

        return updatedCompany;
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

        // 🔥 CHECK FOR TRIAL ENDING SOON (3 days or less)
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
        };
    }
}