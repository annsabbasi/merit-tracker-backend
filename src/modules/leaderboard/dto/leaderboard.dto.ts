// src/modules/leaderboard/dto/leaderboard.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, IsDateString, IsInt, Min, Max } from 'class-validator';
import { LeaderboardPeriod } from '@prisma/client';

export class LeaderboardQueryDto {
    @ApiPropertyOptional({ enum: LeaderboardPeriod, default: LeaderboardPeriod.ALL_TIME })
    @IsEnum(LeaderboardPeriod)
    @IsOptional()
    period?: LeaderboardPeriod;

    @ApiPropertyOptional({ description: 'Filter by project ID' })
    @IsUUID()
    @IsOptional()
    projectId?: string;

    @ApiPropertyOptional({ description: 'Filter by department ID' })
    @IsUUID()
    @IsOptional()
    departmentId?: string;

    @ApiPropertyOptional({ description: 'Filter by subproject ID' })
    @IsUUID()
    @IsOptional()
    subProjectId?: string;

    @ApiPropertyOptional({ description: 'Start date for custom period' })
    @IsDateString()
    @IsOptional()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date for custom period' })
    @IsDateString()
    @IsOptional()
    endDate?: string;

    @ApiPropertyOptional({ description: 'Limit results', default: 50 })
    @IsInt()
    @Min(1)
    @Max(100)
    @IsOptional()
    limit?: number;
}

export class UserPerformanceQueryDto {
    @ApiPropertyOptional({ enum: LeaderboardPeriod, default: LeaderboardPeriod.ALL_TIME })
    @IsEnum(LeaderboardPeriod)
    @IsOptional()
    period?: LeaderboardPeriod;

    @ApiPropertyOptional({ description: 'Start date for custom period' })
    @IsDateString()
    @IsOptional()
    startDate?: string;

    @ApiPropertyOptional({ description: 'End date for custom period' })
    @IsDateString()
    @IsOptional()
    endDate?: string;
}

// Response DTOs for documentation
export class LeaderboardEntryDto {
    @ApiProperty()
    rank: number;

    @ApiProperty()
    user: {
        id: string;
        firstName: string;
        lastName: string;
        avatar: string | null;
        email: string;
    };

    @ApiProperty()
    metrics: {
        tasksCompleted: number;
        totalMinutes: number;
        totalHours: number;
        pointsEarned: number;
        subProjectsContributed: number;
        projectsContributed: number;
        averageTaskCompletionTime: number;
    };

    @ApiProperty()
    performanceScore: number;

    @ApiProperty()
    trend: 'up' | 'down' | 'stable';
}

export class UserPerformanceDto {
    @ApiProperty()
    user: {
        id: string;
        firstName: string;
        lastName: string;
        avatar: string | null;
        email: string;
        role: string;
        totalPoints: number;
    };

    @ApiProperty()
    currentPeriod: {
        tasksCompleted: number;
        totalMinutes: number;
        totalHours: number;
        pointsEarned: number;
        subProjectsContributed: number;
        projectsContributed: number;
        averageTaskCompletionTime: number;
        performanceScore: number;
    };

    @ApiProperty()
    previousPeriod: {
        tasksCompleted: number;
        totalMinutes: number;
        pointsEarned: number;
        performanceScore: number;
    };

    @ApiProperty()
    change: {
        tasksCompletedChange: number;
        timeChange: number;
        pointsChange: number;
        scoreChange: number;
    };

    @ApiProperty()
    rank: {
        current: number;
        previous: number;
        change: number;
    };

    @ApiProperty()
    achievements: {
        type: string;
        title: string;
        earnedAt: Date;
    }[];

    @ApiProperty()
    streaks: {
        current: number;
        longest: number;
    };

    @ApiProperty()
    recentActivity: {
        date: Date;
        tasksCompleted: number;
        minutesWorked: number;
    }[];
}