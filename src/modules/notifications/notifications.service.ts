// src/modules/notifications/notifications.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../../entities/notification.entity';
import { User } from '../../entities/user.entity';

@Injectable()
export class NotificationsService {
    constructor(
        @InjectRepository(Notification)
        private notificationsRepository: Repository<Notification>,
    ) { }

    async create(
        userId: string,
        type: NotificationType,
        title: string,
        message: string,
        metadata?: any,
    ): Promise<Notification> {
        const notification = this.notificationsRepository.create({
            userId,
            type,
            title,
            message,
            metadata,
        });

        return this.notificationsRepository.save(notification);
    }

    async findAll(userId: string): Promise<Notification[]> {
        return this.notificationsRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
    }

    async getUnreadCount(userId: string): Promise<number> {
        return this.notificationsRepository.count({
            where: { userId, isRead: false },
        });
    }

    // async markAsRead(id: string, userId: string): Promise<Notification> {
    async markAsRead(id: string, userId: string): Promise<Notification | null> {
        const notification = await this.notificationsRepository.findOne({
            where: { id, userId },
        });

        if (notification) {
            notification.isRead = true;
            return this.notificationsRepository.save(notification);
        }

        return null;
    }

    async markAllAsRead(userId: string): Promise<void> {
        await this.notificationsRepository.update(
            { userId, isRead: false },
            { isRead: true },
        );
    }

    async delete(id: string, userId: string): Promise<void> {
        await this.notificationsRepository.delete({ id, userId });
    }

    // Helper methods for creating specific notification types
    async notifyProjectAssignment(userId: string, projectName: string, projectId: string): Promise<void> {
        await this.create(
            userId,
            NotificationType.PROJECT_ASSIGNMENT,
            'Project Assignment',
            `You have been assigned to project: ${projectName}`,
            { projectId },
        );
    }

    async notifyTaskAssignment(userId: string, taskTitle: string, subProjectId: string): Promise<void> {
        await this.create(
            userId,
            NotificationType.TASK_ASSIGNMENT,
            'Task Assignment',
            `You have been assigned a new task: ${taskTitle}`,
            { subProjectId },
        );
    }

    async notifySopApproval(userId: string, sopTitle: string, sopId: string): Promise<void> {
        await this.create(
            userId,
            NotificationType.SOP_APPROVAL,
            'SOP Approved',
            `Your SOP "${sopTitle}" has been approved`,
            { sopId },
        );
    }

    async notifySopRejection(userId: string, sopTitle: string, sopId: string, reason: string): Promise<void> {
        await this.create(
            userId,
            NotificationType.SOP_REJECTION,
            'SOP Rejected',
            `Your SOP "${sopTitle}" has been rejected. Reason: ${reason}`,
            { sopId, reason },
        );
    }

    async notifyRoleChange(userId: string, newRole: string): Promise<void> {
        await this.create(
            userId,
            NotificationType.ROLE_CHANGE,
            'Role Updated',
            `Your role has been changed to: ${newRole}`,
            { newRole },
        );
    }
}
