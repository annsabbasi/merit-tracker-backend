// src/modules/departments/dto/departments.dto.ts
import { IsString, IsOptional, IsArray, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
    @ApiProperty({ description: 'Department name' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ description: 'Department description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ description: 'Color tag (hex code) for visual identification' })
    @IsOptional()
    @IsString()
    tag?: string;

    @ApiPropertyOptional({ description: 'Department head user ID' })
    @IsOptional()
    @IsUUID()
    leadId?: string;

    @ApiPropertyOptional({ description: 'Department start date' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'Department end date' })
    @IsOptional()
    @IsDateString()
    endDate?: string;

    @ApiPropertyOptional({ description: 'Initial member user IDs to add to department' })
    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    memberIds?: string[];

    @ApiPropertyOptional({ description: 'Project IDs to link to department' })
    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    projectIds?: string[];
}

export class UpdateDepartmentDto {
    @ApiPropertyOptional({ description: 'Department name' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ description: 'Department description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ description: 'Color tag (hex code)' })
    @IsOptional()
    @IsString()
    tag?: string;

    @ApiPropertyOptional({ description: 'Department head user ID' })
    @IsOptional()
    @IsUUID()
    leadId?: string;

    @ApiPropertyOptional({ description: 'Department start date' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'Department end date' })
    @IsOptional()
    @IsDateString()
    endDate?: string;
}

export class AssignUsersDto {
    @ApiProperty({ description: 'Array of user IDs to assign to department' })
    @IsArray()
    @IsUUID('4', { each: true })
    userIds: string[];
}

export class RemoveUsersDto {
    @ApiProperty({ description: 'Array of user IDs to remove from department' })
    @IsArray()
    @IsUUID('4', { each: true })
    userIds: string[];
}

export class LinkProjectsDto {
    @ApiProperty({ description: 'Array of project IDs to link to department' })
    @IsArray()
    @IsUUID('4', { each: true })
    projectIds: string[];
}

export class UnlinkProjectsDto {
    @ApiProperty({ description: 'Array of project IDs to unlink from department' })
    @IsArray()
    @IsUUID('4', { each: true })
    projectIds: string[];
}

export class DepartmentQueryDto {
    @ApiPropertyOptional({ description: 'Search by name or description' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ description: 'Filter by lead ID' })
    @IsOptional()
    @IsUUID()
    leadId?: string;
}