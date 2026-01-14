// src/modules/sub-projects/sub-projects.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, SubProjectMemberRole, NotificationType, SubProjectStatus, ActivityType } from '@prisma/client';
import {
    CreateSubProjectDto,
    UpdateSubProjectDto,
    AssignQcHeadDto,
    AddSubProjectMembersDto,
    RemoveSubProjectMembersDto,
    UpdateSubProjectMemberRoleDto,
    SubProjectQueryDto,
    AssignSubProjectDto,
} from './dto/sub-projects.dto';

@Injectable()
export class SubProjectsService {
    constructor(private prisma: PrismaService) { }

    private toDateTime(dateString?: string): Date | undefined {
        if (!dateString) return undefined;
        return dateString.includes('T') ? new Date(dateString) : new Date(`${dateString}T00:00:00.000Z`);
    }

    private async sendNotification(userId: string, type: NotificationType, title: string, message: string, metadata?: Record<string, any>) {
        await this.prisma.notification.create({ data: { userId, type, title, message, metadata: metadata || {} } });
    }

    private async sendBulkNotifications(userIds: string[], type: NotificationType, title: string, message: string, metadata?: Record<string, any>) {
        if (userIds.length === 0) return;
        await this.prisma.notification.createMany({ data: userIds.map(userId => ({ userId, type, title, message, metadata: metadata || {} })) });
    }

    private async logActivity(companyId: string, userId: string, activityType: ActivityType, description: string, metadata?: Record<string, any>) {
        await this.prisma.activityLog.create({ data: { companyId, userId, activityType, description, metadata } });
    }

    // ============================================
    // CREATE SUBPROJECT - ANYONE IN COMPANY CAN CREATE
    // ============================================
    // REPLACE the create method in: src/modules/sub-projects/sub-projects.service.ts

    async create(createDto: CreateSubProjectDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const project = await this.prisma.project.findFirst({
            where: { id: createDto.projectId, companyId },
            include: {
                members: true,
                projectLead: { select: { id: true, firstName: true, lastName: true } },
                departments: { include: { department: { select: { id: true, name: true } } } },
            },
        });

        if (!project) throw new NotFoundException('Project not found');

        const user = await this.prisma.user.findFirst({ where: { id: currentUserId, companyId, isActive: true } });
        if (!user) throw new ForbiddenException('You must be an active member of this company');

        // Validate QC Head if provided
        if (createDto.qcHeadId) {
            const qcHead = await this.prisma.user.findFirst({
                where: { id: createDto.qcHeadId, companyId, isActive: true, role: UserRole.QC_ADMIN },
            });
            if (!qcHead) throw new BadRequestException('QC Head must be a user with QC_ADMIN role');
        }

        // Handle legacy assignedToId - add to memberIds
        let memberIdsToAdd = createDto.memberIds || [];
        if (createDto.assignedToId && !memberIdsToAdd.includes(createDto.assignedToId)) {
            memberIdsToAdd = [...memberIdsToAdd, createDto.assignedToId];
        }

        // Validate members
        let validMemberIds: string[] = [];
        if (memberIdsToAdd.length > 0) {
            const validMembers = await this.prisma.user.findMany({
                where: { id: { in: memberIdsToAdd }, companyId, isActive: true },
                select: { id: true },
            });
            validMemberIds = validMembers.map(m => m.id);
            if (validMemberIds.length !== memberIdsToAdd.length) {
                throw new BadRequestException('Some member IDs are invalid');
            }
        }

        const { dueDate, memberIds, assignedToId, ...restData } = createDto;

        const result = await this.prisma.$transaction(async (prisma) => {
            const subProject = await prisma.subProject.create({
                data: {
                    ...restData,
                    status: restData.status || SubProjectStatus.TODO, // Use provided status or default to TODO
                    dueDate: this.toDateTime(dueDate),
                    createdById: currentUserId,
                },
            });

            // Add creator as member
            await prisma.subProjectMember.create({
                data: { subProjectId: subProject.id, userId: currentUserId, role: SubProjectMemberRole.CONTRIBUTOR },
            });

            // Add QC Head
            if (createDto.qcHeadId && createDto.qcHeadId !== currentUserId) {
                await prisma.subProjectMember.create({
                    data: { subProjectId: subProject.id, userId: createDto.qcHeadId, role: SubProjectMemberRole.QC_HEAD },
                });
            }

            // Add additional members
            const membersToAdd = validMemberIds.filter(id => id !== currentUserId && id !== createDto.qcHeadId);
            if (membersToAdd.length > 0) {
                await prisma.subProjectMember.createMany({
                    data: membersToAdd.map(userId => ({ subProjectId: subProject.id, userId, role: SubProjectMemberRole.MEMBER })),
                    skipDuplicates: true,
                });
            }

            return subProject;
        });

        const departmentName = project.departments?.[0]?.department?.name || 'Unknown';

        // Notifications
        if (createDto.qcHeadId && createDto.qcHeadId !== currentUserId) {
            await this.sendNotification(createDto.qcHeadId, NotificationType.SUBPROJECT_QC_HEAD_ASSIGNED, 'Assigned as QC Head',
                `You have been assigned as QC Head for subproject "${result.title}" in project "${project.name}".`,
                { subProjectId: result.id, projectId: project.id, projectName: project.name, departmentName });
        }

        const membersToNotify = validMemberIds.filter(id => id !== currentUserId && id !== createDto.qcHeadId);
        if (membersToNotify.length > 0) {
            await this.sendBulkNotifications(membersToNotify, NotificationType.SUBPROJECT_MEMBER_ADDED, 'Added to Subproject',
                `You have been added to subproject "${result.title}" in project "${project.name}".`,
                { subProjectId: result.id, projectId: project.id, projectName: project.name });
        }

        if (project.projectLead && project.projectLead.id !== currentUserId) {
            await this.sendNotification(project.projectLead.id, NotificationType.SYSTEM, 'New Subproject Created',
                `A new subproject "${result.title}" has been created in your project "${project.name}".`,
                { subProjectId: result.id, projectId: project.id });
        }

        await this.logActivity(companyId, currentUserId, ActivityType.SUBPROJECT_CREATED,
            `Created subproject "${result.title}"`, { subProjectId: result.id, projectId: project.id });

        return this.findOne(result.id, companyId);
    }

    // ============================================
    // UPDATE SUBPROJECT
    // ============================================
    async update(id: string, updateDto: UpdateSubProjectDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const subProject = await this.findOne(id, companyId);

        if (!this.canManageSubProject(currentUserRole, currentUserId, subProject)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        if (updateDto.qcHeadId && updateDto.qcHeadId !== subProject.qcHeadId) {
            const newQcHead = await this.prisma.user.findFirst({
                where: { id: updateDto.qcHeadId, companyId, isActive: true, role: UserRole.QC_ADMIN },
            });
            if (!newQcHead) throw new BadRequestException('QC Head must be QC_ADMIN');
        }

        const { dueDate, ...restData } = updateDto;
        const updateData: any = { ...restData };
        if (dueDate !== undefined) updateData.dueDate = dueDate ? this.toDateTime(dueDate) : null;
        if (updateDto.status === SubProjectStatus.COMPLETED && subProject.status !== SubProjectStatus.COMPLETED) {
            updateData.completedAt = new Date();
        }

        const oldQcHeadId = subProject.qcHeadId;
        const newQcHeadId = updateDto.qcHeadId;

        await this.prisma.$transaction(async (prisma) => {
            await prisma.subProject.update({ where: { id }, data: updateData });

            if (newQcHeadId && newQcHeadId !== oldQcHeadId) {
                if (oldQcHeadId) {
                    await prisma.subProjectMember.updateMany({
                        where: { subProjectId: id, userId: oldQcHeadId },
                        data: { role: SubProjectMemberRole.MEMBER },
                    });
                }
                await prisma.subProjectMember.upsert({
                    where: { subProjectId_userId: { subProjectId: id, userId: newQcHeadId } },
                    create: { subProjectId: id, userId: newQcHeadId, role: SubProjectMemberRole.QC_HEAD },
                    update: { role: SubProjectMemberRole.QC_HEAD },
                });
            }
        });

        // Notifications
        if (newQcHeadId && newQcHeadId !== oldQcHeadId && newQcHeadId !== currentUserId) {
            await this.sendNotification(newQcHeadId, NotificationType.SUBPROJECT_QC_HEAD_ASSIGNED, 'Assigned as QC Head',
                `You have been assigned as QC Head for "${subProject.title}".`, { subProjectId: id });
        }

        if (updateDto.status && updateDto.status !== subProject.status) {
            const memberIds = subProject.members?.map((m: any) => m.userId).filter((mid: string) => mid !== currentUserId) || [];
            await this.sendBulkNotifications(memberIds, NotificationType.SYSTEM, 'Subproject Status Updated',
                `"${subProject.title}" status changed to ${updateDto.status.replace('_', ' ')}.`, { subProjectId: id });
        }

        await this.logActivity(companyId, currentUserId, ActivityType.SUBPROJECT_UPDATED, `Updated "${subProject.title}"`, { subProjectId: id });

        return this.findOne(id, companyId);
    }

    // ============================================
    // ASSIGN QC HEAD
    // ============================================
    async assignQcHead(id: string, dto: AssignQcHeadDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        if (currentUserRole !== UserRole.COMPANY && currentUserRole !== UserRole.QC_ADMIN) {
            const subProject = await this.findOne(id, companyId);
            if (subProject.project.projectLeadId !== currentUserId) {
                throw new ForbiddenException('Only company admin, QC admin, or project lead can assign QC Head');
            }
        }

        const qcHead = await this.prisma.user.findFirst({
            where: { id: dto.qcHeadId, companyId, isActive: true, role: UserRole.QC_ADMIN },
        });
        if (!qcHead) throw new BadRequestException('QC Head must be QC_ADMIN');

        return this.update(id, { qcHeadId: dto.qcHeadId }, currentUserId, currentUserRole, companyId);
    }

    // ============================================
    // ADD MEMBERS - ANYONE CAN ADD COMPANY MEMBERS
    // ============================================
    async addMembers(id: string, dto: AddSubProjectMembersDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const subProject = await this.findOne(id, companyId);

        const users = await this.prisma.user.findMany({
            where: { id: { in: dto.userIds }, companyId, isActive: true },
        });
        if (users.length !== dto.userIds.length) {
            throw new BadRequestException('Some users not found in this company');
        }

        const existingMemberIds = subProject.members?.map((m: any) => m.userId) || [];
        const newMemberIds = dto.userIds.filter(uid => !existingMemberIds.includes(uid));

        if (newMemberIds.length === 0) throw new BadRequestException('All users are already members');

        await this.prisma.subProjectMember.createMany({
            data: newMemberIds.map(userId => ({
                subProjectId: id, userId, role: dto.role || SubProjectMemberRole.MEMBER,
            })),
            skipDuplicates: true,
        });

        const membersToNotify = newMemberIds.filter(mid => mid !== currentUserId);
        await this.sendBulkNotifications(membersToNotify, NotificationType.SUBPROJECT_MEMBER_ADDED, 'Added to Subproject',
            `You have been added to "${subProject.title}".`, { subProjectId: id, projectId: subProject.project.id });

        await this.logActivity(companyId, currentUserId, ActivityType.SUBPROJECT_MEMBER_ADDED,
            `Added ${newMemberIds.length} member(s) to "${subProject.title}"`, { subProjectId: id, addedMemberIds: newMemberIds });

        return this.findOne(id, companyId);
    }

    // ============================================
    // REMOVE MEMBERS
    // ============================================
    async removeMembers(id: string, dto: RemoveSubProjectMembersDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const subProject = await this.findOne(id, companyId);

        if (!this.canManageSubProject(currentUserRole, currentUserId, subProject)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        if (subProject.qcHeadId && dto.userIds.includes(subProject.qcHeadId)) {
            throw new BadRequestException('Cannot remove QC Head. Reassign first.');
        }
        if (dto.userIds.includes(subProject.createdById)) {
            throw new BadRequestException('Cannot remove creator');
        }

        await this.prisma.subProjectMember.deleteMany({
            where: { subProjectId: id, userId: { in: dto.userIds } },
        });

        const membersToNotify = dto.userIds.filter(mid => mid !== currentUserId);
        await this.sendBulkNotifications(membersToNotify, NotificationType.SYSTEM, 'Removed from Subproject',
            `You have been removed from "${subProject.title}".`, { subProjectId: id });

        await this.logActivity(companyId, currentUserId, ActivityType.SUBPROJECT_MEMBER_REMOVED,
            `Removed ${dto.userIds.length} member(s) from "${subProject.title}"`, { subProjectId: id });

        return this.findOne(id, companyId);
    }

    // ============================================
    // UPDATE MEMBER ROLE
    // ============================================
    async updateMemberRole(id: string, dto: UpdateSubProjectMemberRoleDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const subProject = await this.findOne(id, companyId);

        if (!this.canManageSubProject(currentUserRole, currentUserId, subProject)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        const member = await this.prisma.subProjectMember.findUnique({
            where: { subProjectId_userId: { subProjectId: id, userId: dto.userId } },
            include: { user: { select: { role: true } } },
        });
        if (!member) throw new NotFoundException('Member not found');

        if (dto.role === SubProjectMemberRole.QC_HEAD && member.user.role !== UserRole.QC_ADMIN) {
            throw new BadRequestException('Only QC_ADMIN users can be QC_HEAD');
        }

        await this.prisma.$transaction(async (prisma) => {
            if (dto.role === SubProjectMemberRole.QC_HEAD) {
                if (subProject.qcHeadId && subProject.qcHeadId !== dto.userId) {
                    await prisma.subProjectMember.updateMany({
                        where: { subProjectId: id, userId: subProject.qcHeadId },
                        data: { role: SubProjectMemberRole.MEMBER },
                    });
                }
                await prisma.subProject.update({ where: { id }, data: { qcHeadId: dto.userId } });
            }
            await prisma.subProjectMember.update({
                where: { subProjectId_userId: { subProjectId: id, userId: dto.userId } },
                data: { role: dto.role },
            });
        });

        if (dto.userId !== currentUserId) {
            await this.sendNotification(dto.userId, NotificationType.ROLE_CHANGE, 'Role Updated',
                `Your role in "${subProject.title}" changed to ${dto.role.replace('_', ' ')}.`, { subProjectId: id });
        }

        return this.findOne(id, companyId);
    }

    // ============================================
    // DELETE SUBPROJECT
    // ============================================
    async delete(id: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const subProject = await this.findOne(id, companyId);

        if (!this.canManageSubProject(currentUserRole, currentUserId, subProject)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        const memberIds = subProject.members?.map((m: any) => m.userId).filter((mid: string) => mid !== currentUserId) || [];

        await this.prisma.subProject.delete({ where: { id } });

        await this.sendBulkNotifications(memberIds, NotificationType.SYSTEM, 'Subproject Deleted',
            `"${subProject.title}" has been deleted.`, { subProjectTitle: subProject.title });

        return { message: 'Subproject deleted successfully' };
    }

    // ============================================
    // GET SUBPROJECT STATS
    // ============================================
    async getSubProjectStats(id: string, companyId: string) {
        const [memberCount, taskStats, timeStats] = await Promise.all([
            this.prisma.subProjectMember.count({ where: { subProjectId: id } }),
            this.prisma.task.groupBy({ by: ['status'], where: { subProjectId: id }, _count: true }),
            this.prisma.timeTracking.aggregate({ where: { subProjectId: id }, _sum: { durationMinutes: true }, _count: true }),
        ]);

        const totalTasks = taskStats.reduce((sum, s) => sum + s._count, 0);
        const completedTasks = taskStats.find(s => s.status === 'COMPLETED')?._count || 0;
        const totalTimeMinutes = timeStats._sum.durationMinutes || 0;

        return {
            memberCount,
            taskStats: {
                total: totalTasks,
                completed: completedTasks,
                inProgress: taskStats.find(s => s.status === 'IN_PROGRESS')?._count || 0,
                todo: taskStats.find(s => s.status === 'TODO')?._count || 0,
                blocked: taskStats.find(s => s.status === 'BLOCKED')?._count || 0,
                completionPercentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
            },
            timeStats: {
                totalMinutes: totalTimeMinutes,
                totalHours: Math.round(totalTimeMinutes / 60 * 100) / 100,
                sessionCount: timeStats._count,
            },
        };
    }


    // ============================================
    // FIND ALL
    // ============================================
    async findAll(projectId: string, companyId: string, query?: SubProjectQueryDto) {
        const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
        if (!project) throw new NotFoundException('Project not found');

        const where: any = { projectId };
        if (query?.status) where.status = query.status;
        if (query?.priority) where.priority = query.priority;
        if (query?.search) {
            where.OR = [
                { title: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
            ];
        }
        if (query?.qcHeadId) where.qcHeadId = query.qcHeadId;
        if (query?.memberId) where.members = { some: { userId: query.memberId } };

        return this.prisma.subProject.findMany({
            where,
            include: {
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                qcHead: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true } },
                project: { select: { id: true, name: true } },
                members: {
                    include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true, role: true } } },
                    orderBy: { role: 'asc' },
                },
                _count: { select: { tasks: true, timeTrackings: true, members: true } },
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        });
    }

    // ============================================
    // FIND ONE
    // ============================================
    async findOne(id: string, companyId: string) {
        const subProject = await this.prisma.subProject.findFirst({
            where: { id, project: { companyId } },
            include: {
                createdBy: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                qcHead: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true, role: true } },
                project: {
                    select: {
                        id: true, name: true, projectLeadId: true, companyId: true,
                        projectLead: { select: { id: true, firstName: true, lastName: true } }
                    },
                },
                members: {
                    include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true, role: true, points: true } } },
                    orderBy: [{ role: 'asc' }, { pointsEarned: 'desc' }],
                },
                tasks: {
                    include: {
                        assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                        createdBy: { select: { id: true, firstName: true, lastName: true } },
                    },
                    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
                },
                timeTrackings: {
                    include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
                    orderBy: { startTime: 'desc' },
                    take: 10,
                },
                _count: { select: { tasks: true, timeTrackings: true, members: true } },
            },
        });

        if (!subProject) throw new NotFoundException('Subproject not found');

        const stats = await this.getSubProjectStats(id, companyId);
        return { ...subProject, stats };
    }

    // ============================================
    // FIND USER SUBPROJECTS
    // ============================================
    async findUserSubProjects(userId: string, companyId: string) {
        return this.prisma.subProject.findMany({
            where: {
                project: { companyId },
                OR: [{ createdById: userId }, { qcHeadId: userId }, { members: { some: { userId } } }],
            },
            include: {
                project: { select: { id: true, name: true } },
                qcHead: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                _count: { select: { tasks: true, members: true, timeTrackings: true } },
            },
            orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
        });
    }

    // ============================================
    // GET SUBPROJECT LEADERBOARD
    // ============================================
    async getSubProjectLeaderboard(id: string, companyId: string) {
        const subProject = await this.prisma.subProject.findFirst({ where: { id, project: { companyId } } });
        if (!subProject) throw new NotFoundException('Subproject not found');

        return this.prisma.subProjectMember.findMany({
            where: { subProjectId: id },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true, points: true } },
            },
            orderBy: [{ pointsEarned: 'desc' }, { tasksCompleted: 'desc' }, { totalTimeMinutes: 'desc' }],
        });
    }

    // Legacy methods
    async assign(id: string, dto: AssignSubProjectDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        return this.addMembers(id, { userIds: [dto.userId] }, currentUserId, currentUserRole, companyId);
    }

    async unassign(id: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const subProject = await this.findOne(id, companyId);
        if (subProject.assignedToId) {
            return this.removeMembers(id, { userIds: [subProject.assignedToId] }, currentUserId, currentUserRole, companyId);
        }
        return subProject;
    }

    private canManageSubProject(userRole: UserRole, userId: string, subProject: any): boolean {
        if (userRole === UserRole.COMPANY || userRole === UserRole.QC_ADMIN) return true;
        if (subProject.project?.projectLeadId === userId) return true;
        if (subProject.qcHeadId === userId) return true;
        if (subProject.createdById === userId) return true;
        const member = subProject.members?.find((m: any) => m.userId === userId);
        return member && (member.role === SubProjectMemberRole.QC_HEAD || member.role === SubProjectMemberRole.REVIEWER);
    }
}