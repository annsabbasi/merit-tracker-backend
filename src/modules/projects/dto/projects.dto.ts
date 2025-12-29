// src/modules/projects/dto/projects.dto.ts
import { IsString, IsOptional, IsEnum, IsArray, IsUUID, IsNumber, IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus, ProjectMemberRole } from '@prisma/client';

export class CreateProjectDto {
    @ApiProperty({ description: 'Project name' })
    @IsString()
    @IsNotEmpty({ message: 'Project name is required' })
    name: string;

    @ApiPropertyOptional({ description: 'Project description' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ description: 'Project budget' })
    @IsNumber()
    @IsOptional()
    budget?: number;

    @ApiPropertyOptional({ enum: ProjectStatus, default: ProjectStatus.PLANNING })
    @IsEnum(ProjectStatus)
    @IsOptional()
    status?: ProjectStatus;

    @ApiPropertyOptional({ description: 'Project lead user ID' })
    @IsUUID()
    @IsOptional()
    projectLeadId?: string;

    @ApiPropertyOptional({ description: 'Project start date' })
    @IsString()
    @IsOptional()
    startDate?: string;

    @ApiPropertyOptional({ description: 'Project end date' })
    @IsString()
    @IsOptional()
    endDate?: string;

    @ApiPropertyOptional({ description: 'Enable screen monitoring' })
    @IsBoolean()
    @IsOptional()
    screenMonitoringEnabled?: boolean;

    @ApiPropertyOptional({ description: 'Initial member IDs' })
    @IsArray()
    @IsUUID('4', { each: true })
    @IsOptional()
    memberIds?: string[];

    // ============================================
    // NEW: Required department ID - Project MUST belong to a department
    // ============================================
    @ApiProperty({ description: 'Department ID - Required. Every project must belong to a department.' })
    @IsUUID()
    @IsNotEmpty({ message: 'Department is required. Every project must be linked to a department.' })
    departmentId: string;
}

export class UpdateProjectDto {
    @ApiPropertyOptional({ description: 'Project name' })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({ description: 'Project description' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ description: 'Project budget' })
    @IsNumber()
    @IsOptional()
    budget?: number;

    @ApiPropertyOptional({ enum: ProjectStatus })
    @IsEnum(ProjectStatus)
    @IsOptional()
    status?: ProjectStatus;

    @ApiPropertyOptional({ description: 'Project lead user ID' })
    @IsUUID()
    @IsOptional()
    projectLeadId?: string;

    @ApiPropertyOptional({ description: 'Project start date' })
    @IsString()
    @IsOptional()
    startDate?: string;

    @ApiPropertyOptional({ description: 'Project end date' })
    @IsString()
    @IsOptional()
    endDate?: string;

    @ApiPropertyOptional({ description: 'Enable screen monitoring' })
    @IsBoolean()
    @IsOptional()
    screenMonitoringEnabled?: boolean;
}

export class AddProjectMembersDto {
    @ApiProperty({ description: 'User IDs to add' })
    @IsArray()
    @IsUUID('4', { each: true })
    userIds: string[];
}

export class RemoveProjectMembersDto {
    @ApiProperty({ description: 'User IDs to remove' })
    @IsArray()
    @IsUUID('4', { each: true })
    userIds: string[];
}

export class UpdateMemberRoleDto {
    @ApiProperty({ description: 'User ID' })
    @IsUUID()
    userId: string;

    @ApiProperty({ enum: ProjectMemberRole })
    @IsEnum(ProjectMemberRole)
    role: ProjectMemberRole;
}

export class ProjectQueryDto {
    @ApiPropertyOptional({ enum: ProjectStatus })
    @IsEnum(ProjectStatus)
    @IsOptional()
    status?: ProjectStatus;

    @ApiPropertyOptional({ description: 'Search term' })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiPropertyOptional({ description: 'Filter by department ID' })
    @IsUUID()
    @IsOptional()
    departmentId?: string;
}