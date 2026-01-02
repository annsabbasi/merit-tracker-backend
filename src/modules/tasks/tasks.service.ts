// src/modules/tasks/tasks.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, TaskStatus, NotificationType, ActivityType, SubProjectMemberRole } from '@prisma/client';
import { CreateTaskDto, UpdateTaskDto, AssignTaskDto, TaskQueryDto, BulkUpdateTaskStatusDto } from './dto/tasks.dto';

@Injectable()
export class TasksService {
    constructor(private prisma: PrismaService) { }

    private toDateTime(dateString?: string): Date | undefined {
        if (!dateString) return undefined;
        return dateString.includes('T') ? new Date(dateString) : new Date(`${dateString}T00:00:00.000Z`);
    }

    private async sendNotification(userId: string, type: NotificationType, title: string, message: string, metadata?: Record<string, any>) {
        await this.prisma.notification.create({ data: { userId, type, title, message, metadata: metadata || {} } });
    }

    private async logActivity(companyId: string, userId: string, activityType: ActivityType, description: string, metadata?: Record<string, any>) {
        await this.prisma.activityLog.create({ data: { companyId, userId, activityType, description, metadata } });
    }

    // ============================================
    // CREATE TASK - Anyone can create and assign to others
    // ============================================
    async create(createDto: CreateTaskDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        // Verify subproject exists and user belongs to company
        const subProject = await this.prisma.subProject.findFirst({
            where: { id: createDto.subProjectId, project: { companyId } },
            include: {
                project: { select: { id: true, name: true, companyId: true } },
                qcHead: { select: { id: true, firstName: true, lastName: true } },
                members: { select: { userId: true } },
            },
        });

        if (!subProject) throw new NotFoundException('SubProject not found');

        // Verify user belongs to company
        const user = await this.prisma.user.findFirst({ where: { id: currentUserId, companyId, isActive: true } });
        if (!user) throw new ForbiddenException('You must be an active member of this company');

        // If assigning to someone, verify they're a subproject member or add them
        if (createDto.assignedToId) {
            const assignee = await this.prisma.user.findFirst({
                where: { id: createDto.assignedToId, companyId, isActive: true },
            });
            if (!assignee) throw new BadRequestException('Assignee not found in company');

            // Auto-add assignee to subproject if not already a member
            const isMember = subProject.members.some(m => m.userId === createDto.assignedToId);
            if (!isMember) {
                await this.prisma.subProjectMember.create({
                    data: {
                        subProjectId: createDto.subProjectId,
                        userId: createDto.assignedToId,
                        role: SubProjectMemberRole.MEMBER,
                    },
                });
            }
        }

        const { dueDate, ...restData } = createDto;

        const task = await this.prisma.task.create({
            data: {
                ...restData,
                dueDate: this.toDateTime(dueDate),
                createdById: currentUserId,
            },
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                subProject: {
                    select: { id: true, title: true, project: { select: { id: true, name: true } } },
                },
            },
        });

        // Notify assignee
        if (createDto.assignedToId && createDto.assignedToId !== currentUserId) {
            await this.sendNotification(
                createDto.assignedToId,
                NotificationType.TASK_CREATED,
                'New Task Assigned',
                `You have been assigned a new task "${task.title}" in subproject "${subProject.title}".`,
                {
                    taskId: task.id,
                    taskTitle: task.title,
                    subProjectId: subProject.id,
                    subProjectTitle: subProject.title,
                    projectId: subProject.project.id,
                    projectName: subProject.project.name,
                    pointsValue: task.pointsValue,
                    dueDate: task.dueDate,
                    assignedBy: currentUserId,
                }
            );
        }

        // Notify QC Head
        if (subProject.qcHead && subProject.qcHead.id !== currentUserId && subProject.qcHead.id !== createDto.assignedToId) {
            await this.sendNotification(
                subProject.qcHead.id,
                NotificationType.SYSTEM,
                'New Task Created',
                `A new task "${task.title}" was created in subproject "${subProject.title}".`,
                {
                    taskId: task.id,
                    subProjectId: subProject.id,
                    createdBy: currentUserId,
                }
            );
        }

        await this.logActivity(companyId, currentUserId, ActivityType.TASK_CREATED,
            `Created task "${task.title}" in subproject "${subProject.title}"`,
            { taskId: task.id, subProjectId: subProject.id });

        return task;
    }

    // ============================================
    // FIND ALL BY SUBPROJECT
    // ============================================
    async findAllBySubProject(subProjectId: string, companyId: string, query?: TaskQueryDto) {
        const subProject = await this.prisma.subProject.findFirst({
            where: { id: subProjectId, project: { companyId } },
        });
        if (!subProject) throw new NotFoundException('SubProject not found');

        const where: any = { subProjectId };
        if (query?.status) where.status = query.status;
        if (query?.priority) where.priority = query.priority;
        if (query?.assignedToId) where.assignedToId = query.assignedToId;
        if (query?.createdById) where.createdById = query.createdById;
        if (query?.search) {
            where.OR = [
                { title: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        return this.prisma.task.findMany({
            where,
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                _count: { select: { timeTrackings: true } },
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        });
    }

    // ============================================
    // FIND MY TASKS
    // ============================================
    async findMyTasks(userId: string, companyId: string, query?: TaskQueryDto) {
        const where: any = {
            assignedToId: userId,
            subProject: { project: { companyId } },
        };
        if (query?.status) where.status = query.status;
        if (query?.priority) where.priority = query.priority;

        return this.prisma.task.findMany({
            where,
            include: {
                subProject: {
                    select: {
                        id: true,
                        title: true,
                        project: { select: { id: true, name: true } },
                    },
                },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                _count: { select: { timeTrackings: true } },
            },
            orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueDate: 'asc' }],
        });
    }

    // ============================================
    // FIND ONE
    // ============================================
    async findOne(id: string, companyId: string) {
        const task = await this.prisma.task.findFirst({
            where: { id, subProject: { project: { companyId } } },
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                subProject: {
                    select: {
                        id: true,
                        title: true,
                        qcHeadId: true,
                        createdById: true,
                        project: { select: { id: true, name: true, projectLeadId: true, companyId: true } },
                    },
                },
                timeTrackings: {
                    orderBy: { startTime: 'desc' },
                    take: 5,
                },
            },
        });

        if (!task) throw new NotFoundException('Task not found');
        return task;
    }

    // ============================================
    // UPDATE TASK
    // ============================================
    async update(id: string, updateDto: UpdateTaskDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const task = await this.findOne(id, companyId);

        // Check permissions
        if (!this.canManageTask(currentUserRole, currentUserId, task)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        const { dueDate, ...restData } = updateDto;
        const updateData: any = { ...restData };
        if (dueDate !== undefined) updateData.dueDate = dueDate ? this.toDateTime(dueDate) : null;

        // Handle status changes
        const oldStatus = task.status;
        const newStatus = updateDto.status;

        if (newStatus === TaskStatus.IN_PROGRESS && oldStatus === TaskStatus.TODO) {
            updateData.startedAt = new Date();
        }

        if (newStatus === TaskStatus.COMPLETED && oldStatus !== TaskStatus.COMPLETED) {
            updateData.completedAt = new Date();

            // Calculate actual time from time tracking
            const totalTime = await this.prisma.taskTimeTracking.aggregate({
                where: { taskId: id },
                _sum: { durationMinutes: true },
            });
            updateData.actualMinutes = totalTime._sum.durationMinutes || 0;

            // Award points to assignee
            if (task.assignedToId) {
                await this.awardTaskCompletionPoints(task.assignedToId, task.subProject.project.companyId, task.subProject.id, task.pointsValue);
            }
        }

        const updatedTask = await this.prisma.task.update({
            where: { id },
            data: updateData,
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                subProject: { select: { id: true, title: true } },
            },
        });

        // Notify on status change
        if (newStatus && newStatus !== oldStatus && task.assignedToId && task.assignedToId !== currentUserId) {
            await this.sendNotification(
                task.assignedToId,
                newStatus === TaskStatus.COMPLETED ? NotificationType.TASK_COMPLETED : NotificationType.SYSTEM,
                newStatus === TaskStatus.COMPLETED ? 'Task Completed! 🎉' : 'Task Status Updated',
                newStatus === TaskStatus.COMPLETED
                    ? `Task "${task.title}" has been marked as completed. You earned ${task.pointsValue} points!`
                    : `Task "${task.title}" status changed to ${newStatus.replace('_', ' ')}.`,
                { taskId: id, oldStatus, newStatus, pointsEarned: task.pointsValue }
            );
        }

        return updatedTask;
    }

    // ============================================
    // ASSIGN TASK
    // ============================================
    async assign(id: string, dto: AssignTaskDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const task = await this.findOne(id, companyId);

        // Verify assignee belongs to company
        const assignee = await this.prisma.user.findFirst({
            where: { id: dto.userId, companyId, isActive: true },
            select: { id: true, firstName: true, lastName: true },
        });
        if (!assignee) throw new BadRequestException('User not found in company');

        const previousAssigneeId = task.assignedToId;

        // Auto-add assignee to subproject if not member
        const isMember = await this.prisma.subProjectMember.findUnique({
            where: { subProjectId_userId: { subProjectId: task.subProject.id, userId: dto.userId } },
        });
        if (!isMember) {
            await this.prisma.subProjectMember.create({
                data: {
                    subProjectId: task.subProject.id,
                    userId: dto.userId,
                    role: SubProjectMemberRole.MEMBER,
                },
            });
        }

        const updatedTask = await this.prisma.task.update({
            where: { id },
            data: { assignedToId: dto.userId },
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                subProject: { select: { id: true, title: true, project: { select: { name: true } } } },
            },
        });

        // Notify new assignee
        if (dto.userId !== currentUserId) {
            await this.sendNotification(
                dto.userId,
                NotificationType.TASK_ASSIGNMENT,
                'Task Assigned to You',
                `You have been assigned task "${task.title}" in "${task.subProject.title}".`,
                {
                    taskId: id,
                    taskTitle: task.title,
                    subProjectId: task.subProject.id,
                    subProjectTitle: task.subProject.title,
                    pointsValue: task.pointsValue,
                    assignedBy: currentUserId,
                }
            );
        }

        // Notify previous assignee
        if (previousAssigneeId && previousAssigneeId !== dto.userId && previousAssigneeId !== currentUserId) {
            await this.sendNotification(
                previousAssigneeId,
                NotificationType.TASK_REASSIGNED,
                'Task Reassigned',
                `Task "${task.title}" has been reassigned to ${assignee.firstName} ${assignee.lastName}.`,
                { taskId: id }
            );
        }

        await this.logActivity(companyId, currentUserId, ActivityType.TASK_ASSIGNED,
            `Assigned task "${task.title}" to ${assignee.firstName} ${assignee.lastName}`,
            { taskId: id, assignedToId: dto.userId });

        return updatedTask;
    }

    // ============================================
    // UNASSIGN TASK
    // ============================================
    async unassign(id: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const task = await this.findOne(id, companyId);

        if (!this.canManageTask(currentUserRole, currentUserId, task)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        const previousAssigneeId = task.assignedToId;

        const updatedTask = await this.prisma.task.update({
            where: { id },
            data: { assignedToId: null },
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        if (previousAssigneeId && previousAssigneeId !== currentUserId) {
            await this.sendNotification(
                previousAssigneeId,
                NotificationType.SYSTEM,
                'Task Unassigned',
                `You have been unassigned from task "${task.title}".`,
                { taskId: id }
            );
        }

        return updatedTask;
    }

    // ============================================
    // DELETE TASK
    // ============================================
    async delete(id: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const task = await this.findOne(id, companyId);

        if (!this.canManageTask(currentUserRole, currentUserId, task)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        await this.prisma.task.delete({ where: { id } });

        if (task.assignedToId && task.assignedToId !== currentUserId) {
            await this.sendNotification(
                task.assignedToId,
                NotificationType.SYSTEM,
                'Task Deleted',
                `Task "${task.title}" has been deleted.`,
                { taskTitle: task.title }
            );
        }

        await this.logActivity(companyId, currentUserId, ActivityType.TASK_DELETED,
            `Deleted task "${task.title}"`, { taskTitle: task.title, subProjectId: task.subProject.id });

        return { message: 'Task deleted successfully' };
    }

    // ============================================
    // BULK UPDATE STATUS
    // ============================================
    async bulkUpdateStatus(dto: BulkUpdateTaskStatusDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        type BulkUpdateResult =
            | { taskId: string; success: true; task: Awaited<ReturnType<typeof this.update>> }
            | { taskId: string; success: false; error: string };

        const results: BulkUpdateResult[] = [];

        for (const taskId of dto.taskIds) {
            try {
                const task = await this.update(taskId, { status: dto.status }, currentUserId, currentUserRole, companyId);
                results.push({ taskId, success: true, task });
            } catch (error: any) {
                results.push({ taskId, success: false, error: error.message });
            }
        }

        const successfulResults = results.filter((r): r is Extract<BulkUpdateResult, { success: true }> => r.success);
        const failedResults = results.filter((r): r is Extract<BulkUpdateResult, { success: false }> => !r.success);

        return {
            results,
            summary: {
                total: dto.taskIds.length,
                successful: successfulResults.length,
                failed: failedResults.length,
            },
        };
    }

    // ============================================
    // HELPER: Award task completion points
    // ============================================
    private async awardTaskCompletionPoints(userId: string, companyId: string, subProjectId: string, points: number) {
        await this.prisma.$transaction(async (prisma) => {
            // Update user stats
            await prisma.user.update({
                where: { id: userId },
                data: {
                    points: { increment: points },
                    totalTasksCompleted: { increment: 1 },
                },
            });

            // Update subproject member stats
            await prisma.subProjectMember.updateMany({
                where: { subProjectId, userId },
                data: {
                    tasksCompleted: { increment: 1 },
                    pointsEarned: { increment: points },
                },
            });
        });
    }

    // ============================================
    // HELPER: Permission check
    // ============================================
    private canManageTask(userRole: UserRole, userId: string, task: any): boolean {
        if (userRole === UserRole.COMPANY || userRole === UserRole.QC_ADMIN) return true;
        if (task.createdById === userId) return true;
        if (task.assignedToId === userId) return true;
        if (task.subProject?.qcHeadId === userId) return true;
        if (task.subProject?.createdById === userId) return true;
        if (task.subProject?.project?.projectLeadId === userId) return true;
        return false;
    }
}