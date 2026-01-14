// src/modules/departments/departments.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, NotificationType } from '@prisma/client';
import {
    CreateDepartmentDto,
    UpdateDepartmentDto,
    AssignUsersDto,
    RemoveUsersDto,
    LinkProjectsDto,
    UnlinkProjectsDto,
    DepartmentQueryDto
} from './dto/departments.dto';
import { EmailService } from '../email/email.service';
import { EmailType } from '../email/interfaces/email.interface';

@Injectable()
export class DepartmentsService {
    constructor(private prisma: PrismaService,
        private emailService: EmailService,
    ) { }

    // Helper function to convert date string to proper DateTime
    private toDateTime(dateString?: string): Date | undefined {
        if (!dateString) return undefined;
        if (dateString.includes('T')) {
            return new Date(dateString);
        }
        return new Date(`${dateString}T00:00:00.000Z`);
    }

    /**
        * Create a new department
        * Only COMPANY can create departments
        */
    async create(createDto: CreateDepartmentDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        // Only company admin can create departments
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can create departments');
        }

        const { memberIds, projectIds, startDate, endDate, ...departmentData } = createDto;

        // Validate lead exists if provided
        if (createDto.leadId) {
            const lead = await this.prisma.user.findFirst({
                where: { id: createDto.leadId, companyId, isActive: true }
            });
            if (!lead) {
                throw new BadRequestException('Department lead not found');
            }
        }

        // Get company info for emails
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { name: true }
        });

        // Use transaction for atomic operation
        const result = await this.prisma.$transaction(async (prisma) => {
            // Create the department
            const department = await prisma.department.create({
                data: {
                    ...departmentData,
                    companyId,
                    startDate: this.toDateTime(startDate),
                    endDate: this.toDateTime(endDate),
                },
            });

            // Assign members if provided
            if (memberIds && memberIds.length > 0) {
                // Verify all users exist in company
                const users = await prisma.user.findMany({
                    where: { id: { in: memberIds }, companyId },
                    select: { id: true, email: true, firstName: true }
                });
                if (users.length !== memberIds.length) {
                    throw new BadRequestException('Some users not found in company');
                }

                await prisma.user.updateMany({
                    where: { id: { in: memberIds }, companyId },
                    data: { departmentId: department.id }
                });

                // Send notifications to assigned members
                await prisma.notification.createMany({
                    data: memberIds.map(userId => ({
                        userId,
                        type: NotificationType.DEPARTMENT_ASSIGNMENT,
                        title: 'Department Assignment',
                        message: `You have been assigned to the ${department.name} department`,
                        metadata: { departmentId: department.id, departmentName: department.name }
                    }))
                });

                // 🔥 SEND EMAILS TO ASSIGNED MEMBERS
                try {
                    for (const user of users) {
                        await this.emailService.sendDepartmentAssignmentEmail(
                            user.email,
                            user.firstName,
                            department.name
                        );
                    }
                } catch (error) {
                    console.error('Failed to send department assignment emails:', error);
                }
            }

            // Link projects if provided
            if (projectIds && projectIds.length > 0) {
                // Verify all projects exist in company
                const projects = await prisma.project.findMany({
                    where: { id: { in: projectIds }, companyId }
                });
                if (projects.length !== projectIds.length) {
                    throw new BadRequestException('Some projects not found in company');
                }

                await prisma.departmentProject.createMany({
                    data: projectIds.map(projectId => ({
                        departmentId: department.id,
                        projectId,
                        assignedById: currentUserId
                    })),
                    skipDuplicates: true
                });
            }

            // Assign lead to department as member if not already
            if (createDto.leadId) {
                const leadUser = await prisma.user.findUnique({
                    where: { id: createDto.leadId },
                    select: { email: true, firstName: true }
                });

                await prisma.user.update({
                    where: { id: createDto.leadId },
                    data: { departmentId: department.id }
                });

                // Notify the department head
                await prisma.notification.create({
                    data: {
                        userId: createDto.leadId,
                        type: NotificationType.ROLE_CHANGE,
                        title: 'Department Head Assignment',
                        message: `You have been assigned as head of the ${department.name} department`,
                        metadata: { departmentId: department.id, departmentName: department.name, role: 'HEAD' }
                    }
                });

                // 🔥 SEND EMAIL TO DEPARTMENT HEAD
                try {
                    if (leadUser) {
                        await this.emailService.sendDepartmentHeadAssignmentEmail(
                            leadUser.email,
                            leadUser.firstName,
                            department.name
                        );
                    }
                } catch (error) {
                    console.error('Failed to send department head assignment email:', error);
                }
            }

            return department;
        });

        return this.findOne(result.id, companyId);
    }


    /**
     * Get all departments with stats
     */
    async findAll(companyId: string, query?: DepartmentQueryDto) {
        const where: any = { companyId };

        if (query?.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } }
            ];
        }

        if (query?.leadId) {
            where.leadId = query.leadId;
        }

        const departments = await this.prisma.department.findMany({
            where,
            include: {
                lead: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                        role: true
                    }
                },
                users: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                        role: true,
                        points: true,
                        isActive: true
                    }
                },
                projects: {
                    include: {
                        project: {
                            select: {
                                id: true,
                                name: true,
                                status: true,
                                _count: {
                                    select: { members: true, subProjects: true }
                                }
                            }
                        }
                    }
                },
                _count: {
                    select: {
                        users: true,
                        projects: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Calculate additional stats for each department
        const departmentsWithStats = await Promise.all(
            departments.map(async (dept) => {
                const projectIds = dept.projects.map(p => p.projectId);

                // Get aggregated stats from linked projects
                let totalTasks = 0;
                let completedTasks = 0;
                let totalTimeMinutes = 0;
                let totalPoints = 0;

                if (projectIds.length > 0) {
                    const [taskStats, timeStats] = await Promise.all([
                        this.prisma.subProject.groupBy({
                            by: ['status'],
                            where: { projectId: { in: projectIds } },
                            _count: true
                        }),
                        this.prisma.timeTracking.aggregate({
                            where: { subProject: { projectId: { in: projectIds } } },
                            _sum: { durationMinutes: true }
                        })
                    ]);

                    taskStats.forEach(stat => {
                        totalTasks += stat._count;
                        if (stat.status === 'COMPLETED') {
                            completedTasks = stat._count;
                        }
                    });

                    totalTimeMinutes = timeStats._sum.durationMinutes || 0;
                }

                // Calculate total points from department members
                totalPoints = dept.users.reduce((sum, user) => sum + (user.points || 0), 0);

                return {
                    ...dept,
                    stats: {
                        totalMembers: dept._count.users,
                        activeMembers: dept.users.filter(u => u.isActive).length,
                        totalProjects: dept._count.projects,
                        totalTasks,
                        completedTasks,
                        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
                        totalTimeHours: Math.round(totalTimeMinutes / 60 * 100) / 100,
                        totalPoints
                    }
                };
            })
        );

        return departmentsWithStats;
    }

    /**
     * Get single department with full details
     */
    async findOne(id: string, companyId: string) {
        const department = await this.prisma.department.findFirst({
            where: { id, companyId },
            include: {
                lead: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                        role: true,
                        phone: true,
                        points: true
                    }
                },
                users: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                        role: true,
                        points: true,
                        isActive: true,
                        createdAt: true
                    },
                    orderBy: { points: 'desc' }
                },
                projects: {
                    include: {
                        project: {
                            include: {
                                projectLead: {
                                    select: {
                                        id: true,
                                        firstName: true,
                                        lastName: true,
                                        avatar: true
                                    }
                                },
                                members: {
                                    include: {
                                        user: {
                                            select: {
                                                id: true,
                                                firstName: true,
                                                lastName: true,
                                                avatar: true
                                            }
                                        }
                                    }
                                },
                                _count: {
                                    select: { members: true, subProjects: true }
                                }
                            }
                        },
                        assignedBy: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true
                            }
                        }
                    },
                    orderBy: { assignedAt: 'desc' }
                },
                _count: {
                    select: {
                        users: true,
                        projects: true
                    }
                }
            }
        });

        if (!department) {
            throw new NotFoundException('Department not found');
        }

        // Get detailed stats
        const projectIds = department.projects.map(p => p.projectId);

        let stats = {
            totalMembers: department._count.users,
            activeMembers: department.users.filter(u => u.isActive).length,
            totalProjects: department._count.projects,
            totalTasks: 0,
            completedTasks: 0,
            inProgressTasks: 0,
            todoTasks: 0,
            completionRate: 0,
            totalTimeHours: 0,
            totalPoints: department.users.reduce((sum, u) => sum + (u.points || 0), 0),
            avgPointsPerMember: 0
        };

        if (projectIds.length > 0) {
            const [taskStats, timeStats] = await Promise.all([
                this.prisma.subProject.groupBy({
                    by: ['status'],
                    where: { projectId: { in: projectIds } },
                    _count: true
                }),
                this.prisma.timeTracking.aggregate({
                    where: { subProject: { projectId: { in: projectIds } } },
                    _sum: { durationMinutes: true }
                })
            ]);

            taskStats.forEach(stat => {
                stats.totalTasks += stat._count;
                if (stat.status === 'COMPLETED') stats.completedTasks = stat._count;
                if (stat.status === 'IN_PROGRESS') stats.inProgressTasks = stat._count;
                if (stat.status === 'TODO') stats.todoTasks = stat._count;
            });

            stats.completionRate = stats.totalTasks > 0
                ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
                : 0;
            stats.totalTimeHours = Math.round((timeStats._sum.durationMinutes || 0) / 60 * 100) / 100;
        }

        stats.avgPointsPerMember = stats.totalMembers > 0
            ? Math.round(stats.totalPoints / stats.totalMembers)
            : 0;

        return { ...department, stats };
    }

    /**
       * Update department - Add email for lead change
       */
    async update(id: string, updateDto: UpdateDepartmentDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can update departments');
        }

        const department = await this.findOne(id, companyId);

        const { startDate, endDate, ...restData } = updateDto;

        const updateData: any = { ...restData };

        if (startDate !== undefined) {
            updateData.startDate = startDate ? this.toDateTime(startDate) : null;
        }

        if (endDate !== undefined) {
            updateData.endDate = endDate ? this.toDateTime(endDate) : null;
        }

        // If changing lead, validate and notify
        if (updateDto.leadId && updateDto.leadId !== department.leadId) {
            const newLead = await this.prisma.user.findFirst({
                where: { id: updateDto.leadId, companyId, isActive: true },
                select: { id: true, email: true, firstName: true }
            });
            if (!newLead) {
                throw new BadRequestException('New department lead not found');
            }

            // Assign new lead to department
            await this.prisma.user.update({
                where: { id: updateDto.leadId },
                data: { departmentId: id }
            });

            // Notify the new lead
            await this.prisma.notification.create({
                data: {
                    userId: updateDto.leadId,
                    type: NotificationType.ROLE_CHANGE,
                    title: 'Department Head Assignment',
                    message: `You have been assigned as head of the ${department.name} department`,
                    metadata: { departmentId: id, departmentName: department.name, role: 'HEAD' }
                }
            });

            // 🔥 SEND EMAIL TO NEW DEPARTMENT HEAD
            try {
                await this.emailService.sendDepartmentHeadAssignmentEmail(
                    newLead.email,
                    newLead.firstName,
                    department.name
                );
            } catch (error) {
                console.error('Failed to send department head assignment email:', error);
            }
        }

        await this.prisma.department.update({
            where: { id },
            data: updateData
        });

        return this.findOne(id, companyId);
    }


    /**
         * Assign users to department
         */
    async assignUsers(id: string, dto: AssignUsersDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can assign users to departments');
        }

        const department = await this.findOne(id, companyId);

        // Verify all users exist in company and get their info
        const users = await this.prisma.user.findMany({
            where: { id: { in: dto.userIds }, companyId },
            select: { id: true, email: true, firstName: true }
        });
        if (users.length !== dto.userIds.length) {
            throw new BadRequestException('Some users not found in company');
        }

        // Update users' department
        await this.prisma.user.updateMany({
            where: { id: { in: dto.userIds }, companyId },
            data: { departmentId: id }
        });

        // Send notifications
        await this.prisma.notification.createMany({
            data: dto.userIds.map(userId => ({
                userId,
                type: NotificationType.DEPARTMENT_ASSIGNMENT,
                title: 'Department Assignment',
                message: `You have been assigned to the ${department.name} department`,
                metadata: { departmentId: id, departmentName: department.name }
            }))
        });

        // 🔥 SEND EMAILS TO ASSIGNED MEMBERS
        try {
            for (const user of users) {
                await this.emailService.sendDepartmentAssignmentEmail(
                    user.email,
                    user.firstName,
                    department.name
                );
            }
        } catch (error) {
            console.error('Failed to send department assignment emails:', error);
        }

        return this.findOne(id, companyId);
    }


    /**
         * Remove users from department
         */
    async removeUsers(id: string, dto: RemoveUsersDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can remove users from departments');
        }

        const department = await this.findOne(id, companyId);

        // Cannot remove the department head without changing them first
        if (department.leadId && dto.userIds.includes(department.leadId)) {
            throw new BadRequestException('Cannot remove department head. Please assign a new head first.');
        }

        // Get user info for emails
        const usersToRemove = await this.prisma.user.findMany({
            where: {
                id: { in: dto.userIds },
                departmentId: id,
                companyId
            },
            select: { id: true, email: true, firstName: true }
        });

        // Remove users from department
        await this.prisma.user.updateMany({
            where: {
                id: { in: dto.userIds },
                departmentId: id,
                companyId
            },
            data: { departmentId: null }
        });

        // 🔥 SEND EMAILS TO REMOVED USERS
        try {
            for (const user of usersToRemove) {
                await this.emailService.sendTemplatedEmail(
                    EmailType.DEPARTMENT_REMOVED,
                    user.email,
                    {
                        recipientName: user.firstName,
                        departmentName: department.name
                    }
                );
            }
        } catch (error) {
            console.error('Failed to send department removal emails:', error);
        }

        return this.findOne(id, companyId);
    }


    /**
     * Link projects to department
     */
    async linkProjects(id: string, dto: LinkProjectsDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can link projects to departments');
        }

        const department = await this.findOne(id, companyId);

        // Verify all projects exist in company
        const projects = await this.prisma.project.findMany({
            where: { id: { in: dto.projectIds }, companyId }
        });
        if (projects.length !== dto.projectIds.length) {
            throw new BadRequestException('Some projects not found in company');
        }

        // Link projects
        await this.prisma.departmentProject.createMany({
            data: dto.projectIds.map(projectId => ({
                departmentId: id,
                projectId,
                assignedById: currentUserId
            })),
            skipDuplicates: true
        });

        return this.findOne(id, companyId);
    }

    /**
     * Unlink projects from department
     */
    async unlinkProjects(id: string, dto: UnlinkProjectsDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can unlink projects from departments');
        }

        await this.findOne(id, companyId);

        await this.prisma.departmentProject.deleteMany({
            where: {
                departmentId: id,
                projectId: { in: dto.projectIds }
            }
        });

        return this.findOne(id, companyId);
    }

    /**
     * Get department statistics
     */
    async getStats(id: string, companyId: string) {
        const department = await this.findOne(id, companyId);
        return department.stats;
    }

    /**
     * Get available projects not linked to this department
     */
    async getAvailableProjects(id: string, companyId: string) {
        const linkedProjectIds = await this.prisma.departmentProject.findMany({
            where: { departmentId: id },
            select: { projectId: true }
        });

        const linkedIds = linkedProjectIds.map(p => p.projectId);

        return this.prisma.project.findMany({
            where: {
                companyId,
                id: { notIn: linkedIds }
            },
            select: {
                id: true,
                name: true,
                status: true,
                projectLead: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatar: true
                    }
                },
                _count: {
                    select: { members: true, subProjects: true }
                }
            },
            orderBy: { name: 'asc' }
        });
    }

    /**
     * Get available users not in this department
     */
    async getAvailableUsers(id: string, companyId: string) {
        return this.prisma.user.findMany({
            where: {
                companyId,
                isActive: true,
                OR: [
                    { departmentId: null },
                    { departmentId: { not: id } }
                ]
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatar: true,
                role: true,
                points: true,
                department: {
                    select: { id: true, name: true }
                }
            },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
        });
    }

    /**
      * Delete department - Notify all members
      */
    async delete(id: string, currentUserRole: UserRole, companyId: string) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can delete departments');
        }

        const department = await this.findOne(id, companyId);

        // Get all department members for email notifications
        const departmentMembers = await this.prisma.user.findMany({
            where: { departmentId: id },
            select: { id: true, email: true, firstName: true }
        });

        // Remove all users from department before deleting
        await this.prisma.user.updateMany({
            where: { departmentId: id },
            data: { departmentId: null }
        });

        // 🔥 SEND EMAILS TO ALL MEMBERS ABOUT DEPARTMENT DELETION
        try {
            for (const member of departmentMembers) {
                await this.emailService.sendTemplatedEmail(
                    EmailType.DEPARTMENT_REMOVED,
                    member.email,
                    {
                        recipientName: member.firstName,
                        departmentName: department.name
                    }
                );
            }
        } catch (error) {
            console.error('Failed to send department deletion emails:', error);
        }

        // Delete department (cascade will remove department_projects)
        await this.prisma.department.delete({
            where: { id }
        });

        return { message: 'Department deleted successfully' };
    }
}