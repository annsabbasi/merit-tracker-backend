// src/modules/companies/companies.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { UpdateCompanyDto } from './dto/companies.dto';

@Injectable()
export class CompaniesService {
    constructor(private prisma: PrismaService) { }

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

        return this.prisma.company.update({
            where: { id },
            data: updateDto,
        });
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