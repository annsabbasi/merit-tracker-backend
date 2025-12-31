// src/modules/departments/departments.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import {
    CreateDepartmentDto,
    UpdateDepartmentDto,
    AssignUsersDto,
    RemoveUsersDto,
    LinkProjectsDto,
    UnlinkProjectsDto,
    DepartmentQueryDto
} from './dto/departments.dto';
import { CurrentUser, Roles } from '../auth/guards';

@ApiTags('departments')
@Controller('departments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DepartmentsController {
    constructor(private readonly departmentsService: DepartmentsService) { }

    @Post()
    @UseGuards(RolesGuard)
    @Roles(UserRole.COMPANY)
    @ApiOperation({ summary: 'Create new department (Company Admin only)' })
    async create(
        @Body() createDto: CreateDepartmentDto,
        @CurrentUser('id') currentUserId: string,
        @CurrentUser('role') currentUserRole: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.departmentsService.create(createDto, currentUserId, currentUserRole as UserRole, companyId);
    }

    @Get()
    @ApiOperation({ summary: 'Get all departments with stats' })
    async findAll(
        @CurrentUser('companyId') companyId: string,
        @Query() query: DepartmentQueryDto
    ) {
        return this.departmentsService.findAll(companyId, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get department by ID with full details' })
    async findOne(
        @Param('id') id: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.departmentsService.findOne(id, companyId);
    }

    @Get(':id/stats')
    @ApiOperation({ summary: 'Get department statistics' })
    async getStats(
        @Param('id') id: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.departmentsService.getStats(id, companyId);
    }

    @Get(':id/available-projects')
    @ApiOperation({ summary: 'Get projects not linked to this department' })
    async getAvailableProjects(
        @Param('id') id: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.departmentsService.getAvailableProjects(id, companyId);
    }

    @Get(':id/available-users')
    @ApiOperation({ summary: 'Get users not in this department' })
    async getAvailableUsers(
        @Param('id') id: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.departmentsService.getAvailableUsers(id, companyId);
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.COMPANY)
    @ApiOperation({ summary: 'Update department (Company Admin only)' })
    async update(
        @Param('id') id: string,
        @Body() updateDto: UpdateDepartmentDto,
        @CurrentUser('id') currentUserId: string,
        @CurrentUser('role') currentUserRole: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.departmentsService.update(id, updateDto, currentUserId, currentUserRole as UserRole, companyId);
    }

    @Patch(':id/assign-users')
    @UseGuards(RolesGuard)
    @Roles(UserRole.COMPANY)
    @ApiOperation({ summary: 'Assign users to department (Company Admin only)' })
    async assignUsers(
        @Param('id') id: string,
        @Body() dto: AssignUsersDto,
        @CurrentUser('id') currentUserId: string,
        @CurrentUser('role') currentUserRole: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.departmentsService.assignUsers(id, dto, currentUserId, currentUserRole as UserRole, companyId);
    }

    @Patch(':id/remove-users')
    @UseGuards(RolesGuard)
    @Roles(UserRole.COMPANY)
    @ApiOperation({ summary: 'Remove users from department (Company Admin only)' })
    async removeUsers(
        @Param('id') id: string,
        @Body() dto: RemoveUsersDto,
        @CurrentUser('id') currentUserId: string,
        @CurrentUser('role') currentUserRole: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.departmentsService.removeUsers(id, dto, currentUserId, currentUserRole as UserRole, companyId);
    }

    @Patch(':id/link-projects')
    @UseGuards(RolesGuard)
    @Roles(UserRole.COMPANY)
    @ApiOperation({ summary: 'Link projects to department (Company Admin only)' })
    async linkProjects(
        @Param('id') id: string,
        @Body() dto: LinkProjectsDto,
        @CurrentUser('id') currentUserId: string,
        @CurrentUser('role') currentUserRole: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.departmentsService.linkProjects(id, dto, currentUserId, currentUserRole as UserRole, companyId);
    }

    @Patch(':id/unlink-projects')
    @UseGuards(RolesGuard)
    @Roles(UserRole.COMPANY)
    @ApiOperation({ summary: 'Unlink projects from department (Company Admin only)' })
    async unlinkProjects(
        @Param('id') id: string,
        @Body() dto: UnlinkProjectsDto,
        @CurrentUser('id') currentUserId: string,
        @CurrentUser('role') currentUserRole: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.departmentsService.unlinkProjects(id, dto, currentUserId, currentUserRole as UserRole, companyId);
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.COMPANY)
    @ApiOperation({ summary: 'Delete department (Company Admin only)' })
    async delete(
        @Param('id') id: string,
        @CurrentUser('role') currentUserRole: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.departmentsService.delete(id, currentUserRole as UserRole, companyId);
    }
}