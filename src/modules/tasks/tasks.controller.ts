// src/modules/tasks/tasks.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, AssignTaskDto, TaskQueryDto, BulkUpdateTaskStatusDto } from './dto/tasks.dto';
import { CurrentUser } from '../auth/guards';

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
    @ApiOperation({ summary: 'Create a new task (anyone can create and assign to others)' })
    async create(
        @Body() createDto: CreateTaskDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.create(createDto, userId, role as any, companyId);
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
    // ASSIGN TASK
    // ============================================
    @Patch(':id/assign')
    @ApiOperation({ summary: 'Assign task to a user (auto-adds to subproject if not member)' })
    async assign(
        @Param('id') id: string,
        @Body() dto: AssignTaskDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.assign(id, dto, userId, role as any, companyId);
    }

    // ============================================
    // UNASSIGN TASK
    // ============================================
    @Patch(':id/unassign')
    @ApiOperation({ summary: 'Unassign task' })
    async unassign(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.tasksService.unassign(id, userId, role as any, companyId);
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