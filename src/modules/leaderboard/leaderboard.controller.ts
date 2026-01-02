// src/modules/leaderboard/leaderboard.controller.ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardQueryDto, UserPerformanceQueryDto } from './dto/leaderboard.dto';
import { CurrentUser, Roles } from '../auth/guards';
import { UserRole } from '@prisma/client';

@ApiTags('leaderboard')
@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeaderboardController {
    constructor(private readonly leaderboardService: LeaderboardService) { }

    // ============================================
    // COMPANY LEADERBOARD
    // ============================================
    @Get()
    @ApiOperation({ summary: 'Get company-wide leaderboard with performance metrics' })
    async getCompanyLeaderboard(
        @CurrentUser('companyId') companyId: string,
        @Query() query: LeaderboardQueryDto
    ) {
        return this.leaderboardService.getCompanyLeaderboard(companyId, query);
    }

    // ============================================
    // PROJECT LEADERBOARD
    // ============================================
    @Get('project/:projectId')
    @ApiOperation({ summary: 'Get project leaderboard' })
    async getProjectLeaderboard(
        @Param('projectId') projectId: string,
        @CurrentUser('companyId') companyId: string,
        @Query() query: LeaderboardQueryDto
    ) {
        return this.leaderboardService.getProjectLeaderboard(projectId, companyId, query);
    }

    // ============================================
    // SUBPROJECT LEADERBOARD
    // ============================================
    @Get('sub-project/:subProjectId')
    @ApiOperation({ summary: 'Get subproject leaderboard' })
    async getSubProjectLeaderboard(
        @Param('subProjectId') subProjectId: string,
        @CurrentUser('companyId') companyId: string,
        @Query() query: LeaderboardQueryDto
    ) {
        return this.leaderboardService.getSubProjectLeaderboard(subProjectId, companyId, query);
    }

    // ============================================
    // MY PERFORMANCE
    // ============================================
    @Get('my-performance')
    @ApiOperation({ summary: 'Get current user performance details and stats' })
    async getMyPerformance(
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string,
        @Query() query: UserPerformanceQueryDto
    ) {
        return this.leaderboardService.getMyPerformance(userId, companyId, query);
    }

    // ============================================
    // USER PERFORMANCE (Admin only)
    // ============================================
    @Get('user/:userId')
    @UseGuards(RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY)
    @ApiOperation({ summary: 'Get specific user performance details (admin only)' })
    async getUserPerformance(
        @Param('userId') userId: string,
        @CurrentUser('companyId') companyId: string,
        @Query() query: UserPerformanceQueryDto
    ) {
        return this.leaderboardService.getUserPerformance(userId, companyId, query);
    }

    // ============================================
    // CHECK MY ACHIEVEMENTS
    // ============================================
    @Get('my-achievements')
    @ApiOperation({ summary: 'Check and get current user achievements' })
    async checkMyAchievements(
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string
    ) {
        // First check for new achievements
        await this.leaderboardService.checkAndAwardAchievements(userId, companyId);

        // Then return user performance which includes achievements
        return this.leaderboardService.getMyPerformance(userId, companyId, {});
    }
}