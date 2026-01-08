// src/modules/projects/projects.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
// import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateProjectDto, UpdateProjectDto, AddProjectMembersDto, RemoveProjectMembersDto, UpdateMemberRoleDto, ProjectQueryDto } from './dto/projects.dto';
import { ProjectsService } from './projects.service';
import { CurrentUser } from '../auth/guards';

@ApiTags('projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProjectsController {
    constructor(private readonly projectsService: ProjectsService) { }

    @Post('create')
    @ApiOperation({ summary: 'Create a new project' })
    async create(@Body() createDto: CreateProjectDto, @CurrentUser('role') role: string, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
        console.log("Hitted the controller")
        return this.projectsService.create(createDto, role as any, userId, companyId);
    }

    @Get()
    @ApiOperation({ summary: 'Get all projects in company' })
    async findAll(@CurrentUser('companyId') companyId: string, @Query() query: ProjectQueryDto) {
        return this.projectsService.findAll(companyId, query);
    }

    @Get('my-projects')
    @ApiOperation({ summary: 'Get projects where current user is a member' })
    async findMyProjects(@CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
        return this.projectsService.findUserProjects(userId, companyId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get project by ID' })
    async findOne(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
        return this.projectsService.findOne(id, companyId);
    }

    @Get(':id/leaderboard')
    @ApiOperation({ summary: 'Get project leaderboard' })
    async getLeaderboard(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
        return this.projectsService.getProjectLeaderboard(id, companyId);
    }

    @Get(':id/stats')
    @ApiOperation({ summary: 'Get project statistics' })
    async getStats(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
        return this.projectsService.getProjectStats(id, companyId);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update project' })
    async update(@Param('id') id: string, @Body() updateDto: UpdateProjectDto, @CurrentUser('role') role: string, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
        return this.projectsService.update(id, updateDto, role as any, userId, companyId);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete project' })
    async delete(@Param('id') id: string, @CurrentUser('role') role: string, @CurrentUser('companyId') companyId: string) {
        return this.projectsService.delete(id, role as any, companyId);
    }

    @Patch(':id/members/add')
    @ApiOperation({ summary: 'Add members to project' })
    async addMembers(@Param('id') id: string, @Body() dto: AddProjectMembersDto, @CurrentUser('role') role: string, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
        return this.projectsService.addMembers(id, dto, role as any, userId, companyId);
    }

    @Patch(':id/members/remove')
    @ApiOperation({ summary: 'Remove members from project' })
    async removeMembers(@Param('id') id: string, @Body() dto: RemoveProjectMembersDto, @CurrentUser('role') role: string, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
        return this.projectsService.removeMembers(id, dto, role as any, userId, companyId);
    }

    @Patch(':id/members/role')
    @ApiOperation({ summary: 'Update member role in project' })
    async updateMemberRole(@Param('id') id: string, @Body() dto: UpdateMemberRoleDto, @CurrentUser('role') role: string, @CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string) {
        return this.projectsService.updateMemberRole(id, dto, role as any, userId, companyId);
    }
}