// src/modules/projects/projects.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, ProjectMemberRole, NotificationType, ProjectStatus } from '@prisma/client';
import { CreateProjectDto, UpdateProjectDto, AddProjectMembersDto, RemoveProjectMembersDto, UpdateMemberRoleDto, ProjectQueryDto } from './dto/projects.dto';
import { EmailService } from '../email/email.service';
import { EmailType } from '../email/interfaces/email.interface';

interface UserBasicInfo {
    id?: string;
    email: string;
    firstName: string;
}

interface LeadUserInfo extends UserBasicInfo {
    lastName?: string;
}

@Injectable()
export class ProjectsService {
    private readonly logger = new Logger(ProjectsService.name);

    constructor(
        private prisma: PrismaService,
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
        console.log("Company hitted")
        if (currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company administrators can create projects. Please contact your company admin.');
        }

        const { memberIds, startDate, endDate, departmentId, ...restProjectData } = createDto;

        // Validate Department
        const department = await this.prisma.department.findFirst({
            where: { id: departmentId, companyId },
            include: {
                lead: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });

        if (!department) {
            throw new BadRequestException('Department not found. Every project must be linked to a valid department.');
        }

        // Validate project lead if provided
        let projectLeadUser: LeadUserInfo | null = null;
        if (restProjectData.projectLeadId) {
            const lead = await this.prisma.user.findFirst({
                where: { id: restProjectData.projectLeadId, companyId, isActive: true },
                select: { id: true, email: true, firstName: true, lastName: true }
            });
            if (!lead) {
                throw new BadRequestException('Project lead not found or inactive');
            }
            projectLeadUser = lead;
        }

        // Prepare project data - NOW INCLUDING STATUS
        const projectData = {
            ...restProjectData,
            companyId,
            budget: restProjectData.budget || null,
            status: restProjectData.status || ProjectStatus.PLANNING, // Add status with default
            startDate: this.toDateTime(startDate),
            endDate: this.toDateTime(endDate),
        };

        // Get company name for emails
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { name: true }
        });

        const result = await this.prisma.$transaction(async (prisma) => {
            // Create the project
            const project = await prisma.project.create({
                data: projectData,
            });

            // Link project to department
            await prisma.departmentProject.create({
                data: {
                    departmentId,
                    projectId: project.id,
                    assignedById: currentUserId,
                },
            });

            // Add members if provided
            const addedMemberIds: string[] = [];
            let addedMembers: UserBasicInfo[] = [];
            if (memberIds?.length) {
                const users = await prisma.user.findMany({
                    where: { id: { in: memberIds }, companyId, isActive: true },
                    select: { id: true, email: true, firstName: true }
                });
                if (users.length !== memberIds.length) {
                    throw new BadRequestException('Some users not found or inactive');
                }
                addedMembers = users;

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

            // Return data for email notifications
            return {
                project: completeProject,
                addedMemberIds,
                departmentName: department.name,
                companyName: company?.name,
                projectLeadUser,
                addedMembers,
                projectName: completeProject?.name || restProjectData.name,
                projectId: project.id
            };
        });

        // 🔥 SEND PROJECT CREATED EMAIL TO DEPARTMENT HEAD
        try {
            if (department.lead && department.lead.email) {
                await this.emailService.sendTemplatedEmail(
                    EmailType.PROJECT_CREATED,
                    department.lead.email,
                    {
                        recipientName: department.lead.firstName,
                        projectName: result.projectName,
                        departmentName: result.departmentName,
                        createdBy: 'Company Admin', // You might want to get the actual admin name
                        projectUrl: `${process.env.APP_URL || 'https://merittracker.com'}/projects/${result.projectId}`
                    }
                );
            }
        } catch (error) {
            this.logger.error(`Failed to send project created email to department head:`, error);
        }

        // 🔥 SEND PROJECT LEAD ASSIGNMENT EMAIL
        if (result.projectLeadUser && result.projectLeadUser.email && result.projectLeadUser.id !== currentUserId) {
            try {
                await this.emailService.sendProjectLeadAssignmentEmail(
                    result.projectLeadUser.email,
                    result.projectLeadUser.firstName,
                    result.projectName,
                    result.departmentName
                );
            } catch (error) {
                this.logger.error(`Failed to send project lead assignment email:`, error);
            }
        }

        // 🔥 SEND PROJECT ASSIGNMENT EMAILS TO MEMBERS
        try {
            for (const member of result.addedMembers) {
                if (member.email && member.id !== currentUserId) {
                    await this.emailService.sendProjectAssignmentEmail(
                        member.email,
                        member.firstName,
                        result.projectName,
                        result.departmentName,
                        'Team Member',
                        'Company Administrator'
                    );
                }
            }
        } catch (error) {
            this.logger.error(`Failed to send project assignment emails:`, error);
        }

        // In-app notifications
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

        // Get current user info for emails
        const currentUser = await this.prisma.user.findUnique({
            where: { id: currentUserId },
            select: { firstName: true, lastName: true }
        });
        const changedBy = currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : 'System';

        // Check if project lead is changing
        const oldLeadId = project.projectLeadId;
        let oldLeadUser: LeadUserInfo | null = null;
        if (oldLeadId) {
            const lead = await this.prisma.user.findUnique({
                where: { id: oldLeadId },
                select: { email: true, firstName: true, lastName: true }
            });
            oldLeadUser = lead;
        }

        const newLeadId = updateDto.projectLeadId;
        let newLeadUser: LeadUserInfo | null = null;
        const leadChanged = newLeadId && newLeadId !== oldLeadId;

        // Validate new project lead
        if (newLeadId) {
            const lead = await this.prisma.user.findFirst({
                where: { id: newLeadId, companyId, isActive: true },
                select: { email: true, firstName: true, lastName: true }
            });
            if (!lead) {
                throw new BadRequestException('Project lead not found or inactive');
            }
            newLeadUser = lead;
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
                        projectId_userId: { projectId: id, userId: newLeadId },
                    },
                    create: {
                        projectId: id,
                        userId: newLeadId,
                        role: ProjectMemberRole.LEAD,
                    },
                    update: { role: ProjectMemberRole.LEAD },
                });
            }
        });

        // 🔥 SEND EMAIL NOTIFICATIONS FOR LEAD CHANGE
        if (leadChanged) {
            // Email to new lead
            if (newLeadUser && newLeadUser.email && newLeadId !== currentUserId) {
                try {
                    await this.emailService.sendProjectLeadAssignmentEmail(
                        newLeadUser.email,
                        newLeadUser.firstName,
                        project.name,
                        project.departments?.[0]?.department?.name || 'Unknown Department'
                    );
                } catch (error) {
                    this.logger.error(`Failed to send project lead assignment email to ${newLeadUser.email}:`, error);
                }
            }

            // Email to old lead about demotion
            if (oldLeadUser && oldLeadUser.email && oldLeadId !== currentUserId) {
                try {
                    await this.emailService.sendTemplatedEmail(
                        EmailType.ROLE_CHANGED,
                        oldLeadUser.email,
                        {
                            recipientName: oldLeadUser.firstName,
                            oldRole: 'Project Lead',
                            newRole: 'Team Member',
                            isPromotion: false,
                            changedBy: changedBy
                        }
                    );
                } catch (error) {
                    this.logger.error(`Failed to send role change email to ${oldLeadUser.email}:`, error);
                }
            }
        }

        // 🔥 SEND EMAIL FOR STATUS CHANGE
        if (updateDto.status && updateDto.status !== project.status) {
            try {
                // Get all member emails
                const members = await this.prisma.projectMember.findMany({
                    where: { projectId: id },
                    include: {
                        user: {
                            select: { email: true, firstName: true }
                        }
                    }
                });

                // Send email to all members except the one who made the change
                for (const member of members) {
                    if (member.user.email && member.userId !== currentUserId) {
                        await this.emailService.sendTemplatedEmail(
                            EmailType.PROJECT_STATUS_CHANGED,
                            member.user.email,
                            {
                                recipientName: member.user.firstName,
                                projectName: project.name,
                                oldStatus: project.status,
                                newStatus: updateDto.status,
                                changedBy: changedBy
                            }
                        );
                    }
                }
            } catch (error) {
                this.logger.error(`Failed to send project status change emails:`, error);
            }
        }

        // In-app notifications
        // Notify new project lead
        if (leadChanged && newLeadId && newLeadId !== currentUserId) {
            await this.sendNotification(
                newLeadId,
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

        // Get all member emails
        const members = await this.prisma.projectMember.findMany({
            where: { projectId: id },
            include: {
                user: {
                    select: { email: true, firstName: true }
                }
            }
        });

        // Get company admin info
        const admin = await this.prisma.user.findFirst({
            where: { companyId, role: UserRole.COMPANY },
            select: { firstName: true, lastName: true }
        });
        const deletedBy = admin ? `${admin.firstName} ${admin.lastName}` : 'Company Administrator';

        await this.prisma.project.delete({ where: { id } });

        // 🔥 SEND PROJECT DELETED EMAILS
        try {
            for (const member of members) {
                if (member.user.email) {
                    await this.emailService.sendTemplatedEmail(
                        EmailType.PROJECT_DELETED,
                        member.user.email,
                        {
                            recipientName: member.user.firstName,
                            projectName: project.name,
                            deletedBy: deletedBy,
                            deletionDate: new Date().toLocaleDateString()
                        }
                    );
                }
            }
        } catch (error) {
            this.logger.error(`Failed to send project deletion emails:`, error);
        }

        // In-app notifications
        const memberIds = members.map(m => m.userId);
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
            select: { id: true, email: true, firstName: true, lastName: true }
        });

        if (users.length !== dto.userIds.length) {
            throw new BadRequestException('Some users not found or inactive');
        }

        // Get existing members to avoid duplicate notifications
        const existingMemberIds = project.members?.map((m: any) => m.userId) || [];
        const newMembers = users.filter(user => !existingMemberIds.includes(user.id));

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

        // Get who added the members
        const addedByUser = await this.prisma.user.findUnique({
            where: { id: currentUserId },
            select: { firstName: true, lastName: true }
        });
        const addedBy = addedByUser ? `${addedByUser.firstName} ${addedByUser.lastName}` : 'Team Lead';

        // 🔥 SEND EMAILS TO NEW MEMBERS
        try {
            for (const member of newMembers) {
                if (member.email && member.id !== currentUserId) {
                    await this.emailService.sendProjectAssignmentEmail(
                        member.email,
                        member.firstName,
                        project.name,
                        departmentName,
                        'Team Member',
                        addedBy
                    );
                }
            }
        } catch (error) {
            this.logger.error(`Failed to send project assignment emails:`, error);
        }

        // In-app notifications
        const membersToNotify = newMembers
            .map(m => m.id)
            .filter(memberId => memberId !== currentUserId);

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

        // Get user info for emails before removing
        const usersToRemove = await this.prisma.user.findMany({
            where: { id: { in: dto.userIds }, companyId },
            select: { id: true, email: true, firstName: true }
        });

        await this.prisma.projectMember.deleteMany({
            where: { projectId: id, userId: { in: dto.userIds } },
        });

        // 🔥 SEND EMAILS TO REMOVED MEMBERS
        try {
            for (const user of usersToRemove) {
                if (user.email && user.id !== currentUserId) {
                    await this.emailService.sendTemplatedEmail(
                        EmailType.PROJECT_DELETED,
                        user.email,
                        {
                            recipientName: user.firstName,
                            projectName: project.name,
                            action: 'removed from',
                            reason: 'removed by project administrator'
                        }
                    );
                }
            }
        } catch (error) {
            this.logger.error(`Failed to send removal emails:`, error);
        }

        // In-app notifications
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
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            },
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

        // Get current user info for email
        const changedByUser = await this.prisma.user.findUnique({
            where: { id: currentUserId },
            select: { firstName: true, lastName: true }
        });
        const changedBy = changedByUser ? `${changedByUser.firstName} ${changedByUser.lastName}` : 'System';

        // 🔥 SEND EMAIL FOR ROLE CHANGE
        if (member.user.email && dto.userId !== currentUserId) {
            try {
                await this.emailService.sendTemplatedEmail(
                    EmailType.ROLE_CHANGED,
                    member.user.email,
                    {
                        recipientName: member.user.firstName,
                        oldRole: this.formatRole(oldRole),
                        newRole: this.formatRole(dto.role),
                        isPromotion: dto.role === ProjectMemberRole.LEAD,
                        changedBy: changedBy
                    }
                );
            } catch (error) {
                this.logger.error(`Failed to send role change email to ${member.user.email}:`, error);
            }
        }

        // If new lead, notify old lead
        if (dto.role === ProjectMemberRole.LEAD && project.projectLeadId && project.projectLeadId !== currentUserId) {
            const oldLead = await this.prisma.user.findUnique({
                where: { id: project.projectLeadId },
                select: { email: true, firstName: true }
            });

            if (oldLead && oldLead.email) {
                try {
                    await this.emailService.sendTemplatedEmail(
                        EmailType.ROLE_CHANGED,
                        oldLead.email,
                        {
                            recipientName: oldLead.firstName,
                            oldRole: 'Project Lead',
                            newRole: 'Team Member',
                            isPromotion: false,
                            changedBy: changedBy,
                            newLeadName: `${member.user.firstName} ${member.user.lastName}`
                        }
                    );
                } catch (error) {
                    this.logger.error(`Failed to send demotion email to ${oldLead.email}:`, error);
                }
            }

            // In-app notification for old lead
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

        // In-app notification for the user
        if (dto.userId !== currentUserId) {
            await this.sendNotification(
                dto.userId,
                NotificationType.ROLE_CHANGE,
                'Project Role Updated',
                `Your role in project "${project.name}" has been changed to ${this.formatRole(dto.role)}.`,
                {
                    projectId: id,
                    projectName: project.name,
                    oldRole: this.formatRole(oldRole),
                    newRole: this.formatRole(dto.role),
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

    // ============================================
    // HELPER: Format role for display
    // ============================================
    private formatRole(role: ProjectMemberRole): string {
        switch (role) {
            case ProjectMemberRole.LEAD:
                return 'Project Lead';
            case ProjectMemberRole.MEMBER:
                return 'Team Member';
            case (ProjectMemberRole as any).VIEWER:
                return 'Viewer';
            default:
                return role.replace('_', ' ');
        }
    }
}