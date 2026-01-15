// src/modules/profile/dto/profile.dto.ts
import {
    IsString,
    IsOptional,
    IsEmail,
    MinLength,
    MaxLength,
    Matches,
    IsUrl,
    IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================
// UPDATE PROFILE DTO
// ============================================
export class UpdateProfileDto {
    @ApiPropertyOptional({ description: 'First name', example: 'John' })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(50)
    firstName?: string;

    @ApiPropertyOptional({ description: 'Last name', example: 'Doe' })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(50)
    lastName?: string;

    @ApiPropertyOptional({ description: 'Phone number', example: '+1234567890' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;

    @ApiPropertyOptional({
        description: 'Start date at company',
        example: '2024-01-15T00:00:00.000Z',
    })
    @IsOptional()
    @IsDateString()
    startDate?: string;
}

// ============================================
// CHANGE PASSWORD DTO
// ============================================
export class ChangePasswordDto {
    @ApiProperty({ description: 'Current password', example: 'OldPassword123!' })
    @IsString()
    @MinLength(1)
    currentPassword: string;

    @ApiProperty({
        description:
            'New password (min 8 chars, must contain uppercase, lowercase, number, and special character)',
        example: 'NewPassword123!',
    })
    @IsString()
    @MinLength(8)
    @MaxLength(100)
    @Matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
        {
            message:
                'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
        },
    )
    newPassword: string;

    @ApiProperty({ description: 'Confirm new password', example: 'NewPassword123!' })
    @IsString()
    confirmPassword: string;
}

// ============================================
// UPDATE AVATAR DTO (for URL-based avatar update)
// ============================================
export class UpdateAvatarDto {
    @ApiProperty({
        description: 'Avatar URL from storage',
        example: 'https://storage.example.com/avatars/user-123.jpg',
    })
    @IsString()
    @IsUrl()
    avatarUrl: string;
}

// ============================================
// DELETE AVATAR DTO (for confirming deletion)
// ============================================
export class DeleteAvatarDto {
    @ApiPropertyOptional({
        description: 'Confirmation flag',
        example: true,
    })
    @IsOptional()
    confirm?: boolean;
}

// ============================================
// PROFILE RESPONSE DTO (for documentation)
// ============================================
export class ProfileResponseDto {
    @ApiProperty({ example: 'uuid-string' })
    id: string;

    @ApiProperty({ example: 'john.doe@example.com' })
    email: string;

    @ApiProperty({ example: 'John' })
    firstName: string;

    @ApiProperty({ example: 'Doe' })
    lastName: string;

    @ApiProperty({ example: 'USER' })
    role: string;

    @ApiPropertyOptional({ example: 'https://storage.example.com/avatars/user.jpg' })
    avatar?: string;

    @ApiPropertyOptional({ example: '+1234567890' })
    phone?: string;

    @ApiProperty({ example: true })
    isActive: boolean;

    @ApiProperty({ example: 150 })
    points: number;

    @ApiProperty({ example: 25 })
    totalTasksCompleted: number;

    @ApiProperty({ example: 1200 })
    totalTimeTrackedMinutes: number;

    @ApiProperty({ example: 150 })
    totalPointsEarned: number;

    @ApiProperty({ example: 7 })
    currentStreak: number;

    @ApiProperty({ example: 15 })
    longestStreak: number;

    @ApiPropertyOptional({ example: '2024-01-15T10:30:00.000Z' })
    lastActiveDate?: Date;

    @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
    createdAt: Date;

    @ApiProperty({ example: '2024-06-15T10:30:00.000Z' })
    updatedAt: Date;

    @ApiPropertyOptional()
    department?: {
        id: string;
        name: string;
        tag?: string;
    };

    @ApiProperty()
    company: {
        id: string;
        name: string;
        logo?: string;
        companyCode: string;
    };
}

// ============================================
// PROFILE STATS RESPONSE DTO
// ============================================
export class ProfileStatsDto {
    @ApiProperty({ example: 25 })
    totalTasksCompleted: number;

    @ApiProperty({ example: 1200 })
    totalTimeTrackedMinutes: number;

    @ApiProperty({ example: '20h 0m' })
    totalTimeFormatted: string;

    @ApiProperty({ example: 150 })
    totalPointsEarned: number;

    @ApiProperty({ example: 7 })
    currentStreak: number;

    @ApiProperty({ example: 15 })
    longestStreak: number;

    @ApiProperty({ example: 5 })
    projectsCount: number;

    @ApiProperty({ example: 3 })
    subProjectsCount: number;

    @ApiProperty({ example: 12 })
    achievementsCount: number;

    @ApiProperty({ example: 5 })
    leaderboardRank: number;
}

// ============================================
// ACTIVITY SUMMARY DTO
// ============================================
export class ActivitySummaryDto {
    @ApiProperty({ example: '2024-06-01' })
    date: string;

    @ApiProperty({ example: 120 })
    minutesTracked: number;

    @ApiProperty({ example: 5 })
    tasksCompleted: number;

    @ApiProperty({ example: 10 })
    pointsEarned: number;
}