// src/modules/desktop-agent/dto/desktop-agent.dto.ts
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsDateString, Min, Max, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Platform } from '@prisma/client';

// ============================================
// REGISTER AGENT DTO
// ============================================
export class RegisterAgentDto {
    @ApiProperty({ description: 'Unique machine identifier' })
    @IsString()
    machineId: string;

    @ApiPropertyOptional({ description: 'Computer name' })
    @IsOptional()
    @IsString()
    machineName?: string;

    @ApiProperty({ description: 'Operating system platform', enum: Platform })
    @IsEnum(Platform)
    platform: Platform;

    @ApiProperty({ description: 'Agent version string' })
    @IsString()
    agentVersion: string;
}

// ============================================
// UPDATE AGENT DTO
// ============================================
export class UpdateAgentDto {
    @ApiPropertyOptional({ description: 'Computer name' })
    @IsOptional()
    @IsString()
    machineName?: string;

    @ApiPropertyOptional({ description: 'Agent version string' })
    @IsOptional()
    @IsString()
    agentVersion?: string;

    @ApiPropertyOptional({ description: 'JPEG quality for captures (1-100)' })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(100)
    captureQuality?: number;

    @ApiPropertyOptional({ description: 'Capture all monitors' })
    @IsOptional()
    @IsBoolean()
    captureAllMonitors?: boolean;
}

// ============================================
// HEARTBEAT DTO
// ============================================
export class HeartbeatDto {
    @ApiProperty({ description: 'Agent token' })
    @IsString()
    agentToken: string;

    @ApiPropertyOptional({ description: 'Current agent status' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({ description: 'Agent version' })
    @IsOptional()
    @IsString()
    agentVersion?: string;
}

// ============================================
// AGENT STATUS RESPONSE
// ============================================
export class AgentStatusDto {
    id: string;
    machineId: string;
    machineName: string | null;
    platform: Platform;
    agentVersion: string;
    isOnline: boolean;
    isActive: boolean;
    lastHeartbeat: Date | null;
    lastActiveAt: Date | null;
    captureQuality: number;
    captureAllMonitors: boolean;
}

// ============================================
// AGENT CONFIG RESPONSE (sent to agent)
// ============================================
export class AgentConfigDto {
    // User info
    userId: string;
    companyId: string;

    // Global settings
    screenCaptureEnabled: boolean;

    // Capture settings
    captureQuality: number;
    captureAllMonitors: boolean;
    minIntervalSeconds: number;  // 2 minutes = 120 seconds
    maxIntervalSeconds: number;  // 5 minutes = 300 seconds

    // Active time tracking info (if any)
    activeTimeTracking: {
        id: string;
        subProjectId: string;
        subProjectTitle: string;
        projectId: string;
        projectName: string;
        screenCaptureRequired: boolean;
        startTime: Date;
    } | null;

    // Server timestamp for sync
    serverTime: Date;
}

// ============================================
// START TRACKING REQUEST (from agent)
// ============================================
export class AgentStartTrackingDto {
    @ApiProperty({ description: 'Sub-project/task ID to track' })
    @IsUUID()
    subProjectId: string;

    @ApiPropertyOptional({ description: 'Notes for the session' })
    @IsOptional()
    @IsString()
    notes?: string;
}

// ============================================
// STOP TRACKING REQUEST (from agent)
// ============================================
export class AgentStopTrackingDto {
    @ApiPropertyOptional({ description: 'Notes for the session' })
    @IsOptional()
    @IsString()
    notes?: string;
}

// ============================================
// AGENT DOWNLOAD INFO
// ============================================
export class AgentDownloadInfoDto {
    platform: Platform;
    version: string;
    downloadUrl: string;
    releaseDate: Date;
    fileSize: number;
    checksum: string;
    releaseNotes: string;
}