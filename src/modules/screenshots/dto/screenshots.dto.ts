// src/modules/screenshots/dto/screenshots.dto.ts
import { IsString, IsOptional, IsNumber, IsEnum, IsDateString, IsBoolean, Min, Max, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CaptureStatus } from '@prisma/client';

// ============================================
// UPLOAD SCREENSHOT DTO (from Desktop Agent)
// ============================================
export class UploadScreenshotDto {
    @ApiProperty({ description: 'Time tracking session ID' })
    @IsUUID()
    timeTrackingId: string;

    @ApiProperty({ description: 'When the screenshot was captured (ISO string)' })
    @IsDateString()
    capturedAt: string;

    @ApiPropertyOptional({ description: 'Screen width in pixels' })
    @IsOptional()
    @IsNumber()
    screenWidth?: number;

    @ApiPropertyOptional({ description: 'Screen height in pixels' })
    @IsOptional()
    @IsNumber()
    screenHeight?: number;

    @ApiPropertyOptional({ description: 'Monitor index (0 = primary)' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    monitorIndex?: number;

    @ApiPropertyOptional({ description: 'SHA-256 checksum of the image' })
    @IsOptional()
    @IsString()
    checksum?: string;

    @ApiPropertyOptional({ description: 'Capture status', enum: CaptureStatus })
    @IsOptional()
    @IsEnum(CaptureStatus)
    captureStatus?: CaptureStatus;
}

// ============================================
// DELETE SCREENSHOT DTO
// ============================================
export class DeleteScreenshotDto {
    @ApiPropertyOptional({ description: 'Reason for deletion' })
    @IsOptional()
    @IsString()
    reason?: string;
}

// ============================================
// BULK DELETE SCREENSHOTS DTO
// ============================================
export class BulkDeleteScreenshotsDto {
    @ApiProperty({ description: 'Array of screenshot IDs to delete' })
    @IsUUID('4', { each: true })
    screenshotIds: string[];

    @ApiPropertyOptional({ description: 'Reason for deletion' })
    @IsOptional()
    @IsString()
    reason?: string;
}

// ============================================
// SCREENSHOT QUERY DTO
// ============================================
export class ScreenshotQueryDto {
    @ApiPropertyOptional({ description: 'Filter by time tracking session ID' })
    @IsOptional()
    @IsUUID()
    timeTrackingId?: string;

    @ApiPropertyOptional({ description: 'Filter by user ID' })
    @IsOptional()
    @IsUUID()
    userId?: string;

    @ApiPropertyOptional({ description: 'Filter by project ID' })
    @IsOptional()
    @IsUUID()
    projectId?: string;

    @ApiPropertyOptional({ description: 'Filter by task ID' })
    @IsOptional()
    @IsUUID()
    subProjectId?: string;

    @ApiPropertyOptional({ description: 'Start date filter (ISO string)' })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date filter (ISO string)' })
    @IsOptional()
    @IsDateString()
    endDate?: string;

    @ApiPropertyOptional({ description: 'Include deleted screenshots' })
    @IsOptional()
    @IsBoolean()
    includeDeleted?: boolean;

    @ApiPropertyOptional({ description: 'Page number', default: 1 })
    @IsOptional()
    @IsNumber()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({ description: 'Items per page', default: 50 })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    limit?: number;
}

// ============================================
// SCREENSHOT STATS DTO (Response)
// ============================================
export class ScreenshotStatsDto {
    totalCaptures: number;
    successfulCaptures: number;
    failedCaptures: number;
    deletedCaptures: number;
    totalMinutesTracked: number;
    totalMinutesDeducted: number;
    effectiveMinutes: number;
    captureRate: number; // Percentage of expected captures that succeeded
}

// ============================================
// REPORT FAILED CAPTURE DTO (from Desktop Agent)
// ============================================
export class ReportFailedCaptureDto {
    @ApiProperty({ description: 'Time tracking session ID' })
    @IsUUID()
    timeTrackingId: string;

    @ApiProperty({ description: 'When the capture was attempted (ISO string)' })
    @IsDateString()
    attemptedAt: string;

    @ApiProperty({ description: 'Failure status', enum: CaptureStatus })
    @IsEnum(CaptureStatus)
    status: CaptureStatus;

    @ApiPropertyOptional({ description: 'Error message or details' })
    @IsOptional()
    @IsString()
    errorMessage?: string;
}