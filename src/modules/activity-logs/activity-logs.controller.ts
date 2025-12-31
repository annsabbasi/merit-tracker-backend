// src/modules/activity-logs/activity-logs.controller.ts
import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
// import { ActivityLogsService } from './activity-logs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../../common/decorators/roles.decorator';
// import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { ActivityLogQueryDto } from './dto/activity-logs.dto';
import { ActivityLogsService } from './activity-logs.service';
import { CurrentUser, Roles } from '../auth/guards';

@ApiTags('activity-logs')
@Controller('activity-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ActivityLogsController {
    constructor(private readonly activityLogsService: ActivityLogsService) { }

    @Get() @UseGuards(RolesGuard) @Roles(UserRole.QC_ADMIN, UserRole.COMPANY) @ApiOperation({ summary: 'Get activity logs (admin only)' })
    async findAll(@CurrentUser('companyId') companyId: string, @Query() query: ActivityLogQueryDto, @CurrentUser('role') role: string) { return this.activityLogsService.findAll(companyId, query, role as any); }

    @Get('stats') @UseGuards(RolesGuard) @Roles(UserRole.QC_ADMIN, UserRole.COMPANY) @ApiOperation({ summary: 'Get activity statistics (admin only)' })
    async getStats(@CurrentUser('companyId') companyId: string, @CurrentUser('role') role: string) { return this.activityLogsService.getStats(companyId, role as any); }

    @Get('user/:userId') @ApiOperation({ summary: 'Get activity logs for a specific user' })
    async findByUser(@Param('userId') userId: string, @CurrentUser('companyId') companyId: string, @CurrentUser('id') currentUserId: string, @CurrentUser('role') role: string) { return this.activityLogsService.findByUser(userId, companyId, currentUserId, role as any); }

    @Get('my-activity') @ApiOperation({ summary: 'Get current user activity logs' })
    async findMyActivity(@CurrentUser('id') userId: string, @CurrentUser('companyId') companyId: string, @CurrentUser('role') role: string) { return this.activityLogsService.findByUser(userId, companyId, userId, role as any); }
}