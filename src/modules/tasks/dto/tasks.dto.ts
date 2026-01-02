// src/modules/tasks/dto/tasks.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsUUID,
    IsEnum,
    IsInt,
    Min,
    Max,
    IsDateString,
    IsArray,
} from 'class-validator';
import { TaskStatus, Priority } from '@prisma/client';

export class CreateTaskDto {
    @ApiProperty({ description: 'Task title' })
    @IsString()
    title: string;

    @ApiPropertyOptional({ description: 'Task description' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ description: 'SubProject ID this task belongs to' })
    @IsUUID()
    subProjectId: string;

    @ApiPropertyOptional({ description: 'User ID to assign this task to' })
    @IsUUID()
    @IsOptional()
    assignedToId?: string;

    @ApiPropertyOptional({ enum: Priority, default: Priority.MEDIUM })
    @IsEnum(Priority)
    @IsOptional()
    priority?: Priority;

    @ApiPropertyOptional({ description: 'Points value for completing this task', default: 10 })
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

    @ApiPropertyOptional({ description: 'Due date (ISO format)' })
    @IsDateString()
    @IsOptional()
    dueDate?: string;
}

export class UpdateTaskDto {
    @ApiPropertyOptional({ description: 'Task title' })
    @IsString()
    @IsOptional()
    title?: string;

    @ApiPropertyOptional({ description: 'Task description' })
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

    @ApiPropertyOptional({ description: 'Points value for completing this task' })
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

    @ApiPropertyOptional({ description: 'Due date (ISO format)' })
    @IsDateString()
    @IsOptional()
    dueDate?: string;
}

export class AssignTaskDto {
    @ApiProperty({ description: 'User ID to assign this task to' })
    @IsUUID()
    userId: string;
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

    @ApiPropertyOptional({ description: 'Search in title and description' })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiPropertyOptional({ description: 'Filter by assigned user' })
    @IsUUID()
    @IsOptional()
    assignedToId?: string;

    @ApiPropertyOptional({ description: 'Filter by creator' })
    @IsUUID()
    @IsOptional()
    createdById?: string;
}

export class BulkUpdateTaskStatusDto {
    @ApiProperty({ description: 'Task IDs to update', type: [String] })
    @IsArray()
    @IsUUID('4', { each: true })
    taskIds: string[];

    @ApiProperty({ enum: TaskStatus })
    @IsEnum(TaskStatus)
    status: TaskStatus;
}