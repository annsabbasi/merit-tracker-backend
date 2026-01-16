// src/modules/departments/dto/departments.dto.ts
import { IsString, IsOptional, IsUUID, IsArray, MaxLength, MinLength, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
    @ApiProperty({ description: 'Department name' })
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional({ description: 'Department description' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @ApiPropertyOptional({ description: 'Department tag/label' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    tag?: string;

    @ApiPropertyOptional({ description: 'Department logo URL (from storage upload)' })
    @IsOptional()
    @IsString()
    logo?: string;

    @ApiPropertyOptional({ description: 'Department lead user ID' })
    @IsOptional()
    @IsUUID()
    leadId?: string;

    @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD or ISO format)' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD or ISO format)' })
    @IsOptional()
    @IsDateString()
    endDate?: string;

    @ApiPropertyOptional({ description: 'Array of user IDs to assign as members', type: [String] })
    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    memberIds?: string[];

    @ApiPropertyOptional({ description: 'Array of project IDs to link', type: [String] })
    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    projectIds?: string[];
}

export class UpdateDepartmentDto {
    @ApiPropertyOptional({ description: 'Department name' })
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({ description: 'Department description' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @ApiPropertyOptional({ description: 'Department tag/label' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    tag?: string;

    @ApiPropertyOptional({ description: 'Department logo URL (from storage upload)' })
    @IsOptional()
    @IsString()
    logo?: string;

    @ApiPropertyOptional({ description: 'Department lead user ID' })
    @IsOptional()
    @IsUUID()
    leadId?: string;

    @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD or ISO format)' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD or ISO format)' })
    @IsOptional()
    @IsDateString()
    endDate?: string;
}

export class AssignUsersDto {
    @ApiProperty({ description: 'Array of user IDs to assign', type: [String] })
    @IsArray()
    @IsUUID('4', { each: true })
    userIds: string[];
}

export class RemoveUsersDto {
    @ApiProperty({ description: 'Array of user IDs to remove', type: [String] })
    @IsArray()
    @IsUUID('4', { each: true })
    userIds: string[];
}

export class LinkProjectsDto {
    @ApiProperty({ description: 'Array of project IDs to link', type: [String] })
    @IsArray()
    @IsUUID('4', { each: true })
    projectIds: string[];
}

export class UnlinkProjectsDto {
    @ApiProperty({ description: 'Array of project IDs to unlink', type: [String] })
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

export class UpdateDepartmentLogoDto {
    @ApiProperty({ description: 'Logo URL from storage upload' })
    @IsString()
    logo: string;
}