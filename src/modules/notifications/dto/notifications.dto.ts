// src/modules/notifications/dto/notifications.dto.ts
import { IsString, IsOptional, IsEnum, IsArray, IsBoolean, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';
import { Transform } from 'class-transformer';

export class CreateNotificationDto {
    @ApiProperty({ description: 'User ID to send notification to' })
    @IsUUID()
    userId: string;

    @ApiProperty({ enum: NotificationType, description: 'Type of notification' })
    @IsEnum(NotificationType)
    type: NotificationType;

    @ApiProperty({ description: 'Notification title' })
    @IsString()
    title: string;

    @ApiProperty({ description: 'Notification message' })
    @IsString()
    message: string;

    @ApiPropertyOptional({ description: 'Additional metadata as JSON' })
    @IsOptional()
    metadata?: Record<string, any>;
}

export class BulkNotificationDto {
    @ApiProperty({ description: 'Array of user IDs to send notification to' })
    @IsArray()
    @IsUUID('4', { each: true })
    userIds: string[];

    @ApiProperty({ enum: NotificationType, description: 'Type of notification' })
    @IsEnum(NotificationType)
    type: NotificationType;

    @ApiProperty({ description: 'Notification title' })
    @IsString()
    title: string;

    @ApiProperty({ description: 'Notification message' })
    @IsString()
    message: string;

    @ApiPropertyOptional({ description: 'Additional metadata as JSON' })
    @IsOptional()
    metadata?: Record<string, any>;
}

export class NotificationQueryDto {
    @ApiPropertyOptional({ enum: NotificationType, description: 'Filter by notification type' })
    @IsOptional()
    @IsEnum(NotificationType)
    type?: NotificationType;

    @ApiPropertyOptional({ description: 'Filter only unread notifications' })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    })
    unreadOnly?: boolean;
}