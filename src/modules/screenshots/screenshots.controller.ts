// src/modules/screenshots/screenshots.controller.ts
import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ScreenshotsService } from './screenshots.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import {
    UploadScreenshotDto,
    DeleteScreenshotDto,
    BulkDeleteScreenshotsDto,
    ScreenshotQueryDto,
    ReportFailedCaptureDto,
} from './dto/screenshots.dto';
import { CurrentUser, Roles } from '../auth/guards';

@ApiTags('screenshots')
@Controller('screenshots')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ScreenshotsController {
    constructor(private readonly screenshotsService: ScreenshotsService) { }

    // ============================================
    // UPLOAD SCREENSHOT (from Desktop Agent)
    // ============================================
    @Post('upload')
    @ApiOperation({ summary: 'Upload a screenshot from desktop agent' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['file', 'timeTrackingId', 'capturedAt'],
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Screenshot image file (JPEG, PNG, WebP)',
                },
                timeTrackingId: {
                    type: 'string',
                    description: 'Time tracking session ID',
                },
                capturedAt: {
                    type: 'string',
                    description: 'ISO datetime when screenshot was captured',
                },
                screenWidth: {
                    type: 'number',
                    description: 'Screen width in pixels',
                },
                screenHeight: {
                    type: 'number',
                    description: 'Screen height in pixels',
                },
                monitorIndex: {
                    type: 'number',
                    description: 'Monitor index (0 = primary)',
                },
                checksum: {
                    type: 'string',
                    description: 'SHA-256 checksum of image',
                },
            },
        },
    })
    @UseInterceptors(
        FileInterceptor('file', {
            limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
            fileFilter: (req, file, cb) => {
                if (!file.mimetype.match(/^image\/(jpeg|png|webp)$/)) {
                    return cb(new BadRequestException('Only JPEG, PNG, and WebP images are allowed'), false);
                }
                cb(null, true);
            },
        }),
    )
    async uploadScreenshot(
        @UploadedFile() file: Express.Multer.File,
        @Body() dto: UploadScreenshotDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        if (!file) {
            throw new BadRequestException('Screenshot file is required');
        }
        return this.screenshotsService.uploadScreenshot(file, dto, userId, companyId);
    }

    // ============================================
    // REPORT FAILED CAPTURE
    // ============================================
    @Post('report-failed')
    @ApiOperation({ summary: 'Report a failed screenshot capture attempt' })
    async reportFailedCapture(
        @Body() dto: ReportFailedCaptureDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.screenshotsService.reportFailedCapture(dto, userId, companyId);
    }

    // ============================================
    // GET ALL SCREENSHOTS (with filters)
    // ============================================
    @Get()
    @ApiOperation({ summary: 'Get screenshots with filters and pagination' })
    async getScreenshots(
        @Query() query: ScreenshotQueryDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.screenshotsService.getScreenshots(query, userId, role as UserRole, companyId);
    }

    // ============================================
    // GET SCREENSHOTS FOR TIME TRACKING SESSION
    // ============================================
    @Get('time-tracking/:timeTrackingId')
    @ApiOperation({ summary: 'Get all screenshots for a time tracking session' })
    async getScreenshotsByTimeTracking(
        @Param('timeTrackingId') timeTrackingId: string,
        @Query('includeDeleted') includeDeleted: boolean,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.screenshotsService.getScreenshotsByTimeTracking(
            timeTrackingId,
            userId,
            role as UserRole,
            companyId,
            includeDeleted,
        );
    }

    // ============================================
    // GET SCREENSHOT STATS FOR TIME TRACKING
    // ============================================
    @Get('time-tracking/:timeTrackingId/stats')
    @ApiOperation({ summary: 'Get screenshot statistics for a time tracking session' })
    async getScreenshotStats(
        @Param('timeTrackingId') timeTrackingId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.screenshotsService.getScreenshotStats(
            timeTrackingId,
            userId,
            role as UserRole,
            companyId,
        );
    }

    // ============================================
    // GET USER SCREENSHOT SUMMARY
    // ============================================
    @Get('user/:userId/summary')
    @UseGuards(RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY)
    @ApiOperation({ summary: 'Get screenshot summary for a user (admin only)' })
    async getUserScreenshotSummary(
        @Param('userId') userId: string,
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.screenshotsService.getUserScreenshotSummary(
            userId,
            companyId,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
        );
    }

    // ============================================
    // GET MY SCREENSHOT SUMMARY
    // ============================================
    @Get('my-summary')
    @ApiOperation({ summary: 'Get screenshot summary for current user' })
    async getMyScreenshotSummary(
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.screenshotsService.getUserScreenshotSummary(
            userId,
            companyId,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined,
        );
    }

    // ============================================
    // GET SINGLE SCREENSHOT
    // ============================================
    @Get(':id')
    @ApiOperation({ summary: 'Get screenshot by ID' })
    async getScreenshot(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.screenshotsService.getScreenshot(id, userId, role as UserRole, companyId);
    }

    // ============================================
    // DELETE SCREENSHOT
    // ============================================
    @Delete(':id')
    @ApiOperation({ summary: 'Delete a screenshot (with time deduction)' })
    async deleteScreenshot(
        @Param('id') id: string,
        @Body() dto: DeleteScreenshotDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.screenshotsService.deleteScreenshot(
            id,
            dto,
            userId,
            role as UserRole,
            companyId,
        );
    }

    // ============================================
    // BULK DELETE SCREENSHOTS
    // ============================================
    @Delete('bulk')
    @ApiOperation({ summary: 'Delete multiple screenshots (with time deduction)' })
    async bulkDeleteScreenshots(
        @Body() dto: BulkDeleteScreenshotsDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        return this.screenshotsService.bulkDeleteScreenshots(
            dto,
            userId,
            role as UserRole,
            companyId,
        );
    }
}