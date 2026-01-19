// src/modules/tasks/tasks.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TasksService } from './tasks.service';
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
import { CurrentUser, Roles } from '../auth/guards';
import { UserRole } from '@prisma/client';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TasksController {
    constructor(private readonly tasksService: TasksService) { }

    // ============================================
    // CREATE TASK - Anyone can create and assign
    // ============================================
    @Post()
    @ApiOperation({ summary: 'Create a new task (anyone in project can create and assign)' })
    async create(
        @Body() createDto: CreateTaskDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.create(createDto, userId, role as any, companyId);
    }

    // ============================================
    // GET TASKS PENDING REVIEW - QC Dashboard
    // ============================================
    @Get('pending-review')
    @UseGuards(RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY)
    @ApiOperation({ summary: 'Get all tasks pending review (QC_ADMIN/COMPANY)' })
    async getTasksPendingReview(
        @CurrentUser('companyId') companyId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('id') userId: string
    ) {
        return this.tasksService.getTasksPendingReview(companyId, role as any, userId);
    }

    // ============================================
    // GET TASKS BY SUBPROJECT
    // ============================================
    @Get('sub-project/:subProjectId')
    @ApiOperation({ summary: 'Get all tasks in a subproject' })
    async findAllBySubProject(
        @Param('subProjectId') subProjectId: string,
        @CurrentUser('companyId') companyId: string,
        @Query() query: TaskQueryDto
    ) {
        return this.tasksService.findAllBySubProject(subProjectId, companyId, query);
    }

    // ============================================
    // GET MY TASKS
    // ============================================
    @Get('my-tasks')
    @ApiOperation({ summary: 'Get all tasks assigned to current user' })
    async findMyTasks(
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string,
        @Query() query: TaskQueryDto
    ) {
        return this.tasksService.findMyTasks(userId, companyId, query);
    }

    // ============================================
    // GET ONE TASK
    // ============================================
    @Get(':id')
    @ApiOperation({ summary: 'Get task by ID' })
    async findOne(
        @Param('id') id: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.findOne(id, companyId);
    }

    // ============================================
    // UPDATE TASK
    // ============================================
    @Put(':id')
    @ApiOperation({ summary: 'Update task' })
    async update(
        @Param('id') id: string,
        @Body() updateDto: UpdateTaskDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.update(id, updateDto, userId, role as any, companyId);
    }

    // ============================================
    // ASSIGN USERS TO TASK
    // ============================================
    @Patch(':id/assign')
    @ApiOperation({ summary: 'Assign users to task (anyone can assign company members)' })
    async assignUsers(
        @Param('id') id: string,
        @Body() dto: AssignTaskDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.assignUsers(id, dto, userId, role as any, companyId);
    }

    // ============================================
    // UNASSIGN USERS FROM TASK
    // ============================================
    @Patch(':id/unassign')
    @UseGuards(RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY)
    @ApiOperation({ summary: 'Unassign users from task (QC_ADMIN/COMPANY only)' })
    async unassignUsers(
        @Param('id') id: string,
        @Body() dto: UnassignTaskDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.unassignUsers(id, dto, userId, role as any, companyId);
    }

    // ============================================
    // SUBMIT FOR REVIEW
    // ============================================
    @Patch(':id/submit-for-review')
    @ApiOperation({ summary: 'Submit task for QC review (assignees only)' })
    async submitForReview(
        @Param('id') id: string,
        @Body() dto: SubmitForReviewDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.submitForReview(id, dto, userId, companyId);
    }

    // ============================================
    // APPROVE TASK
    // ============================================
    @Patch(':id/approve')
    @UseGuards(RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY)
    @ApiOperation({ summary: 'Approve task and award points (QC_ADMIN/COMPANY only)' })
    async approveTask(
        @Param('id') id: string,
        @Body() dto: ApproveTaskDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.approveTask(id, dto, userId, role as any, companyId);
    }

    // ============================================
    // REJECT TASK
    // ============================================
    @Patch(':id/reject')
    @UseGuards(RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY)
    @ApiOperation({ summary: 'Reject task and request revision (QC_ADMIN/COMPANY only)' })
    async rejectTask(
        @Param('id') id: string,
        @Body() dto: RejectTaskDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.rejectTask(id, dto, userId, role as any, companyId);
    }

    // ============================================
    // BULK UPDATE STATUS
    // ============================================
    @Patch('bulk/status')
    @ApiOperation({ summary: 'Update status of multiple tasks at once' })
    async bulkUpdateStatus(
        @Body() dto: BulkUpdateTaskStatusDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.bulkUpdateStatus(dto, userId, role as any, companyId);
    }

    // ============================================
    // REMOVE USER FROM PROJECT
    // ============================================
    @Delete('project/:projectId/user/:userId')
    @UseGuards(RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY)
    @ApiOperation({ summary: 'Remove user from project and all tasks (QC_ADMIN/COMPANY only)' })
    async removeUserFromProject(
        @Param('projectId') projectId: string,
        @Param('userId') targetUserId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.removeUserFromProject(projectId, targetUserId, userId, role as any, companyId);
    }

    // ============================================
    // DELETE TASK
    // ============================================
    @Delete(':id')
    @ApiOperation({ summary: 'Delete task' })
    async delete(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.delete(id, userId, role as any, companyId);
    }
}