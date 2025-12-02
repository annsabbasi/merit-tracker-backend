// src/modules/time-tracking/time-tracking.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { TimeTracking } from '../../entities/time-tracking.entity';
import { SubProject } from '../../entities/sub-project.entity';
import { ProjectMember } from '../../entities/project-member.entity';
import { User } from '../../entities/user.entity';
import { StartTrackingDto, StopTrackingDto, AddScreenshotDto } from './dto/time-tracking.dto';

@Injectable()
export class TimeTrackingService {
    constructor(
        @InjectRepository(TimeTracking)
        private timeTrackingRepository: Repository<TimeTracking>,
        @InjectRepository(SubProject)
        private subProjectRepository: Repository<SubProject>,
        @InjectRepository(ProjectMember)
        private projectMemberRepository: Repository<ProjectMember>,
    ) { }

    async startTracking(startDto: StartTrackingDto, currentUser: User): Promise<TimeTracking> {
        // Verify sub-project exists and user has access
        const subProject = await this.subProjectRepository.findOne({
            where: { id: startDto.subProjectId },
            relations: ['project'],
        });

        if (!subProject) {
            throw new NotFoundException('SubProject not found');
        }

        if (subProject.project.companyId !== currentUser.companyId) {
            throw new BadRequestException('SubProject not found in your company');
        }

        // Check if user is member of project
        const membership = await this.projectMemberRepository.findOne({
            where: {
                projectId: subProject.projectId,
                userId: currentUser.id,
            },
        });

        if (!membership) {
            throw new BadRequestException('You are not a member of this project');
        }

        // Check if user has active tracking
        const activeTracking = await this.timeTrackingRepository.findOne({
            where: {
                userId: currentUser.id,
                isActive: true,
            },
        });

        if (activeTracking) {
            throw new BadRequestException('You already have an active time tracking session');
        }

        const tracking = this.timeTrackingRepository.create({
            userId: currentUser.id,
            subProjectId: startDto.subProjectId,
            startTime: new Date(),
            isActive: true,
            screenshots: [],
        });

        return this.timeTrackingRepository.save(tracking);
    }

    async stopTracking(id: string, stopDto: StopTrackingDto, currentUser: User): Promise<TimeTracking> {
        const tracking = await this.timeTrackingRepository.findOne({
            where: { id, userId: currentUser.id, isActive: true },
            relations: ['subProject'],
        });

        if (!tracking) {
            throw new NotFoundException('Active tracking session not found');
        }

        const endTime = new Date();
        const durationMinutes = Math.floor((endTime.getTime() - tracking.startTime.getTime()) / 60000);

        tracking.endTime = endTime;
        tracking.durationMinutes = durationMinutes;
        tracking.isActive = false;
        tracking.notes = stopDto.notes ?? '';

        // Award points based on duration
        const pointsEarned = Math.floor(durationMinutes / 30); // 1 point per 30 minutes
        if (pointsEarned > 0) {
            await this.updateMemberPoints(tracking.subProject.projectId, currentUser.id, pointsEarned);
        }

        return this.timeTrackingRepository.save(tracking);
    }

    async addScreenshot(id: string, screenshotDto: AddScreenshotDto, currentUser: User): Promise<TimeTracking> {
        const tracking = await this.timeTrackingRepository.findOne({
            where: { id, userId: currentUser.id, isActive: true },
        });

        if (!tracking) {
            throw new NotFoundException('Active tracking session not found');
        }

        if (!tracking.screenshots) {
            tracking.screenshots = [];
        }

        tracking.screenshots.push(screenshotDto.screenshotUrl);
        return this.timeTrackingRepository.save(tracking);
    }

    async getMyActiveTracking(currentUser: User): Promise<TimeTracking | null> {
        return this.timeTrackingRepository.findOne({
            where: { userId: currentUser.id, isActive: true },
            relations: ['subProject', 'subProject.project'],
        });
    }

    async getMyTrackingHistory(currentUser: User, startDate?: Date, endDate?: Date): Promise<TimeTracking[]> {
        const where: any = { userId: currentUser.id, isActive: false };

        if (startDate && endDate) {
            where.startTime = Between(startDate, endDate);
        }

        return this.timeTrackingRepository.find({
            where,
            relations: ['subProject', 'subProject.project'],
            order: { startTime: 'DESC' },
        });
    }

    async getProjectTimeTracking(projectId: string, companyId: string): Promise<TimeTracking[]> {
        return this.timeTrackingRepository
            .createQueryBuilder('tracking')
            .innerJoin('tracking.subProject', 'subProject')
            .innerJoin('subProject.project', 'project')
            .where('project.id = :projectId', { projectId })
            .andWhere('project.companyId = :companyId', { companyId })
            .leftJoinAndSelect('tracking.user', 'user')
            .leftJoinAndSelect('tracking.subProject', 'sp')
            .orderBy('tracking.startTime', 'DESC')
            .getMany();
    }

    private async updateMemberPoints(projectId: string, userId: string, points: number): Promise<void> {
        const member = await this.projectMemberRepository.findOne({
            where: { projectId, userId },
        });

        if (member) {
            member.pointsEarned += points;
            await this.projectMemberRepository.save(member);
        }
    }
}