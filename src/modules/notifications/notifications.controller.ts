// src/modules/notifications/notifications.controller.ts
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../../common/decorators/roles.decorato';
// import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { CreateNotificationDto, BulkNotificationDto, NotificationQueryDto } from './dto/notifications.dto';
import { CurrentUser, Roles } from '../auth/guards';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Post() @UseGuards(RolesGuard) @Roles(UserRole.QC_ADMIN, UserRole.COMPANY) @ApiOperation({ summary: 'Create a notification (admin only)' })
    async create(@Body() dto: CreateNotificationDto, @CurrentUser('role') role: string) { return this.notificationsService.create(dto, role as any); }

    @Post('bulk') @UseGuards(RolesGuard) @Roles(UserRole.QC_ADMIN, UserRole.COMPANY) @ApiOperation({ summary: 'Create notifications for multiple users (admin only)' })
    async createBulk(@Body() dto: BulkNotificationDto, @CurrentUser('role') role: string) { return this.notificationsService.createBulk(dto, role as any); }

    @Get() @ApiOperation({ summary: 'Get all notifications for current user' })
    async findAll(@CurrentUser('id') userId: string, @Query() query: NotificationQueryDto) { return this.notificationsService.findAll(userId, query); }

    @Get('unread-count') @ApiOperation({ summary: 'Get unread notification count' })
    async getUnreadCount(@CurrentUser('id') userId: string) { return this.notificationsService.getUnreadCount(userId); }

    @Patch(':id/read') @ApiOperation({ summary: 'Mark notification as read' })
    async markAsRead(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.notificationsService.markAsRead(id, userId); }

    @Patch('read-all') @ApiOperation({ summary: 'Mark all notifications as read' })
    async markAllAsRead(@CurrentUser('id') userId: string) { return this.notificationsService.markAllAsRead(userId); }

    @Delete(':id') @ApiOperation({ summary: 'Delete a notification' })
    async delete(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.notificationsService.delete(id, userId); }

    @Delete('clear-read') @ApiOperation({ summary: 'Delete all read notifications' })
    async deleteAllRead(@CurrentUser('id') userId: string) { return this.notificationsService.deleteAllRead(userId); }
}