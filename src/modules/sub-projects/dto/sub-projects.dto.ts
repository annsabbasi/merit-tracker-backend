// src/modules/sub-projects/dto/sub-projects.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsOptional,
    IsUUID,
    IsEnum,
    IsInt,
    Min,
    Max,
    IsArray,
    IsDateString,
    ValidateNested,
    ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SubProjectStatus, Priority, SubProjectMemberRole } from '@prisma/client';

// ============================================
// CREATE SUBPROJECT DTO
// ============================================
export class CreateSubProjectDto {
    @ApiProperty({ description: 'Title of the subproject' })
    @IsString()
    title: string;

    @ApiPropertyOptional({ description: 'Description of the subproject' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ description: 'Project ID this subproject belongs to' })
    @IsUUID()
    projectId: string;

    @ApiPropertyOptional({ description: 'User ID of the QC Head (must be QC_ADMIN role)' })
    @IsUUID()
    @IsOptional()
    qcHeadId?: string;

    @ApiPropertyOptional({ description: 'Initial member IDs to add to this subproject' })
    @IsArray()
    @IsUUID('4', { each: true })
    @IsOptional()
    memberIds?: string[];

    @ApiPropertyOptional({ enum: Priority, default: Priority.MEDIUM })
    @IsEnum(Priority)
    @IsOptional()
    priority?: Priority;

    @ApiPropertyOptional({ description: 'Points value for completing this subproject' })
    @IsInt()
    @Min(0)
    @Max(1000)
    @IsOptional()
    pointsValue?: number;

    @ApiPropertyOptional({ description: 'Estimated hours to complete' })
    @IsInt()
    @Min(0)
    @IsOptional()
    estimatedHours?: number;

    @ApiPropertyOptional({ description: 'Due date (ISO format)' })
    @IsDateString()
    @IsOptional()
    dueDate?: string;
}

// ============================================
// UPDATE SUBPROJECT DTO
// ============================================
export class UpdateSubProjectDto {
    @ApiPropertyOptional({ description: 'Title of the subproject' })
    @IsString()
    @IsOptional()
    title?: string;

    @ApiPropertyOptional({ description: 'Description of the subproject' })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiPropertyOptional({ enum: SubProjectStatus })
    @IsEnum(SubProjectStatus)
    @IsOptional()
    status?: SubProjectStatus;

    @ApiPropertyOptional({ enum: Priority })
    @IsEnum(Priority)
    @IsOptional()
    priority?: Priority;

    @ApiPropertyOptional({ description: 'User ID of the QC Head (must be QC_ADMIN role)' })
    @IsUUID()
    @IsOptional()
    qcHeadId?: string;

    @ApiPropertyOptional({ description: 'Points value for completing this subproject' })
    @IsInt()
    @Min(0)
    @Max(1000)
    @IsOptional()
    pointsValue?: number;

    @ApiPropertyOptional({ description: 'Estimated hours to complete' })
    @IsInt()
    @Min(0)
    @IsOptional()
    estimatedHours?: number;

    @ApiPropertyOptional({ description: 'Due date (ISO format)' })
    @IsDateString()
    @IsOptional()
    dueDate?: string;
}

// ============================================
// ASSIGN QC HEAD DTO
// ============================================
export class AssignQcHeadDto {
    @ApiProperty({ description: 'User ID of the QC Head (must be QC_ADMIN role)' })
    @IsUUID()
    qcHeadId: string;
}

// ============================================
// ADD MEMBERS DTO
// ============================================
export class AddSubProjectMembersDto {
    @ApiProperty({ description: 'User IDs to add as members', type: [String] })
    @IsArray()
    @IsUUID('4', { each: true })
    @ArrayMinSize(1)
    userIds: string[];

    @ApiPropertyOptional({ enum: SubProjectMemberRole, default: SubProjectMemberRole.MEMBER })
    @IsEnum(SubProjectMemberRole)
    @IsOptional()
    role?: SubProjectMemberRole;
}

// ============================================
// REMOVE MEMBERS DTO
// ============================================
export class RemoveSubProjectMembersDto {
    @ApiProperty({ description: 'User IDs to remove', type: [String] })
    @IsArray()
    @IsUUID('4', { each: true })
    @ArrayMinSize(1)
    userIds: string[];
}

// ============================================
// UPDATE MEMBER ROLE DTO
// ============================================
export class UpdateSubProjectMemberRoleDto {
    @ApiProperty({ description: 'User ID' })
    @IsUUID()
    userId: string;

    @ApiProperty({ enum: SubProjectMemberRole })
    @IsEnum(SubProjectMemberRole)
    role: SubProjectMemberRole;
}

// ============================================
// SUBPROJECT QUERY DTO
// ============================================
export class SubProjectQueryDto {
    @ApiPropertyOptional({ enum: SubProjectStatus })
    @IsEnum(SubProjectStatus)
    @IsOptional()
    status?: SubProjectStatus;

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

    @ApiPropertyOptional({ description: 'Filter by QC Head' })
    @IsUUID()
    @IsOptional()
    qcHeadId?: string;

    @ApiPropertyOptional({ description: 'Filter by member' })
    @IsUUID()
    @IsOptional()
    memberId?: string;
}

// ============================================
// LEGACY: ASSIGN SUBPROJECT DTO (kept for backward compatibility)
// ============================================
export class AssignSubProjectDto {
    @ApiProperty({ description: 'User ID to assign' })
    @IsUUID()
    userId: string;
}