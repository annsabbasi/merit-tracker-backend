// src/modules/sub-projects/sub-projects.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubProjectsService } from './sub-projects.service';
import {
    CreateSubProjectDto,
    UpdateSubProjectDto,
    AssignQcHeadDto,
    AddSubProjectMembersDto,
    RemoveSubProjectMembersDto,
    UpdateSubProjectMemberRoleDto,
    SubProjectQueryDto,
    AssignSubProjectDto,
} from './dto/sub-projects.dto';
import { CurrentUser } from '../auth/guards';

@ApiTags('sub-projects')
@Controller('sub-projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubProjectsController {
    constructor(private readonly subProjectsService: SubProjectsService) { }

    // ============================================
    // CREATE - Anyone in company can create
    // ============================================
    @Post()
    @ApiOperation({ summary: 'Create a new subproject (anyone in company can create)' })
    async create(
        @Body() createDto: CreateSubProjectDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.create(createDto, userId, role as any, companyId);
    }

    // ============================================
    // GET ALL BY PROJECT
    // ============================================
    @Get('project/:projectId')
    @ApiOperation({ summary: 'Get all subprojects in a project' })
    async findAll(
        @Param('projectId') projectId: string,
        @CurrentUser('companyId') companyId: string,
        @Query() query: SubProjectQueryDto
    ) {
        return this.subProjectsService.findAll(projectId, companyId, query);
    }

    // ============================================
    // GET MY SUBPROJECTS
    // ============================================
    @Get('my-subprojects')
    @ApiOperation({ summary: 'Get all subprojects where current user is a member, creator, or QC head' })
    async findMySubProjects(
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.findUserSubProjects(userId, companyId);
    }

    // ============================================
    // GET ONE
    // ============================================
    @Get(':id')
    @ApiOperation({ summary: 'Get subproject by ID with full details and stats' })
    async findOne(
        @Param('id') id: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.findOne(id, companyId);
    }

    // ============================================
    // GET SUBPROJECT LEADERBOARD
    // ============================================
    @Get(':id/leaderboard')
    @ApiOperation({ summary: 'Get subproject member leaderboard' })
    async getLeaderboard(
        @Param('id') id: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.getSubProjectLeaderboard(id, companyId);
    }

    // ============================================
    // GET SUBPROJECT STATS
    // ============================================
    @Get(':id/stats')
    @ApiOperation({ summary: 'Get subproject statistics' })
    async getStats(
        @Param('id') id: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.getSubProjectStats(id, companyId);
    }

    // ============================================
    // UPDATE
    // ============================================
    @Put(':id')
    @ApiOperation({ summary: 'Update subproject' })
    async update(
        @Param('id') id: string,
        @Body() updateDto: UpdateSubProjectDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.update(id, updateDto, userId, role as any, companyId);
    }

    // ============================================
    // ASSIGN QC HEAD
    // ============================================
    @Patch(':id/qc-head')
    @ApiOperation({ summary: 'Assign QC Head to subproject (must be QC_ADMIN user)' })
    async assignQcHead(
        @Param('id') id: string,
        @Body() dto: AssignQcHeadDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.assignQcHead(id, dto, userId, role as any, companyId);
    }

    // ============================================
    // ADD MEMBERS - Anyone can add company members
    // ============================================
    @Patch(':id/members/add')
    @ApiOperation({ summary: 'Add members to subproject (anyone can add company members)' })
    async addMembers(
        @Param('id') id: string,
        @Body() dto: AddSubProjectMembersDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.addMembers(id, dto, userId, role as any, companyId);
    }

    // ============================================
    // REMOVE MEMBERS
    // ============================================
    @Patch(':id/members/remove')
    @ApiOperation({ summary: 'Remove members from subproject' })
    async removeMembers(
        @Param('id') id: string,
        @Body() dto: RemoveSubProjectMembersDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.removeMembers(id, dto, userId, role as any, companyId);
    }

    // ============================================
    // UPDATE MEMBER ROLE
    // ============================================
    @Patch(':id/members/role')
    @ApiOperation({ summary: 'Update member role in subproject' })
    async updateMemberRole(
        @Param('id') id: string,
        @Body() dto: UpdateSubProjectMemberRoleDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.updateMemberRole(id, dto, userId, role as any, companyId);
    }

    // ============================================
    // DELETE
    // ============================================
    @Delete(':id')
    @ApiOperation({ summary: 'Delete subproject' })
    async delete(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.delete(id, userId, role as any, companyId);
    }

    // ============================================
    // LEGACY ENDPOINTS (for backward compatibility)
    // ============================================
    @Patch(':id/assign')
    @ApiOperation({ summary: '[LEGACY] Assign user to subproject - use /members/add instead' })
    async assign(
        @Param('id') id: string,
        @Body() dto: AssignSubProjectDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.assign(id, dto, userId, role as any, companyId);
    }

    @Patch(':id/unassign')
    @ApiOperation({ summary: '[LEGACY] Unassign user from subproject - use /members/remove instead' })
    async unassign(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.subProjectsService.unassign(id, userId, role as any, companyId);
    }
}