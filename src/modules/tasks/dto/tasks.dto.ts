// src/modules/tasks/dto/tasks.dto.ts

import { IsString, IsOptional, IsArray, IsEnum, IsInt, IsUUID, Min, Max, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus, Priority } from '@prisma/client';

export class CreateTaskDto {
    @ApiProperty({ description: 'Task title' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiPropertyOptional({ description: 'Task description' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ description: 'SubProject ID' })
    @IsUUID()
    subProjectId: string;

    @ApiPropertyOptional({ description: 'Array of user IDs to assign (multi-assignee)' })
    @IsArray()
    @IsUUID('4', { each: true })
    @IsOptional()
    assigneeIds?: string[];

    @ApiPropertyOptional({ description: 'Legacy single assignee (deprecated, use assigneeIds)' })
    @IsUUID()
    @IsOptional()
    assignedToId?: string;

    @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.TODO })
    @IsEnum(TaskStatus)
    @IsOptional()
    status?: TaskStatus;

    @ApiPropertyOptional({ enum: Priority, default: Priority.MEDIUM })
    @IsEnum(Priority)
    @IsOptional()
    priority?: Priority;

    @ApiPropertyOptional({ description: 'Points value for completion', default: 10 })
    @IsInt()
    @Min(0)
    @Max(100)
    @IsOptional()
    pointsValue?: number;

    @ApiPropertyOptional({ description: 'Estimated time in minutes' })
    @IsInt()
    @Min(0)
    @IsOptional()
    estimatedMinutes?: number;

    @ApiPropertyOptional({ description: 'Due date (ISO string)' })
    @IsString()
    @IsOptional()
    dueDate?: string;
}

export class UpdateTaskDto {
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    title?: string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ enum: TaskStatus })
    @IsEnum(TaskStatus)
    @IsOptional()
    status?: TaskStatus;

    @ApiPropertyOptional({ enum: Priority })
    @IsEnum(Priority)
    @IsOptional()
    priority?: Priority;

    @ApiPropertyOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    @IsOptional()
    pointsValue?: number;

    @ApiPropertyOptional()
    @IsInt()
    @Min(0)
    @IsOptional()
    estimatedMinutes?: number;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    dueDate?: string;
}

export class AssignTaskDto {
    @ApiProperty({ description: 'Array of user IDs to assign' })
    @IsArray()
    @IsUUID('4', { each: true })
    userIds: string[];
}

export class UnassignTaskDto {
    @ApiProperty({ description: 'Array of user IDs to unassign' })
    @IsArray()
    @IsUUID('4', { each: true })
    userIds: string[];
}

export class SubmitForReviewDto {
    @ApiPropertyOptional({ description: 'Optional notes when submitting for review' })
    @IsString()
    @IsOptional()
    notes?: string;
}

export class ApproveTaskDto {
    @ApiPropertyOptional({ description: 'Approval notes/feedback' })
    @IsString()
    @IsOptional()
    notes?: string;

    @ApiPropertyOptional({ description: 'Bonus points to award (0-50)', default: 0 })
    @IsInt()
    @Min(0)
    @Max(50)
    @IsOptional()
    bonusPoints?: number;
}

export class RejectTaskDto {
    @ApiProperty({ description: 'Reason for rejection (required)' })
    @IsString()
    @IsNotEmpty()
    reason: string;

    @ApiPropertyOptional({ description: 'Points to deduct (0-20)', default: 0 })
    @IsInt()
    @Min(0)
    @Max(20)
    @IsOptional()
    pointsToDeduct?: number;
}

export class TaskQueryDto {
    @ApiPropertyOptional({ enum: TaskStatus })
    @IsEnum(TaskStatus)
    @IsOptional()
    status?: TaskStatus;

    @ApiPropertyOptional({ enum: Priority })
    @IsEnum(Priority)
    @IsOptional()
    priority?: Priority;

    @ApiPropertyOptional({ description: 'Filter by assignee ID' })
    @IsUUID()
    @IsOptional()
    assigneeId?: string;

    @ApiPropertyOptional({ description: 'Filter by creator ID' })
    @IsUUID()
    @IsOptional()
    createdById?: string;

    @ApiPropertyOptional({ description: 'Search in title/description' })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiPropertyOptional({ description: 'Filter tasks pending review' })
    @IsOptional()
    pendingReview?: boolean;
}

export class BulkUpdateTaskStatusDto {
    @ApiProperty({ description: 'Array of task IDs' })
    @IsArray()
    @IsUUID('4', { each: true })
    taskIds: string[];

    @ApiProperty({ enum: TaskStatus })
    @IsEnum(TaskStatus)
    status: TaskStatus;
}