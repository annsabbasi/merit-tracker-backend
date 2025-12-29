// src/modules/sub-projects/sub-projects.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, ProjectMemberRole, NotificationType, SubProjectStatus } from '@prisma/client';
import { CreateSubProjectDto, UpdateSubProjectDto, AssignSubProjectDto, SubProjectQueryDto } from './dto/sub-projects.dto';

@Injectable()
export class SubProjectsService {
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
    // CREATE TASK
    // ============================================
    async create(createDto: CreateSubProjectDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        // Verify the project exists and user has access
        const project = await this.prisma.project.findFirst({
            where: { id: createDto.projectId, companyId },
            include: {
                members: true,
                projectLead: { select: { id: true, firstName: true, lastName: true } },
                departments: {
                    include: {
                        department: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        // Check if user can create tasks
        const canCreate = this.canManageProject(currentUserRole, currentUserId, project);
        if (!canCreate) {
            throw new ForbiddenException('Insufficient permissions to create tasks');
        }

        // Validate assignee if provided
        if (createDto.assignedToId) {
            const isMember = project.members.some(m => m.userId === createDto.assignedToId);
            const isProjectLead = project.projectLeadId === createDto.assignedToId;

            if (!isMember && !isProjectLead) {
                throw new BadRequestException('Assignee must be a project member');
            }
        }

        const { dueDate, ...restData } = createDto;

        const task = await this.prisma.subProject.create({
            data: {
                ...restData,
                dueDate: this.toDateTime(dueDate),
                createdById: currentUserId,
            },
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                project: { select: { id: true, name: true } },
            },
        });

        // ============================================
        // SEND NOTIFICATIONS
        // ============================================

        // Get department name
        const departmentName = project.departments?.[0]?.department?.name || 'Unknown';

        // Notify assignee
        if (createDto.assignedToId && createDto.assignedToId !== currentUserId) {
            await this.sendNotification(
                createDto.assignedToId,
                NotificationType.TASK_ASSIGNMENT,
                'New Task Assigned',
                `You have been assigned a new task "${task.title}" in project "${project.name}".`,
                {
                    taskId: task.id,
                    taskTitle: task.title,
                    projectId: project.id,
                    projectName: project.name,
                    departmentName,
                    pointsValue: task.pointsValue,
                    dueDate: task.dueDate,
                    assignedBy: currentUserId,
                }
            );
        }

        // Notify project lead if they didn't create the task
        if (project.projectLeadId && project.projectLeadId !== currentUserId && project.projectLeadId !== createDto.assignedToId) {
            await this.sendNotification(
                project.projectLeadId,
                NotificationType.SYSTEM,
                'New Task Created',
                `A new task "${task.title}" has been created in project "${project.name}".`,
                {
                    taskId: task.id,
                    taskTitle: task.title,
                    projectId: project.id,
                    projectName: project.name,
                    createdBy: currentUserId,
                }
            );
        }

        return task;
    }

    // ============================================
    // FIND ALL
    // ============================================
    async findAll(projectId: string, companyId: string, query?: SubProjectQueryDto) {
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, companyId },
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        const where: any = { projectId };
        if (query?.status) where.status = query.status;
        if (query?.search) {
            where.OR = [
                { title: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
            ];
        }
        if (query?.assignedToId) where.assignedToId = query.assignedToId;

        return this.prisma.subProject.findMany({
            where,
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                project: { select: { id: true, name: true } },
                _count: { select: { timeTrackings: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ============================================
    // FIND ONE
    // ============================================
    async findOne(id: string, companyId: string) {
        const subProject = await this.prisma.subProject.findFirst({
            where: { id, project: { companyId } },
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                project: {
                    select: { id: true, name: true, projectLeadId: true },
                    include: { members: true },
                },
                timeTrackings: {
                    include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
                    orderBy: { startTime: 'desc' },
                    take: 10,
                },
                _count: { select: { timeTrackings: true } },
            },
        });

        if (!subProject) {
            throw new NotFoundException('Task not found');
        }

        return subProject;
    }

    // ============================================
    // FIND USER TASKS
    // ============================================
    async findUserSubProjects(userId: string, companyId: string) {
        return this.prisma.subProject.findMany({
            where: {
                assignedToId: userId,
                project: { companyId },
            },
            include: {
                project: { select: { id: true, name: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                _count: { select: { timeTrackings: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ============================================
    // UPDATE TASK
    // ============================================
    async update(id: string, updateDto: UpdateSubProjectDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const subProject = await this.findOne(id, companyId);

        if (!this.canManageProject(currentUserRole, currentUserId, subProject.project)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        const { dueDate, ...restData } = updateDto;

        const updateData: any = { ...restData };
        if (dueDate !== undefined) {
            updateData.dueDate = dueDate ? this.toDateTime(dueDate) : null;
        }

        const oldStatus = subProject.status;
        const newStatus = updateDto.status;

        const updatedTask = await this.prisma.subProject.update({
            where: { id },
            data: updateData,
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                project: { select: { id: true, name: true, projectLeadId: true } },
            },
        });

        // ============================================
        // SEND NOTIFICATIONS
        // ============================================

        // Notify assignee about status change
        if (newStatus && newStatus !== oldStatus && subProject.assignedToId && subProject.assignedToId !== currentUserId) {
            await this.sendNotification(
                subProject.assignedToId,
                NotificationType.SYSTEM,
                'Task Status Updated',
                `Task "${subProject.title}" status changed to ${newStatus.replace('_', ' ')}.`,
                {
                    taskId: id,
                    taskTitle: subProject.title,
                    projectId: subProject.projectId,
                    projectName: subProject.project.name,
                    oldStatus,
                    newStatus,
                }
            );
        }

        // Notify project lead about task completion
        if (newStatus === SubProjectStatus.COMPLETED && oldStatus !== SubProjectStatus.COMPLETED) {
            const projectLeadId = subProject.project.projectLeadId;

            if (projectLeadId && projectLeadId !== currentUserId) {
                await this.sendNotification(
                    projectLeadId,
                    NotificationType.SYSTEM,
                    'Task Completed',
                    `Task "${subProject.title}" has been marked as completed.`,
                    {
                        taskId: id,
                        taskTitle: subProject.title,
                        projectId: subProject.projectId,
                        projectName: subProject.project.name,
                        completedBy: currentUserId,
                    }
                );
            }
        }

        return updatedTask;
    }

    // ============================================
    // ASSIGN TASK
    // ============================================
    async assign(id: string, dto: AssignSubProjectDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const subProject = await this.findOne(id, companyId);

        if (!this.canManageProject(currentUserRole, currentUserId, subProject.project)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        // Verify the user to be assigned is a member of the project
        const isMember = await this.prisma.projectMember.findUnique({
            where: {
                projectId_userId: {
                    projectId: subProject.projectId,
                    userId: dto.userId,
                },
            },
        });

        const isProjectLead = subProject.project.projectLeadId === dto.userId;

        if (!isMember && !isProjectLead) {
            throw new BadRequestException('User must be a project member to be assigned');
        }

        const previousAssigneeId = subProject.assignedToId;

        const updatedTask = await this.prisma.subProject.update({
            where: { id },
            data: { assignedToId: dto.userId },
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                project: { select: { id: true, name: true } },
            },
        });

        // ============================================
        // SEND NOTIFICATIONS
        // ============================================

        // Notify new assignee
        if (dto.userId !== currentUserId) {
            await this.sendNotification(
                dto.userId,
                NotificationType.TASK_ASSIGNMENT,
                'Task Assigned to You',
                `You have been assigned to task "${subProject.title}" in project "${subProject.project.name}".`,
                {
                    taskId: id,
                    taskTitle: subProject.title,
                    projectId: subProject.projectId,
                    projectName: subProject.project.name,
                    pointsValue: subProject.pointsValue,
                    dueDate: subProject.dueDate,
                    assignedBy: currentUserId,
                }
            );
        }

        // Notify previous assignee that they've been unassigned
        if (previousAssigneeId && previousAssigneeId !== dto.userId && previousAssigneeId !== currentUserId) {
            await this.sendNotification(
                previousAssigneeId,
                NotificationType.SYSTEM,
                'Task Reassigned',
                `Task "${subProject.title}" has been reassigned to another team member.`,
                {
                    taskId: id,
                    taskTitle: subProject.title,
                    projectId: subProject.projectId,
                    projectName: subProject.project.name,
                }
            );
        }

        return updatedTask;
    }

    // ============================================
    // UNASSIGN TASK
    // ============================================
    async unassign(id: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const subProject = await this.findOne(id, companyId);

        if (!this.canManageProject(currentUserRole, currentUserId, subProject.project)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        const previousAssigneeId = subProject.assignedToId;

        const updatedTask = await this.prisma.subProject.update({
            where: { id },
            data: { assignedToId: null },
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                project: { select: { id: true, name: true } },
            },
        });

        // Notify previous assignee
        if (previousAssigneeId && previousAssigneeId !== currentUserId) {
            await this.sendNotification(
                previousAssigneeId,
                NotificationType.SYSTEM,
                'Task Unassigned',
                `You have been unassigned from task "${subProject.title}".`,
                {
                    taskId: id,
                    taskTitle: subProject.title,
                    projectId: subProject.projectId,
                    projectName: subProject.project.name,
                }
            );
        }

        return updatedTask;
    }

    // ============================================
    // DELETE TASK
    // ============================================
    async delete(id: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const subProject = await this.findOne(id, companyId);

        if (!this.canManageProject(currentUserRole, currentUserId, subProject.project)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        await this.prisma.subProject.delete({ where: { id } });

        // Notify assignee if task was assigned
        if (subProject.assignedToId && subProject.assignedToId !== currentUserId) {
            await this.sendNotification(
                subProject.assignedToId,
                NotificationType.SYSTEM,
                'Task Deleted',
                `Task "${subProject.title}" has been deleted from project "${subProject.project.name}".`,
                {
                    taskTitle: subProject.title,
                    projectId: subProject.projectId,
                    projectName: subProject.project.name,
                }
            );
        }

        return { message: 'Task deleted successfully' };
    }

    // ============================================
    // PERMISSION CHECK
    // ============================================
    private canManageProject(userRole: UserRole, userId: string, project: any): boolean {
        if (userRole === UserRole.COMPANY_ADMIN || userRole === UserRole.QC_ADMIN) return true;
        if (project.projectLeadId === userId) return true;
        const member = project.members?.find((m: any) => m.userId === userId);
        return member && member.role === ProjectMemberRole.QC_ADMIN;
    }
}