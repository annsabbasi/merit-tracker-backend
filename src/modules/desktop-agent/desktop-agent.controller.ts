// src/modules/desktop-agent/desktop-agent.controller.ts
import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Headers,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { DesktopAgentService } from './desktop-agent.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole, Platform } from '@prisma/client';
import {
    RegisterAgentDto,
    UpdateAgentDto,
    HeartbeatDto,
} from './dto/desktop-agent.dto';
import { CurrentUser, Roles } from '../auth/guards';

@ApiTags('desktop-agent')
@Controller('desktop-agent')
export class DesktopAgentController {
    constructor(private readonly agentService: DesktopAgentService) { }

    // ============================================
    // PUBLIC ENDPOINTS (Agent Communication)
    // ============================================

    // Register agent (requires user JWT)
    @Post('register')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Register a new desktop agent' })
    async registerAgent(
        @Body() dto: RegisterAgentDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.agentService.registerAgent(dto, userId, companyId);
    }

    // Heartbeat (uses agent token, not JWT)
    @Post('heartbeat')
    @ApiOperation({ summary: 'Send heartbeat from agent' })
    @ApiHeader({ name: 'x-agent-token', description: 'Agent authentication token' })
    async heartbeat(
        @Body() dto: HeartbeatDto,
        @Headers('x-agent-token') headerToken?: string,
    ) {
        // Token can come from body or header
        const token = dto.agentToken || headerToken;
        if (!token) {
            throw new UnauthorizedException('Agent token required');
        }
        dto.agentToken = token;
        return this.agentService.heartbeat(dto);
    }

    // Get config (uses agent token)
    @Get('config')
    @ApiOperation({ summary: 'Get agent configuration' })
    @ApiHeader({ name: 'x-agent-token', description: 'Agent authentication token' })
    async getConfig(@Headers('x-agent-token') token: string) {
        if (!token) {
            throw new UnauthorizedException('Agent token required');
        }
        const { agent, user } = await this.agentService.validateAgentToken(token);
        return this.agentService.getAgentConfig(agent.userId, user.companyId);
    }

    // ============================================
    // USER ENDPOINTS (Manage own agents)
    // ============================================

    @Get('my-agents')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get current user\'s agents' })
    async getMyAgents(@CurrentUser('id') userId: string) {
        return this.agentService.getUserAgents(userId);
    }

    @Get('check-installed')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Check if user has agent installed' })
    async checkInstalled(@CurrentUser('id') userId: string) {
        return this.agentService.checkAgentInstalled(userId);
    }

    @Get('download-info')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get agent download information' })
    async getDownloadInfo(@Query('platform') platform?: Platform) {
        return this.agentService.getDownloadInfo(platform);
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get agent by ID' })
    async getAgent(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
    ) {
        return this.agentService.getAgent(id, userId, role as UserRole);
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update agent settings' })
    async updateAgent(
        @Param('id') id: string,
        @Body() dto: UpdateAgentDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
    ) {
        return this.agentService.updateAgent(id, dto, userId, role as UserRole);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete agent' })
    async deleteAgent(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.agentService.deleteAgent(id, userId, role as UserRole, companyId);
    }

    @Post(':id/deactivate')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Deactivate agent' })
    async deactivateAgent(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.agentService.deactivateAgent(id, userId, role as UserRole, companyId);
    }

    // ============================================
    // ADMIN ENDPOINTS
    // ============================================

    @Get('company/all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all agents in company (admin only)' })
    async getCompanyAgents(
        @CurrentUser('companyId') companyId: string,
        @CurrentUser('role') role: string,
    ) {
        return this.agentService.getCompanyAgents(companyId, role as UserRole);
    }
}