// src/modules/time-tracking/dto/time-tracking.dto.ts
import { IsString, IsOptional, IsUUID, IsDateString, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class StartTimeTrackingDto {
    @ApiProperty()
    @IsUUID()
    subProjectId: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}

export class StopTimeTrackingDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}

export class UpdateTimeTrackingDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    screenshots?: string[];
}

export class AddScreenshotDto {
    @ApiProperty()
    @IsString()
    screenshotUrl: string;
}

export class TimeTrackingQueryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    subProjectId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    userId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    endDate?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === 'true')
    @IsBoolean()
    activeOnly?: boolean;
}

export class ManualTimeEntryDto {
    @ApiProperty()
    @IsUUID()
    subProjectId: string;

    @ApiProperty()
    @IsDateString()
    startTime: string;

    @ApiProperty()
    @IsDateString()
    endTime: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;

    @IsString()
    userId?: string
}