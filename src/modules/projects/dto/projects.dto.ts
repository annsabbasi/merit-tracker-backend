// src/modules/projects/dto/projects.dto.ts
// UPDATED VERSION with Screen Capture option
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsDateString, IsArray, IsUUID, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus, ProjectMemberRole } from '@prisma/client';

// ============================================
// CREATE PROJECT DTO
// ============================================
export class CreateProjectDto {
    @ApiProperty({ description: 'Project name' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ description: 'Project description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ description: 'Project budget' })
    @IsOptional()
    @IsNumber()
    budget?: number;

    @ApiProperty({ description: 'Department ID (required - every project must belong to a department)' })
    @IsUUID()
    departmentId: string;

    @ApiPropertyOptional({ description: 'Project lead user ID' })
    @IsOptional()
    @IsUUID()
    projectLeadId?: string;

    @ApiPropertyOptional({ description: 'Project start date' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'Project end date' })
    @IsOptional()
    @IsDateString()
    endDate?: string;

    @ApiPropertyOptional({ description: 'Initial member IDs to add to project' })
    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    memberIds?: string[];

    // ============================================
    // SCREEN CAPTURE OPTIONS
    // ============================================
    @ApiPropertyOptional({
        description: 'Enable screen capture for time tracking on this project',
        default: false
    })
    @IsOptional()
    @IsBoolean()
    screenCaptureEnabled?: boolean;

    @ApiPropertyOptional({
        description: 'Base capture interval in minutes (actual interval will be random between 2-5 mins)',
        default: 3,
        minimum: 2,
        maximum: 5
    })
    @IsOptional()
    @IsNumber()
    @Min(2)
    @Max(5)
    screenCaptureInterval?: number;
}

// ============================================
// UPDATE PROJECT DTO
// ============================================
export class UpdateProjectDto {
    @ApiPropertyOptional({ description: 'Project name' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ description: 'Project description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ description: 'Project budget' })
    @IsOptional()
    @IsNumber()
    budget?: number;

    @ApiPropertyOptional({ description: 'Project status', enum: ProjectStatus })
    @IsOptional()
    @IsEnum(ProjectStatus)
    status?: ProjectStatus;

    @ApiPropertyOptional({ description: 'Project lead user ID' })
    @IsOptional()
    @IsUUID()
    projectLeadId?: string;

    @ApiPropertyOptional({ description: 'Project start date' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'Project end date' })
    @IsOptional()
    @IsDateString()
    endDate?: string;

    // ============================================
    // SCREEN CAPTURE OPTIONS
    // ============================================
    @ApiPropertyOptional({
        description: 'Enable/disable screen capture for time tracking'
    })
    @IsOptional()
    @IsBoolean()
    screenCaptureEnabled?: boolean;

    @ApiPropertyOptional({
        description: 'Base capture interval in minutes',
        minimum: 2,
        maximum: 5
    })
    @IsOptional()
    @IsNumber()
    @Min(2)
    @Max(5)
    screenCaptureInterval?: number;
}

// ============================================
// ADD PROJECT MEMBERS DTO
// ============================================
export class AddProjectMembersDto {
    @ApiProperty({ description: 'Array of user IDs to add to project' })
    @IsArray()
    @IsUUID('4', { each: true })
    userIds: string[];
}

// ============================================
// REMOVE PROJECT MEMBERS DTO
// ============================================
export class RemoveProjectMembersDto {
    @ApiProperty({ description: 'Array of user IDs to remove from project' })
    @IsArray()
    @IsUUID('4', { each: true })
    userIds: string[];
}

// ============================================
// UPDATE MEMBER ROLE DTO
// ============================================
export class UpdateMemberRoleDto {
    @ApiProperty({ description: 'User ID' })
    @IsUUID()
    userId: string;

    @ApiProperty({ description: 'New role', enum: ProjectMemberRole })
    @IsEnum(ProjectMemberRole)
    role: ProjectMemberRole;
}

// ============================================
// PROJECT QUERY DTO
// ============================================
export class ProjectQueryDto {
    @ApiPropertyOptional({ description: 'Filter by status', enum: ProjectStatus })
    @IsOptional()
    @IsEnum(ProjectStatus)
    status?: ProjectStatus;

    @ApiPropertyOptional({ description: 'Filter by department ID' })
    @IsOptional()
    @IsUUID()
    departmentId?: string;

    @ApiPropertyOptional({ description: 'Search by name or description' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ description: 'Filter by screen capture enabled' })
    @IsOptional()
    @IsBoolean()
    screenCaptureEnabled?: boolean;
}