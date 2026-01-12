// src/modules/desktop-agent/desktop-agent-api.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    Headers,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
    UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiHeader, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { DesktopAgentApiService } from './desktop-agent-api.service';
import { CaptureStatus } from '@prisma/client';

@ApiTags('desktop-agent-api')
@Controller('desktop-agent-api')
export class DesktopAgentApiController {
    constructor(private readonly apiService: DesktopAgentApiService) { }

    // ============================================
    // Helper: Get agent token from headers
    // ============================================
    private getAgentToken(headers: any): string {
        const token = headers['x-agent-token'];
        if (!token) {
            throw new UnauthorizedException('Agent token required in x-agent-token header');
        }
        return token;
    }

    // ============================================
    // GET MY PROJECTS & SUBPROJECTS
    // ============================================
    @Get('my-projects')
    @ApiOperation({ summary: 'Get user projects and subprojects (agent authenticated)' })
    @ApiHeader({ name: 'x-agent-token', description: 'Agent authentication token', required: true })
    async getMyProjects(@Headers() headers: any) {
        const token = this.getAgentToken(headers);
        return this.apiService.getMyProjects(token);
    }

    // ============================================
    // START TIME TRACKING
    // ============================================
    @Post('time-tracking/start')
    @ApiOperation({ summary: 'Start time tracking on a subproject' })
    @ApiHeader({ name: 'x-agent-token', description: 'Agent authentication token', required: true })
    async startTimeTracking(
        @Headers() headers: any,
        @Body() body: { subProjectId: string; notes?: string },
    ) {
        const token = this.getAgentToken(headers);

        if (!body.subProjectId) {
            throw new BadRequestException('subProjectId is required');
        }

        return this.apiService.startTimeTracking(token, body.subProjectId, body.notes);
    }

    // ============================================
    // STOP TIME TRACKING
    // ============================================
    @Post('time-tracking/stop')
    @ApiOperation({ summary: 'Stop time tracking' })
    @ApiHeader({ name: 'x-agent-token', description: 'Agent authentication token', required: true })
    async stopTimeTracking(
        @Headers() headers: any,
        @Body() body: { timeTrackingId?: string; notes?: string },
    ) {
        const token = this.getAgentToken(headers);
        return this.apiService.stopTimeTracking(token, body.timeTrackingId, body.notes);
    }

    // ============================================
    // GET ACTIVE TIME TRACKING
    // ============================================
    @Get('time-tracking/active')
    @ApiOperation({ summary: 'Get active time tracking session' })
    @ApiHeader({ name: 'x-agent-token', description: 'Agent authentication token', required: true })
    async getActiveTimeTracking(@Headers() headers: any) {
        const token = this.getAgentToken(headers);
        return this.apiService.getActiveTimeTracking(token);
    }

    // ============================================
    // UPLOAD SCREENSHOT
    // ============================================
    @Post('screenshots/upload')
    @ApiOperation({ summary: 'Upload screenshot from desktop agent' })
    @ApiHeader({ name: 'x-agent-token', description: 'Agent authentication token', required: true })
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
                    return cb(
                        new BadRequestException('Only JPEG, PNG, and WebP images are allowed'),
                        false,
                    );
                }
                cb(null, true);
            },
        }),
    )
    async uploadScreenshot(
        @Headers() headers: any,
        @UploadedFile() file: Express.Multer.File,
        @Body()
        body: {
            timeTrackingId: string;
            capturedAt: string;
            screenWidth?: string;
            screenHeight?: string;
            monitorIndex?: string;
            checksum?: string;
        },
    ) {
        const token = this.getAgentToken(headers);

        if (!file) {
            throw new BadRequestException('Screenshot file is required');
        }

        if (!body.timeTrackingId) {
            throw new BadRequestException('timeTrackingId is required');
        }

        if (!body.capturedAt) {
            throw new BadRequestException('capturedAt is required');
        }

        return this.apiService.uploadScreenshot(
            token,
            file,
            body.timeTrackingId,
            body.capturedAt,
            body.screenWidth ? parseInt(body.screenWidth) : undefined,
            body.screenHeight ? parseInt(body.screenHeight) : undefined,
            body.monitorIndex ? parseInt(body.monitorIndex) : undefined,
            body.checksum,
        );
    }

    // ============================================
    // REPORT FAILED CAPTURE
    // ============================================
    @Post('screenshots/report-failed')
    @ApiOperation({ summary: 'Report a failed screenshot capture' })
    @ApiHeader({ name: 'x-agent-token', description: 'Agent authentication token', required: true })
    async reportFailedCapture(
        @Headers() headers: any,
        @Body()
        body: {
            timeTrackingId: string;
            status: CaptureStatus;
            attemptedAt: string;
            errorMessage?: string;
        },
    ) {
        const token = this.getAgentToken(headers);

        if (!body.timeTrackingId) {
            throw new BadRequestException('timeTrackingId is required');
        }

        if (!body.status) {
            throw new BadRequestException('status is required');
        }

        if (!body.attemptedAt) {
            throw new BadRequestException('attemptedAt is required');
        }

        return this.apiService.reportFailedCapture(
            token,
            body.timeTrackingId,
            body.status,
            body.attemptedAt,
            body.errorMessage,
        );
    }

    // ============================================
    // GET RECENT SCREENSHOTS
    // ============================================
    @Get('screenshots/recent')
    @ApiOperation({ summary: 'Get recent screenshots for current user' })
    @ApiHeader({ name: 'x-agent-token', description: 'Agent authentication token', required: true })
    async getRecentScreenshots(
        @Headers() headers: any,
        @Query('limit') limit?: string,
    ) {
        const token = this.getAgentToken(headers);
        return this.apiService.getRecentScreenshots(token, limit ? parseInt(limit) : 10);
    }
}