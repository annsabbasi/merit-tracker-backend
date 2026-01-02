// src/modules/projects/projects.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, ProjectMemberRole, NotificationType } from '@prisma/client';
import { CreateProjectDto, UpdateProjectDto, AddProjectMembersDto, RemoveProjectMembersDto, UpdateMemberRoleDto, ProjectQueryDto } from './dto/projects.dto';

@Injectable()
export class ProjectsService {
    constructor(private prisma: PrismaService) { }

    // Helper function to convert date string to proper DateTime
    private toDateTime(dateString?: string): Date | undefined {
        if (!dateString) return undefined;
        if (dateString.includes('T')) {
            return new Date(dateString);
        }
        return new Date(`${dateString}T00:00:00.000Z`);
    }

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
    // CREATE PROJECT - ONLY COMPANY ADMIN CAN CREATE
    // ============================================
    async create(createDto: CreateProjectDto, currentUserRole: UserRole, currentUserId: string, companyId: string) {
        // ============================================
        // RESTRICTION: Only COMPANY role can create projects
        // ============================================
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company administrators can create projects. Please contact your company admin.');
        }

        const { memberIds, startDate, endDate, departmentId, ...restProjectData } = createDto;

        // ============================================
        // VALIDATE: Department must exist and belong to company
        // ============================================
        const department = await this.prisma.department.findFirst({
            where: { id: departmentId, companyId },
            include: {
                lead: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        if (!department) {
            throw new BadRequestException('Department not found. Every project must be linked to a valid department.');
        }

        // Validate project lead if provided
        if (restProjectData.projectLeadId) {
            const lead = await this.prisma.user.findFirst({
                where: { id: restProjectData.projectLeadId, companyId, isActive: true },
            });
            if (!lead) {
                throw new BadRequestException('Project lead not found or inactive');
            }
        }

        // Prepare project data
        const projectData = {
            ...restProjectData,
            companyId,
            budget: restProjectData.budget || null,
            startDate: this.toDateTime(startDate),
            endDate: this.toDateTime(endDate),
        };

        const result = await this.prisma.$transaction(async (prisma) => {
            // Create the project
            const project = await prisma.project.create({
                data: projectData,
            });

            // ============================================
            // LINK PROJECT TO DEPARTMENT
            // ============================================
            await prisma.departmentProject.create({
                data: {
                    departmentId,
                    projectId: project.id,
                    assignedById: currentUserId,
                },
            });

            // Add members if provided
            const addedMemberIds: string[] = [];
            if (memberIds?.length) {
                const users = await prisma.user.findMany({
                    where: { id: { in: memberIds }, companyId, isActive: true },
                });
                if (users.length !== memberIds.length) {
                    throw new BadRequestException('Some users not found or inactive');
                }
                await prisma.projectMember.createMany({
                    data: memberIds.map((userId) => ({
                        projectId: project.id,
                        userId,
                        role: ProjectMemberRole.MEMBER,
                    })),
                    skipDuplicates: true,
                });
                addedMemberIds.push(...memberIds);
            }

            // Add project lead as a member with LEAD role
            if (restProjectData.projectLeadId) {
                await prisma.projectMember.upsert({
                    where: {
                        projectId_userId: {
                            projectId: project.id,
                            userId: restProjectData.projectLeadId,
                        },
                    },
                    create: {
                        projectId: project.id,
                        userId: restProjectData.projectLeadId,
                        role: ProjectMemberRole.LEAD,
                    },
                    update: { role: ProjectMemberRole.LEAD },
                });

                // Remove from addedMemberIds to avoid duplicate notification
                const leadIndex = addedMemberIds.indexOf(restProjectData.projectLeadId);
                if (leadIndex > -1) {
                    addedMemberIds.splice(leadIndex, 1);
                }
            }

            // Fetch complete project data
            const completeProject = await prisma.project.findFirst({
                where: { id: project.id, companyId },
                include: {
                    projectLead: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            avatar: true,
                            role: true,
                        },
                    },
                    members: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    email: true,
                                    avatar: true,
                                    role: true,
                                    points: true,
                                },
                            },
                        },
                        orderBy: { pointsEarned: 'desc' },
                    },
                    departments: {
                        include: {
                            department: {
                                select: { id: true, name: true, tag: true },
                            },
                        },
                    },
                    _count: {
                        select: {
                            members: true,
                            subProjects: true,
                            chatRooms: true,
                        },
                    },
                },
            });

            return { project: completeProject, addedMemberIds, departmentName: department.name };
        });

        // ============================================
        // SEND NOTIFICATIONS
        // ============================================

        // Notify project lead
        if (restProjectData.projectLeadId && restProjectData.projectLeadId !== currentUserId) {
            await this.sendNotification(
                restProjectData.projectLeadId,
                NotificationType.PROJECT_ASSIGNMENT,
                'You are now a Project Lead',
                `You have been assigned as the lead for project "${result.project!.name}" in ${result.departmentName} department.`,
                {
                    projectId: result.project!.id,
                    projectName: result.project!.name,
                    departmentId,
                    departmentName: result.departmentName,
                    role: 'LEAD',
                }
            );
        }

        // Notify added members
        if (result.addedMemberIds.length > 0) {
            const membersToNotify = result.addedMemberIds.filter(id => id !== currentUserId);
            await this.sendBulkNotifications(
                membersToNotify,
                NotificationType.PROJECT_ASSIGNMENT,
                'Added to Project',
                `You have been added to project "${result.project!.name}" in ${result.departmentName} department.`,
                {
                    projectId: result.project!.id,
                    projectName: result.project!.name,
                    departmentId,
                    departmentName: result.departmentName,
                    role: 'MEMBER',
                }
            );
        }

        // Notify department head if exists and different from creator
        if (department.lead && department.lead.id !== currentUserId) {
            await this.sendNotification(
                department.lead.id,
                NotificationType.SYSTEM,
                'New Project in Your Department',
                `A new project "${result.project!.name}" has been created in your department "${department.name}".`,
                {
                    projectId: result.project!.id,
                    projectName: result.project!.name,
                    departmentId,
                    departmentName: department.name,
                }
            );
        }

        return result.project;
    }

    // ============================================
    // FIND ALL - With department filter
    // ============================================
    async findAll(companyId: string, query?: ProjectQueryDto) {
        const where: any = { companyId };

        if (query?.status) where.status = query.status;
        if (query?.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        // Filter by department
        if (query?.departmentId) {
            where.departments = {
                some: { departmentId: query.departmentId },
            };
        }

        return this.prisma.project.findMany({
            where,
            include: {
                projectLead: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                    },
                },
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                                avatar: true,
                            },
                        },
                    },
                },
                departments: {
                    include: {
                        department: {
                            select: { id: true, name: true, tag: true },
                        },
                    },
                },
                _count: { select: { members: true, subProjects: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ============================================
    // FIND ONE - Include departments
    // ============================================
    async findOne(id: string, companyId: string) {
        const project = await this.prisma.project.findFirst({
            where: { id, companyId },
            include: {
                projectLead: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                        role: true,
                    },
                },
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                                avatar: true,
                                role: true,
                                points: true,
                            },
                        },
                    },
                    orderBy: { pointsEarned: 'desc' },
                },
                subProjects: {
                    include: {
                        assignedTo: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                avatar: true,
                            },
                        },
                        createdBy: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                            },
                        },
                        qcHead: {
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
                                tasks: true,
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
                departments: {
                    include: {
                        department: {
                            select: { id: true, name: true, tag: true, description: true },
                        },
                        assignedBy: {
                            select: { id: true, firstName: true, lastName: true },
                        },
                    },
                },
                _count: {
                    select: {
                        members: true,
                        subProjects: true,
                        chatRooms: true,
                    },
                },
            },
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        return project;
    }

    // ============================================
    // FIND USER PROJECTS
    // ============================================
    async findUserProjects(userId: string, companyId: string) {
        return this.prisma.project.findMany({
            where: {
                companyId,
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
                departments: {
                    include: {
                        department: {
                            select: { id: true, name: true, tag: true },
                        },
                    },
                },
                _count: { select: { members: true, subProjects: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });
    }

    // ============================================
    // UPDATE PROJECT - Only COMPANY or Project Lead
    // ============================================
    async update(id: string, updateDto: UpdateProjectDto, currentUserRole: UserRole, currentUserId: string, companyId: string) {
        const project = await this.findOne(id, companyId);

        // Only COMPANY admin or Project Lead can update
        if (currentUserRole !== UserRole.COMPANY && project.projectLeadId !== currentUserId) {
            throw new ForbiddenException('Only company administrators or project leads can update projects');
        }

        const { startDate, endDate, ...restUpdateData } = updateDto;
        const updateData: any = { ...restUpdateData };

        if (updateDto.budget !== undefined) {
            updateData.budget = updateDto.budget;
        }
        if (startDate !== undefined) {
            updateData.startDate = startDate ? this.toDateTime(startDate) : null;
        }
        if (endDate !== undefined) {
            updateData.endDate = endDate ? this.toDateTime(endDate) : null;
        }

        // Check if project lead is changing
        const oldLeadId = project.projectLeadId;
        const newLeadId = updateDto.projectLeadId;
        const leadChanged = newLeadId && newLeadId !== oldLeadId;

        // Validate new project lead
        if (newLeadId) {
            const lead = await this.prisma.user.findFirst({
                where: { id: newLeadId, companyId, isActive: true },
            });
            if (!lead) {
                throw new BadRequestException('Project lead not found or inactive');
            }
        }

        await this.prisma.$transaction(async (prisma) => {
            await prisma.project.update({
                where: { id },
                data: updateData,
            });

            // If project lead changed, update member roles
            if (leadChanged) {
                // Demote old lead to member
                if (oldLeadId) {
                    await prisma.projectMember.updateMany({
                        where: { projectId: id, userId: oldLeadId },
                        data: { role: ProjectMemberRole.MEMBER },
                    });
                }

                // Add/promote new lead
                await prisma.projectMember.upsert({
                    where: {
                        projectId_userId: { projectId: id, userId: newLeadId! },
                    },
                    create: {
                        projectId: id,
                        userId: newLeadId!,
                        role: ProjectMemberRole.LEAD,
                    },
                    update: { role: ProjectMemberRole.LEAD },
                });
            }
        });

        // ============================================
        // SEND NOTIFICATIONS
        // ============================================

        // Notify new project lead
        if (leadChanged && newLeadId !== currentUserId) {
            await this.sendNotification(
                newLeadId!,
                NotificationType.ROLE_CHANGE,
                'You are now Project Lead',
                `You have been assigned as the lead for project "${project.name}".`,
                {
                    projectId: id,
                    projectName: project.name,
                    newRole: 'LEAD',
                }
            );
        }

        // Notify old project lead about demotion
        if (leadChanged && oldLeadId && oldLeadId !== currentUserId) {
            await this.sendNotification(
                oldLeadId,
                NotificationType.ROLE_CHANGE,
                'Project Lead Role Changed',
                `You are no longer the lead for project "${project.name}".`,
                {
                    projectId: id,
                    projectName: project.name,
                    newRole: 'MEMBER',
                }
            );
        }

        // Notify status change to all members
        if (updateDto.status && updateDto.status !== project.status) {
            const memberIds = project.members
                ?.map((m: any) => m.userId)
                .filter((memberId: string) => memberId !== currentUserId) || [];

            await this.sendBulkNotifications(
                memberIds,
                NotificationType.SYSTEM,
                'Project Status Updated',
                `Project "${project.name}" status changed to ${updateDto.status.replace('_', ' ')}.`,
                {
                    projectId: id,
                    projectName: project.name,
                    oldStatus: project.status,
                    newStatus: updateDto.status,
                }
            );
        }

        return this.findOne(id, companyId);
    }

    // ============================================
    // DELETE PROJECT - Only COMPANY admin
    // ============================================
    async delete(id: string, currentUserRole: UserRole, companyId: string) {
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company administrators can delete projects');
        }

        const project = await this.findOne(id, companyId);

        // Get all member IDs for notification
        const memberIds = project.members?.map((m: any) => m.userId) || [];

        await this.prisma.project.delete({ where: { id } });

        // Notify all members about project deletion
        await this.sendBulkNotifications(
            memberIds,
            NotificationType.SYSTEM,
            'Project Deleted',
            `Project "${project.name}" has been deleted.`,
            {
                projectId: id,
                projectName: project.name,
            }
        );

        return { message: 'Project deleted successfully' };
    }

    // ============================================
    // ADD MEMBERS - COMPANY or Project Lead only
    // ============================================
    async addMembers(id: string, dto: AddProjectMembersDto, currentUserRole: UserRole, currentUserId: string, companyId: string) {
        const project = await this.findOne(id, companyId);

        // Only COMPANY admin or Project Lead can add members
        if (currentUserRole !== UserRole.COMPANY && project.projectLeadId !== currentUserId) {
            throw new ForbiddenException('Only company administrators or project leads can add members');
        }

        const users = await this.prisma.user.findMany({
            where: { id: { in: dto.userIds }, companyId, isActive: true },
        });

        if (users.length !== dto.userIds.length) {
            throw new BadRequestException('Some users not found or inactive');
        }

        // Get existing members to avoid duplicate notifications
        const existingMemberIds = project.members?.map((m: any) => m.userId) || [];
        const newMemberIds = dto.userIds.filter(id => !existingMemberIds.includes(id));

        await this.prisma.projectMember.createMany({
            data: dto.userIds.map((userId) => ({
                projectId: id,
                userId,
                role: ProjectMemberRole.MEMBER,
            })),
            skipDuplicates: true,
        });

        // Get department name for notification
        const departmentName = project.departments?.[0]?.department?.name || 'Unknown';

        // Notify new members
        const membersToNotify = newMemberIds.filter(memberId => memberId !== currentUserId);
        await this.sendBulkNotifications(
            membersToNotify,
            NotificationType.PROJECT_ASSIGNMENT,
            'Added to Project',
            `You have been added to project "${project.name}" in ${departmentName} department.`,
            {
                projectId: id,
                projectName: project.name,
                departmentName,
                role: 'MEMBER',
                addedBy: currentUserId,
            }
        );

        return this.findOne(id, companyId);
    }

    // ============================================
    // REMOVE MEMBERS - COMPANY or Project Lead only
    // ============================================
    async removeMembers(id: string, dto: RemoveProjectMembersDto, currentUserRole: UserRole, currentUserId: string, companyId: string) {
        const project = await this.findOne(id, companyId);

        // Only COMPANY admin or Project Lead can remove members
        if (currentUserRole !== UserRole.COMPANY && project.projectLeadId !== currentUserId) {
            throw new ForbiddenException('Only company administrators or project leads can remove members');
        }

        if (project.projectLeadId && dto.userIds.includes(project.projectLeadId)) {
            throw new BadRequestException('Cannot remove project lead. Assign a new lead first.');
        }

        await this.prisma.projectMember.deleteMany({
            where: { projectId: id, userId: { in: dto.userIds } },
        });

        // Notify removed members
        const membersToNotify = dto.userIds.filter(memberId => memberId !== currentUserId);
        await this.sendBulkNotifications(
            membersToNotify,
            NotificationType.SYSTEM,
            'Removed from Project',
            `You have been removed from project "${project.name}".`,
            {
                projectId: id,
                projectName: project.name,
            }
        );

        return this.findOne(id, companyId);
    }

    // ============================================
    // UPDATE MEMBER ROLE - COMPANY or Project Lead only
    // ============================================
    async updateMemberRole(id: string, dto: UpdateMemberRoleDto, currentUserRole: UserRole, currentUserId: string, companyId: string) {
        const project = await this.findOne(id, companyId);

        // Only COMPANY admin or Project Lead can update roles
        if (currentUserRole !== UserRole.COMPANY && project.projectLeadId !== currentUserId) {
            throw new ForbiddenException('Only company administrators or project leads can update member roles');
        }

        const member = await this.prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId: id, userId: dto.userId } },
            include: { user: { select: { firstName: true, lastName: true } } },
        });

        if (!member) {
            throw new NotFoundException('Member not found in project');
        }

        const oldRole = member.role;

        await this.prisma.$transaction(async (prisma) => {
            if (dto.role === ProjectMemberRole.LEAD) {
                // Demote current lead
                if (project.projectLeadId) {
                    await prisma.projectMember.updateMany({
                        where: { projectId: id, userId: project.projectLeadId },
                        data: { role: ProjectMemberRole.MEMBER },
                    });
                }

                // Update project's projectLeadId
                await prisma.project.update({
                    where: { id },
                    data: { projectLeadId: dto.userId },
                });
            }

            await prisma.projectMember.update({
                where: { projectId_userId: { projectId: id, userId: dto.userId } },
                data: { role: dto.role },
            });
        });

        // ============================================
        // SEND NOTIFICATIONS
        // ============================================

        // Notify the user about role change
        if (dto.userId !== currentUserId) {
            await this.sendNotification(
                dto.userId,
                NotificationType.ROLE_CHANGE,
                'Project Role Updated',
                `Your role in project "${project.name}" has been changed to ${dto.role.replace('_', ' ')}.`,
                {
                    projectId: id,
                    projectName: project.name,
                    oldRole,
                    newRole: dto.role,
                }
            );
        }

        // If new lead, notify old lead
        if (dto.role === ProjectMemberRole.LEAD && project.projectLeadId && project.projectLeadId !== currentUserId) {
            await this.sendNotification(
                project.projectLeadId,
                NotificationType.ROLE_CHANGE,
                'Project Lead Role Changed',
                `You are no longer the lead for project "${project.name}". ${member.user.firstName} ${member.user.lastName} is now the lead.`,
                {
                    projectId: id,
                    projectName: project.name,
                    newRole: 'MEMBER',
                    newLeadId: dto.userId,
                }
            );
        }

        return this.findOne(id, companyId);
    }

    // ============================================
    // GET PROJECT LEADERBOARD
    // ============================================
    async getProjectLeaderboard(id: string, companyId: string) {
        await this.findOne(id, companyId);

        return this.prisma.projectMember.findMany({
            where: { projectId: id },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        avatar: true,
                        points: true,
                    },
                },
            },
            orderBy: { pointsEarned: 'desc' },
        });
    }

    // ============================================
    // GET PROJECT STATS
    // ============================================
    async getProjectStats(id: string, companyId: string) {
        await this.findOne(id, companyId);

        const [totalMembers, totalSubProjects, completedSubProjects, inProgressSubProjects, totalTimeTracked] = await Promise.all([
            this.prisma.projectMember.count({ where: { projectId: id } }),
            this.prisma.subProject.count({ where: { projectId: id } }),
            this.prisma.subProject.count({ where: { projectId: id, status: 'COMPLETED' } }),
            this.prisma.subProject.count({ where: { projectId: id, status: 'IN_PROGRESS' } }),
            this.prisma.timeTracking.aggregate({
                where: { subProject: { projectId: id } },
                _sum: { durationMinutes: true },
            }),
        ]);

        const todoSubProjects = totalSubProjects - completedSubProjects - inProgressSubProjects;
        const completionPercentage = totalSubProjects > 0
            ? Math.round((completedSubProjects / totalSubProjects) * 100)
            : 0;
        const totalTimeTrackedMinutes = totalTimeTracked._sum.durationMinutes || 0;
        const totalTimeTrackedHours = Math.round(totalTimeTrackedMinutes / 60 * 100) / 100;

        return {
            projectId: id,
            totalMembers,
            totalSubProjects,
            completedSubProjects,
            inProgressSubProjects,
            todoSubProjects,
            completionPercentage,
            totalTimeTrackedMinutes,
            totalTimeTrackedHours,
        };
    }
}