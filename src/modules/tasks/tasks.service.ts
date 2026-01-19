// src/modules/tasks/tasks.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole, TaskStatus, NotificationType, ActivityType, SubProjectMemberRole, ReviewStatus } from '@prisma/client';
import {
    CreateTaskDto,
    UpdateTaskDto,
    AssignTaskDto,
    UnassignTaskDto,
    TaskQueryDto,
    BulkUpdateTaskStatusDto,
    SubmitForReviewDto,
    ApproveTaskDto,
    RejectTaskDto
} from './dto/tasks.dto';
import { LeaderboardService } from '../leaderboard/leaderboard.service';

@Injectable()
export class TasksService {
    private readonly logger = new Logger(TasksService.name);

    constructor(
        private prisma: PrismaService,
        private leaderboardService: LeaderboardService,
    ) { }

    private toDateTime(dateString?: string): Date | undefined {
        if (!dateString) return undefined;
        return dateString.includes('T') ? new Date(dateString) : new Date(`${dateString}T00:00:00.000Z`);
    }

    private async sendNotification(userId: string, type: NotificationType, title: string, message: string, metadata?: Record<string, any>) {
        await this.prisma.notification.create({ data: { userId, type, title, message, metadata: metadata || {} } });
    }

    private async sendBulkNotifications(userIds: string[], type: NotificationType, title: string, message: string, metadata?: Record<string, any>) {
        if (userIds.length === 0) return;
        await this.prisma.notification.createMany({
            data: userIds.map(userId => ({ userId, type, title, message, metadata: metadata || {} }))
        });
    }

    private async logActivity(companyId: string, userId: string, activityType: ActivityType, description: string, metadata?: Record<string, any>) {
        await this.prisma.activityLog.create({ data: { companyId, userId, activityType, description, metadata } });
    }

    // ============================================
    // CREATE TASK - Anyone in project can create and assign
    // ============================================
    async create(createDto: CreateTaskDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        // Verify subproject exists and get project info
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

        // Combine assigneeIds and legacy assignedToId
        let assigneeIds = createDto.assigneeIds || [];
        if (createDto.assignedToId && !assigneeIds.includes(createDto.assignedToId)) {
            assigneeIds.push(createDto.assignedToId);
        }

        // Validate all assignees belong to company
        if (assigneeIds.length > 0) {
            const validAssignees = await this.prisma.user.findMany({
                where: { id: { in: assigneeIds }, companyId, isActive: true },
                select: { id: true },
            });
            if (validAssignees.length !== assigneeIds.length) {
                throw new BadRequestException('Some assignees are not valid company members');
            }
        }

        const { dueDate, assignedToId, ...restData } = createDto;

        const result = await this.prisma.$transaction(async (prisma) => {
            // Create task
            const task = await prisma.task.create({
                data: {
                    title: restData.title,
                    description: restData.description,
                    subProjectId: restData.subProjectId,
                    status: restData.status || TaskStatus.TODO,
                    priority: restData.priority,
                    pointsValue: restData.pointsValue || 10,
                    estimatedMinutes: restData.estimatedMinutes,
                    dueDate: this.toDateTime(dueDate),
                    createdById: currentUserId,
                    // Keep legacy field for backward compatibility
                    assignedToId: assigneeIds.length > 0 ? assigneeIds[0] : null,
                },
            });

            // Create task assignees
            if (assigneeIds.length > 0) {
                await prisma.taskAssignee.createMany({
                    data: assigneeIds.map(userId => ({
                        taskId: task.id,
                        userId,
                        assignedById: currentUserId,
                    })),
                    skipDuplicates: true,
                });

                // Auto-add assignees to subproject if not members
                for (const assigneeId of assigneeIds) {
                    const isMember = subProject.members.some(m => m.userId === assigneeId);
                    if (!isMember) {
                        await prisma.subProjectMember.create({
                            data: {
                                subProjectId: createDto.subProjectId,
                                userId: assigneeId,
                                role: SubProjectMemberRole.MEMBER,
                            },
                        });
                    }
                }
            }

            return task;
        });

        // Fetch complete task with relations
        const task = await this.findOne(result.id, companyId);

        // Notify assignees
        const assigneesToNotify = assigneeIds.filter(id => id !== currentUserId);
        if (assigneesToNotify.length > 0) {
            await this.sendBulkNotifications(
                assigneesToNotify,
                NotificationType.TASK_CREATED,
                'New Task Assigned',
                `You have been assigned to task "${task.title}" in subproject "${subProject.title}".`,
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
        if (subProject.qcHead && subProject.qcHead.id !== currentUserId && !assigneeIds.includes(subProject.qcHead.id)) {
            await this.sendNotification(
                subProject.qcHead.id,
                NotificationType.SYSTEM,
                'New Task Created',
                `A new task "${task.title}" was created in subproject "${subProject.title}".`,
                { taskId: task.id, subProjectId: subProject.id, createdBy: currentUserId }
            );
        }

        await this.logActivity(companyId, currentUserId, ActivityType.TASK_CREATED,
            `Created task "${task.title}" in subproject "${subProject.title}"`,
            { taskId: task.id, subProjectId: subProject.id, assigneeCount: assigneeIds.length });

        return task;
    }

    // ============================================
    // ASSIGN USERS TO TASK - Anyone in project can assign
    // ============================================
    async assignUsers(id: string, dto: AssignTaskDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const task = await this.findOne(id, companyId);

        // Validate all users belong to company
        const validUsers = await this.prisma.user.findMany({
            where: { id: { in: dto.userIds }, companyId, isActive: true },
            select: { id: true, firstName: true, lastName: true },
        });
        if (validUsers.length !== dto.userIds.length) {
            throw new BadRequestException('Some users are not valid company members');
        }

        // Get existing assignees
        const existingAssignees = task.assignees?.map((a: any) => a.userId) || [];
        const newAssigneeIds = dto.userIds.filter(id => !existingAssignees.includes(id));

        if (newAssigneeIds.length === 0) {
            throw new BadRequestException('All users are already assigned to this task');
        }

        await this.prisma.$transaction(async (prisma) => {
            // Create task assignees
            await prisma.taskAssignee.createMany({
                data: newAssigneeIds.map(userId => ({
                    taskId: id,
                    userId,
                    assignedById: currentUserId,
                })),
                skipDuplicates: true,
            });

            // Auto-add to subproject if not members
            for (const userId of newAssigneeIds) {
                const isMember = await prisma.subProjectMember.findUnique({
                    where: { subProjectId_userId: { subProjectId: task.subProject.id, userId } },
                });
                if (!isMember) {
                    await prisma.subProjectMember.create({
                        data: {
                            subProjectId: task.subProject.id,
                            userId,
                            role: SubProjectMemberRole.MEMBER,
                        },
                    });
                }
            }

            // Update legacy field
            if (!task.assignedToId) {
                await prisma.task.update({
                    where: { id },
                    data: { assignedToId: newAssigneeIds[0] },
                });
            }
        });

        // Notify new assignees
        const assigneesToNotify = newAssigneeIds.filter(uid => uid !== currentUserId);
        if (assigneesToNotify.length > 0) {
            await this.sendBulkNotifications(
                assigneesToNotify,
                NotificationType.TASK_ASSIGNMENT,
                'Task Assigned',
                `You have been assigned to task "${task.title}".`,
                {
                    taskId: id,
                    taskTitle: task.title,
                    subProjectId: task.subProject.id,
                    subProjectTitle: task.subProject.title,
                    assignedBy: currentUserId,
                }
            );
        }

        await this.logActivity(companyId, currentUserId, ActivityType.TASK_ASSIGNED,
            `Assigned ${newAssigneeIds.length} user(s) to task "${task.title}"`,
            { taskId: id, assignedUserIds: newAssigneeIds });

        return this.findOne(id, companyId);
    }

    // ============================================
    // UNASSIGN USERS FROM TASK - QC_ADMIN/COMPANY or task creator
    // ============================================
    async unassignUsers(id: string, dto: UnassignTaskDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const task = await this.findOne(id, companyId);

        // Check permissions
        const canUnassign = currentUserRole === UserRole.COMPANY ||
            currentUserRole === UserRole.QC_ADMIN ||
            task.createdById === currentUserId ||
            task.subProject?.qcHeadId === currentUserId;

        if (!canUnassign) {
            throw new ForbiddenException('Only QC_ADMIN, COMPANY admin, task creator, or subproject QC head can unassign users');
        }

        await this.prisma.taskAssignee.deleteMany({
            where: { taskId: id, userId: { in: dto.userIds } },
        });

        // Notify unassigned users
        const usersToNotify = dto.userIds.filter(uid => uid !== currentUserId);
        if (usersToNotify.length > 0) {
            await this.sendBulkNotifications(
                usersToNotify,
                NotificationType.SYSTEM,
                'Task Unassigned',
                `You have been unassigned from task "${task.title}".`,
                { taskId: id, taskTitle: task.title }
            );
        }

        return this.findOne(id, companyId);
    }

    // ============================================
    // SUBMIT FOR REVIEW - Any assignee can submit
    // ============================================
    async submitForReview(id: string, dto: SubmitForReviewDto, currentUserId: string, companyId: string) {
        const task = await this.findOne(id, companyId);

        // Verify user is an assignee
        const isAssignee = task.assignees?.some((a: any) => a.userId === currentUserId);
        if (!isAssignee && task.createdById !== currentUserId) {
            throw new ForbiddenException('Only task assignees or creator can submit for review');
        }

        // Verify task is in valid status
        if (task.status !== TaskStatus.IN_PROGRESS && task.status !== TaskStatus.NEEDS_REVISION) {
            throw new BadRequestException(`Cannot submit task with status "${task.status}" for review. Task must be IN_PROGRESS or NEEDS_REVISION.`);
        }

        await this.prisma.task.update({
            where: { id },
            data: {
                status: TaskStatus.IN_REVIEW,
                submittedForReviewAt: new Date(),
                submittedForReviewById: currentUserId,
                reviewStatus: ReviewStatus.PENDING,
            },
        });

        // Get QC admins to notify
        const qcAdmins = await this.prisma.user.findMany({
            where: {
                companyId,
                isActive: true,
                OR: [
                    { role: UserRole.QC_ADMIN },
                    { role: UserRole.COMPANY },
                    { id: task.subProject?.qcHeadId || '' },
                ],
            },
            select: { id: true },
        });

        const qcAdminIds = qcAdmins.map(u => u.id).filter(uid => uid !== currentUserId);

        // Notify QC admins
        if (qcAdminIds.length > 0) {
            await this.sendBulkNotifications(
                qcAdminIds,
                NotificationType.TASK_SUBMITTED_FOR_REVIEW,
                '📋 Task Pending Review',
                `Task "${task.title}" has been submitted for review and is waiting for your approval.`,
                {
                    taskId: id,
                    taskTitle: task.title,
                    subProjectId: task.subProject?.id,
                    subProjectTitle: task.subProject?.title,
                    submittedBy: currentUserId,
                    revisionCount: task.revisionCount,
                }
            );
        }

        await this.logActivity(companyId, currentUserId, ActivityType.TASK_COMPLETED,
            `Submitted task "${task.title}" for review`,
            { taskId: id, revisionCount: task.revisionCount });

        return this.findOne(id, companyId);
    }

    // ============================================
    // APPROVE TASK - QC_ADMIN/COMPANY only
    // ============================================
    async approveTask(id: string, dto: ApproveTaskDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        // Verify permission
        if (currentUserRole !== UserRole.QC_ADMIN && currentUserRole !== UserRole.COMPANY) {
            const task = await this.findOne(id, companyId);
            if (task.subProject?.qcHeadId !== currentUserId) {
                throw new ForbiddenException('Only QC_ADMIN, COMPANY admin, or subproject QC head can approve tasks');
            }
        }

        const task = await this.findOne(id, companyId);

        if (task.status !== TaskStatus.IN_REVIEW) {
            throw new BadRequestException('Task must be IN_REVIEW status to approve');
        }

        const totalPoints = task.pointsValue + (dto.bonusPoints || 0);

        await this.prisma.$transaction(async (prisma) => {
            // Update task
            await prisma.task.update({
                where: { id },
                data: {
                    status: TaskStatus.COMPLETED,
                    reviewedAt: new Date(),
                    reviewedById: currentUserId,
                    reviewStatus: ReviewStatus.APPROVED,
                    reviewNotes: dto.notes,
                    completedAt: new Date(),
                },
            });

            // Award points to all assignees
            const assigneeIds = task.assignees?.map((a: any) => a.userId) || [];
            const pointsPerAssignee = Math.floor(totalPoints / Math.max(assigneeIds.length, 1));

            for (const assigneeId of assigneeIds) {
                // Update user points
                await prisma.user.update({
                    where: { id: assigneeId },
                    data: {
                        points: { increment: pointsPerAssignee },
                        totalTasksCompleted: { increment: 1 },
                    },
                });

                // Update subproject member stats
                await prisma.subProjectMember.updateMany({
                    where: { subProjectId: task.subProject.id, userId: assigneeId },
                    data: {
                        tasksCompleted: { increment: 1 },
                        pointsEarned: { increment: pointsPerAssignee },
                    },
                });

                // Update task assignee completion
                await prisma.taskAssignee.updateMany({
                    where: { taskId: id, userId: assigneeId },
                    data: { isCompleted: true, completedAt: new Date() },
                });
            }
        });

        // Notify all assignees
        const assigneeIds = task.assignees?.map((a: any) => a.userId) || [];
        const pointsPerAssignee = Math.floor(totalPoints / Math.max(assigneeIds.length, 1));

        if (assigneeIds.length > 0) {
            await this.sendBulkNotifications(
                assigneeIds,
                NotificationType.TASK_APPROVED,
                '✅ Task Approved!',
                `Your task "${task.title}" has been approved! You earned ${pointsPerAssignee} points.`,
                {
                    taskId: id,
                    taskTitle: task.title,
                    pointsEarned: pointsPerAssignee,
                    bonusPoints: dto.bonusPoints || 0,
                    reviewNotes: dto.notes,
                    approvedBy: currentUserId,
                }
            );
        }

        // Update leaderboard/achievements for each assignee
        for (const assigneeId of assigneeIds) {
            try {
                await this.leaderboardService.checkAndAwardAchievements(assigneeId, companyId);
                await this.leaderboardService.updateUserStreak(assigneeId);
            } catch (error) {
                this.logger.error(`Failed to update leaderboard for user ${assigneeId}:`, error);
            }
        }

        await this.logActivity(companyId, currentUserId, ActivityType.TASK_COMPLETED,
            `Approved task "${task.title}" - awarded ${totalPoints} points to ${assigneeIds.length} assignee(s)`,
            { taskId: id, totalPoints, assigneeCount: assigneeIds.length });

        return this.findOne(id, companyId);
    }

    // ============================================
    // REJECT TASK - QC_ADMIN/COMPANY only
    // ============================================
    async rejectTask(id: string, dto: RejectTaskDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        // Verify permission
        if (currentUserRole !== UserRole.QC_ADMIN && currentUserRole !== UserRole.COMPANY) {
            const task = await this.findOne(id, companyId);
            if (task.subProject?.qcHeadId !== currentUserId) {
                throw new ForbiddenException('Only QC_ADMIN, COMPANY admin, or subproject QC head can reject tasks');
            }
        }

        const task = await this.findOne(id, companyId);

        if (task.status !== TaskStatus.IN_REVIEW) {
            throw new BadRequestException('Task must be IN_REVIEW status to reject');
        }

        const pointsToDeduct = dto.pointsToDeduct || 0;

        await this.prisma.$transaction(async (prisma) => {
            // Update task
            await prisma.task.update({
                where: { id },
                data: {
                    status: TaskStatus.NEEDS_REVISION,
                    reviewedAt: new Date(),
                    reviewedById: currentUserId,
                    reviewStatus: ReviewStatus.REJECTED,
                    reviewNotes: dto.reason,
                    revisionCount: { increment: 1 },
                    pointsDeducted: { increment: pointsToDeduct },
                },
            });

            // Deduct points if specified
            if (pointsToDeduct > 0) {
                const assigneeIds = task.assignees?.map((a: any) => a.userId) || [];
                const deductionPerAssignee = Math.floor(pointsToDeduct / Math.max(assigneeIds.length, 1));

                for (const assigneeId of assigneeIds) {
                    await prisma.user.update({
                        where: { id: assigneeId },
                        data: {
                            points: { decrement: Math.min(deductionPerAssignee, 0) }, // Ensure no negative
                        },
                    });
                }
            }
        });

        // Notify all assignees
        const assigneeIds = task.assignees?.map((a: any) => a.userId) || [];

        if (assigneeIds.length > 0) {
            await this.sendBulkNotifications(
                assigneeIds,
                NotificationType.TASK_REJECTED,
                '⚠️ Task Needs Revision',
                `Your task "${task.title}" requires revision. Reason: ${dto.reason}`,
                {
                    taskId: id,
                    taskTitle: task.title,
                    rejectionReason: dto.reason,
                    pointsDeducted: pointsToDeduct,
                    revisionCount: task.revisionCount + 1,
                    rejectedBy: currentUserId,
                }
            );
        }

        // Also notify task submitter if different from assignees
        if (task.submittedForReviewById && !assigneeIds.includes(task.submittedForReviewById)) {
            await this.sendNotification(
                task.submittedForReviewById,
                NotificationType.TASK_REJECTED,
                '⚠️ Task Rejected',
                `The task "${task.title}" you submitted has been rejected. Reason: ${dto.reason}`,
                { taskId: id, rejectionReason: dto.reason }
            );
        }

        await this.logActivity(companyId, currentUserId, ActivityType.TASK_DELETED, // Using existing activity type
            `Rejected task "${task.title}" - Reason: ${dto.reason}`,
            { taskId: id, reason: dto.reason, pointsDeducted: pointsToDeduct });

        return this.findOne(id, companyId);
    }

    // ============================================
    // GET TASKS PENDING REVIEW - For QC_ADMIN dashboard
    // ============================================
    async getTasksPendingReview(companyId: string, currentUserRole: UserRole, currentUserId: string) {
        const where: any = {
            status: TaskStatus.IN_REVIEW,
            subProject: { project: { companyId } },
        };

        // If QC_ADMIN (not COMPANY), only show tasks from subprojects they're QC head of
        if (currentUserRole === UserRole.QC_ADMIN) {
            where.subProject = {
                ...where.subProject,
                qcHeadId: currentUserId,
            };
        }

        return this.prisma.task.findMany({
            where,
            include: {
                assignees: {
                    include: {
                        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                    },
                },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                submittedForReviewBy: { select: { id: true, firstName: true, lastName: true } },
                subProject: {
                    select: {
                        id: true,
                        title: true,
                        project: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { submittedForReviewAt: 'asc' },
        });
    }

    // ============================================
    // UPDATE TASK
    // ============================================
    async update(id: string, updateDto: UpdateTaskDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const task = await this.findOne(id, companyId);

        // Check permissions - anyone assigned or creator can update
        const isAssignee = task.assignees?.some((a: any) => a.userId === currentUserId);
        if (!this.canManageTask(currentUserRole, currentUserId, task) && !isAssignee) {
            throw new ForbiddenException('Insufficient permissions');
        }

        const { dueDate, ...restData } = updateDto;
        const updateData: any = { ...restData };
        if (dueDate !== undefined) updateData.dueDate = dueDate ? this.toDateTime(dueDate) : null;

        // Handle status changes
        if (updateDto.status === TaskStatus.IN_PROGRESS && task.status === TaskStatus.TODO) {
            updateData.startedAt = new Date();
        }

        await this.prisma.task.update({
            where: { id },
            data: updateData,
        });

        return this.findOne(id, companyId);
    }

    // ============================================
    // DELETE TASK - QC_ADMIN/COMPANY or creator
    // ============================================
    async delete(id: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const task = await this.findOne(id, companyId);

        if (!this.canManageTask(currentUserRole, currentUserId, task)) {
            throw new ForbiddenException('Insufficient permissions');
        }

        // Notify assignees
        const assigneeIds = task.assignees?.map((a: any) => a.userId).filter((uid: string) => uid !== currentUserId) || [];

        await this.prisma.task.delete({ where: { id } });

        if (assigneeIds.length > 0) {
            await this.sendBulkNotifications(
                assigneeIds,
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
    // REMOVE USER FROM PROJECT - QC_ADMIN/COMPANY only
    // ============================================
    async removeUserFromProject(projectId: string, userId: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        if (currentUserRole !== UserRole.QC_ADMIN && currentUserRole !== UserRole.COMPANY) {
            throw new ForbiddenException('Only QC_ADMIN or COMPANY can remove users from projects');
        }

        // Verify project exists
        const project = await this.prisma.project.findFirst({
            where: { id: projectId, companyId },
        });
        if (!project) throw new NotFoundException('Project not found');

        // Remove from project members
        await this.prisma.projectMember.deleteMany({
            where: { projectId, userId },
        });

        // Remove from all subproject members in this project
        await this.prisma.subProjectMember.deleteMany({
            where: {
                userId,
                subProject: { projectId },
            },
        });

        // Unassign from all tasks in this project
        await this.prisma.taskAssignee.deleteMany({
            where: {
                userId,
                task: { subProject: { projectId } },
            },
        });

        // Notify the user
        if (userId !== currentUserId) {
            await this.sendNotification(
                userId,
                NotificationType.SYSTEM,
                'Removed from Project',
                `You have been removed from project "${project.name}".`,
                { projectId, projectName: project.name }
            );
        }

        return { message: 'User removed from project successfully' };
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
        if (query?.createdById) where.createdById = query.createdById;
        if (query?.pendingReview) where.status = TaskStatus.IN_REVIEW;
        if (query?.search) {
            where.OR = [
                { title: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
            ];
        }
        // Filter by assignee
        if (query?.assigneeId) {
            where.assignees = { some: { userId: query.assigneeId } };
        }

        return this.prisma.task.findMany({
            where,
            include: {
                assignees: {
                    include: {
                        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                        assignedBy: { select: { id: true, firstName: true, lastName: true } },
                    },
                },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                reviewedBy: { select: { id: true, firstName: true, lastName: true } },
                _count: { select: { timeTrackings: true, assignees: true } },
            },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        });
    }

    // ============================================
    // FIND MY TASKS
    // ============================================
    async findMyTasks(userId: string, companyId: string, query?: TaskQueryDto) {
        const where: any = {
            subProject: { project: { companyId } },
            assignees: { some: { userId } },
        };
        if (query?.status) where.status = query.status;
        if (query?.priority) where.priority = query.priority;

        return this.prisma.task.findMany({
            where,
            include: {
                assignees: {
                    include: {
                        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
                    },
                },
                subProject: {
                    select: {
                        id: true,
                        title: true,
                        project: { select: { id: true, name: true } },
                    },
                },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                _count: { select: { timeTrackings: true, assignees: true } },
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
                assignees: {
                    include: {
                        user: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true } },
                        assignedBy: { select: { id: true, firstName: true, lastName: true } },
                    },
                },
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                submittedForReviewBy: { select: { id: true, firstName: true, lastName: true } },
                reviewedBy: { select: { id: true, firstName: true, lastName: true } },
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
    // BULK UPDATE STATUS
    // ============================================
    async bulkUpdateStatus(dto: BulkUpdateTaskStatusDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        type BulkUpdateResult =
            | { taskId: string; success: true; task: any }
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

        return {
            results,
            summary: {
                total: dto.taskIds.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
            },
        };
    }

    // ============================================
    // HELPER: Permission check
    // ============================================
    private canManageTask(userRole: UserRole, userId: string, task: any): boolean {
        if (userRole === UserRole.COMPANY || userRole === UserRole.QC_ADMIN) return true;
        if (task.createdById === userId) return true;
        if (task.subProject?.qcHeadId === userId) return true;
        if (task.subProject?.createdById === userId) return true;
        if (task.subProject?.project?.projectLeadId === userId) return true;
        return false;
    }
}