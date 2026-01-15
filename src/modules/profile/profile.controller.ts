// src/modules/profile/profile.controller.ts
import {
    Controller,
    Get,
    Put,
    Patch,
    Post,
    Delete,
    Body,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
    ParseIntPipe,
    DefaultValuePipe,
    ParseBoolPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiOperation,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
    ApiQuery,
    ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/guards';
import { ProfileService } from './profile.service';
import {
    UpdateProfileDto,
    ChangePasswordDto,
    ProfileResponseDto,
    ProfileStatsDto,
} from './dto/profile.dto';

@ApiTags('profile')
@Controller('profile')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProfileController {
    constructor(private readonly profileService: ProfileService) { }

    // ============================================
    // GET MY PROFILE
    // ============================================
    @Get()
    @ApiOperation({
        summary: 'Get current user profile',
        description: 'Returns the complete profile of the authenticated user including company, department, projects, and achievements',
    })
    @ApiResponse({
        status: 200,
        description: 'Profile retrieved successfully',
        type: ProfileResponseDto,
    })
    async getProfile(@CurrentUser('id') userId: string) {
        return this.profileService.getProfile(userId);
    }

    // ============================================
    // UPDATE PROFILE
    // ============================================
    @Put()
    @ApiOperation({
        summary: 'Update profile information',
        description: 'Update first name, last name, phone number, and start date',
    })
    @ApiResponse({
        status: 200,
        description: 'Profile updated successfully',
    })
    async updateProfile(
        @CurrentUser('id') userId: string,
        @Body() updateDto: UpdateProfileDto,
    ) {
        return this.profileService.updateProfile(userId, updateDto);
    }

    // ============================================
    // CHANGE PASSWORD
    // ============================================
    @Post('change-password')
    @ApiOperation({
        summary: 'Change password',
        description: 'Change the current password. Requires current password verification.',
    })
    @ApiResponse({
        status: 200,
        description: 'Password changed successfully',
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid password or passwords do not match',
    })
    @ApiResponse({
        status: 401,
        description: 'Current password is incorrect',
    })
    async changePassword(
        @CurrentUser('id') userId: string,
        @Body() changePasswordDto: ChangePasswordDto,
    ) {
        return this.profileService.changePassword(userId, changePasswordDto);
    }

    // ============================================
    // UPLOAD AVATAR
    // ============================================
    @Post('avatar')
    @ApiOperation({
        summary: 'Upload profile avatar',
        description: 'Upload a new avatar image. Supported formats: JPEG, PNG, GIF, WebP. Max size: 5MB',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                avatar: {
                    type: 'string',
                    format: 'binary',
                    description: 'Avatar image file',
                },
            },
            required: ['avatar'],
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Avatar uploaded successfully',
    })
    @ApiResponse({
        status: 400,
        description: 'Invalid file type or size',
    })
    @UseInterceptors(
        FileInterceptor('avatar', {
            limits: {
                fileSize: 5 * 1024 * 1024, // 5MB
            },
            fileFilter: (req, file, callback) => {
                const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
                if (allowedMimes.includes(file.mimetype)) {
                    callback(null, true);
                } else {
                    callback(
                        new BadRequestException(
                            'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.',
                        ),
                        false,
                    );
                }
            },
        }),
    )
    async uploadAvatar(
        @CurrentUser('id') userId: string,
        @UploadedFile() file: Express.Multer.File,
    ) {
        if (!file) {
            throw new BadRequestException('No avatar file provided');
        }
        return this.profileService.uploadAvatar(userId, file);
    }

    // ============================================
    // DELETE AVATAR
    // ============================================
    @Delete('avatar')
    @ApiOperation({
        summary: 'Delete profile avatar',
        description: 'Remove the current avatar image',
    })
    @ApiResponse({
        status: 200,
        description: 'Avatar deleted successfully',
    })
    @ApiResponse({
        status: 400,
        description: 'No avatar to delete',
    })
    async deleteAvatar(@CurrentUser('id') userId: string) {
        return this.profileService.deleteAvatar(userId);
    }

    // ============================================
    // GET PROFILE STATS
    // ============================================
    @Get('stats')
    @ApiOperation({
        summary: 'Get profile statistics',
        description: 'Returns aggregated statistics including tasks completed, time tracked, points, streaks, and leaderboard rank',
    })
    @ApiResponse({
        status: 200,
        description: 'Statistics retrieved successfully',
        type: ProfileStatsDto,
    })
    async getProfileStats(@CurrentUser('id') userId: string) {
        return this.profileService.getProfileStats(userId);
    }

    // ============================================
    // GET ACTIVITY SUMMARY
    // ============================================
    @Get('activity')
    @ApiOperation({
        summary: 'Get activity summary',
        description: 'Returns daily activity breakdown for the specified number of days',
    })
    @ApiQuery({
        name: 'days',
        required: false,
        type: Number,
        description: 'Number of days to retrieve (default: 30, max: 90)',
        example: 30,
    })
    @ApiResponse({
        status: 200,
        description: 'Activity summary retrieved successfully',
    })
    async getActivitySummary(
        @CurrentUser('id') userId: string,
        @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    ) {
        // Limit days to 90
        const limitedDays = Math.min(Math.max(days, 1), 90);
        return this.profileService.getActivitySummary(userId, limitedDays);
    }

    // ============================================
    // GET ACHIEVEMENTS
    // ============================================
    @Get('achievements')
    @ApiOperation({
        summary: 'Get user achievements',
        description: 'Returns all achievements/badges earned by the user',
    })
    @ApiResponse({
        status: 200,
        description: 'Achievements retrieved successfully',
    })
    async getAchievements(@CurrentUser('id') userId: string) {
        return this.profileService.getAchievements(userId);
    }

    // ============================================
    // GET MY PROJECTS
    // ============================================
    @Get('projects')
    @ApiOperation({
        summary: 'Get my projects',
        description: 'Returns all projects where the user is a member or lead',
    })
    @ApiResponse({
        status: 200,
        description: 'Projects retrieved successfully',
    })
    async getMyProjects(@CurrentUser('id') userId: string) {
        return this.profileService.getMyProjects(userId);
    }

    // ============================================
    // GET RECENT TIME TRACKINGS
    // ============================================
    @Get('time-trackings')
    @ApiOperation({
        summary: 'Get recent time trackings',
        description: 'Returns the most recent time tracking sessions',
    })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Number of records to retrieve (default: 10, max: 50)',
        example: 10,
    })
    @ApiResponse({
        status: 200,
        description: 'Time trackings retrieved successfully',
    })
    async getRecentTimeTrackings(
        @CurrentUser('id') userId: string,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    ) {
        const limitedLimit = Math.min(Math.max(limit, 1), 50);
        return this.profileService.getRecentTimeTrackings(userId, limitedLimit);
    }

    // ============================================
    // GET NOTIFICATIONS
    // ============================================
    @Get('notifications')
    @ApiOperation({
        summary: 'Get notifications',
        description: 'Returns user notifications with optional unread filter',
    })
    @ApiQuery({
        name: 'unreadOnly',
        required: false,
        type: Boolean,
        description: 'Filter to show only unread notifications',
        example: false,
    })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Number of notifications to retrieve (default: 20, max: 100)',
        example: 20,
    })
    @ApiResponse({
        status: 200,
        description: 'Notifications retrieved successfully',
    })
    async getNotifications(
        @CurrentUser('id') userId: string,
        @Query('unreadOnly', new DefaultValuePipe(false), ParseBoolPipe) unreadOnly: boolean,
        @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    ) {
        const limitedLimit = Math.min(Math.max(limit, 1), 100);
        return this.profileService.getNotifications(userId, unreadOnly, limitedLimit);
    }

    // ============================================
    // MARK NOTIFICATIONS AS READ
    // ============================================
    @Patch('notifications/read')
    @ApiOperation({
        summary: 'Mark notifications as read',
        description: 'Mark specific notifications or all notifications as read',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                notificationIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of notification IDs to mark as read. If empty, marks all as read.',
                    example: ['notif-id-1', 'notif-id-2'],
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Notifications marked as read',
    })
    async markNotificationsAsRead(
        @CurrentUser('id') userId: string,
        @Body('notificationIds') notificationIds?: string[],
    ) {
        return this.profileService.markNotificationsAsRead(userId, notificationIds);
    }
}