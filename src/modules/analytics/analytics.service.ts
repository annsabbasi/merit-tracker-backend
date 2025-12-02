// src/modules/analytics/analytics.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Project, ProjectStatus } from '../../entities/project.entity';
import { SubProject } from '../../entities/sub-project.entity';
import { TimeTracking } from '../../entities/time-tracking.entity';
import { Sop, SopStatus } from '../../entities/sop.entity';
import { Department } from '../../entities/department.entity';

@Injectable()
export class AnalyticsService {
    constructor(
        @InjectRepository(User)
        private usersRepository: Repository<User>,
        @InjectRepository(Project)
        private projectsRepository: Repository<Project>,
        @InjectRepository(SubProject)
        private subProjectsRepository: Repository<SubProject>,
        @InjectRepository(TimeTracking)
        private timeTrackingRepository: Repository<TimeTracking>,
        @InjectRepository(Sop)
        private sopsRepository: Repository<Sop>,
        @InjectRepository(Department)
        private departmentsRepository: Repository<Department>,
    ) { }

    async getCompanyDashboard(companyId: string) {
        const [
            totalUsers,
            activeUsers,
            totalProjects,
            activeProjects,
            totalDepartments,
            totalSops,
            pendingSops,
        ] = await Promise.all([
            this.usersRepository.count({ where: { companyId } }),
            this.usersRepository.count({ where: { companyId, isActive: true } }),
            this.projectsRepository.count({ where: { companyId } }),
            // this.projectsRepository.count({ where: { companyId, status: 'IN_PROGRESS' } }),
            this.projectsRepository.count({
                where: { companyId, status: ProjectStatus.IN_PROGRESS },
            }),
            this.departmentsRepository.count({ where: { companyId } }),
            this.sopsRepository.count({ where: { companyId } }),
            this.sopsRepository.count({ where: { companyId, status: SopStatus.PENDING_APPROVAL } }),
        ]);

        return {
            users: {
                total: totalUsers,
                active: activeUsers,
            },
            projects: {
                total: totalProjects,
                active: activeProjects,
            },
            departments: totalDepartments,
            sops: {
                total: totalSops,
                pending: pendingSops,
            },
        };
    }

    async getUserAnalytics(userId: string, startDate?: Date, endDate?: Date) {
        const user = await this.usersRepository.findOne({
            where: { id: userId },
            relations: ['projectMemberships'],
        });

        if (!user) {
            return null;
        }

        const where: any = { userId };
        if (startDate && endDate) {
            where.startTime = Between(startDate, endDate);
        }

        const timeTrackings = await this.timeTrackingRepository.find({
            where,
            relations: ['subProject'],
        });

        const totalMinutes = timeTrackings.reduce((sum, t) => sum + t.durationMinutes, 0);
        const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

        const projectsWorkedOn = new Set(timeTrackings.map(t => t.subProject.projectId)).size;

        return {
            totalHours,
            totalMinutes,
            projectsWorkedOn,
            totalPoints: user.points,
            totalSessions: timeTrackings.length,
        };
    }

    async getProjectAnalytics(projectId: string, companyId: string) {
        const project = await this.projectsRepository.findOne({
            where: { id: projectId, companyId },
            relations: ['members', 'subProjects'],
        });

        if (!project) {
            return null;
        }

        const timeTrackings = await this.timeTrackingRepository
            .createQueryBuilder('tracking')
            .innerJoin('tracking.subProject', 'subProject')
            .where('subProject.projectId = :projectId', { projectId })
            .getMany();

        const totalHours = timeTrackings.reduce((sum, t) => sum + t.durationMinutes, 0) / 60;

        const completedTasks = project.subProjects.filter(sp => sp.status === 'COMPLETED').length;
        const totalTasks = project.subProjects.length;
        const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

        return {
            members: project.members.length,
            totalTasks,
            completedTasks,
            completionRate: Math.round(completionRate * 100) / 100,
            totalHours: Math.round(totalHours * 100) / 100,
            budget: project.budget,
        };
    }

    async getDepartmentAnalytics(departmentId: string, companyId: string) {
        const department = await this.departmentsRepository.findOne({
            where: { id: departmentId, companyId },
            relations: ['users'],
        });

        if (!department) {
            return null;
        }

        const totalPoints = department.users.reduce((sum, u) => sum + u.points, 0);
        const avgPoints = department.users.length > 0 ? totalPoints / department.users.length : 0;

        return {
            totalMembers: department.users.length,
            activeMembers: department.users.filter(u => u.isActive).length,
            totalPoints,
            avgPoints: Math.round(avgPoints * 100) / 100,
        };
    }

    async getTimeTrackingReport(companyId: string, startDate: Date, endDate: Date) {
        const projects = await this.projectsRepository.find({
            where: { companyId },
            relations: ['subProjects', 'subProjects.timeTrackings', 'subProjects.timeTrackings.user'],
        });

        const report = projects.map(project => {
            const trackings = project.subProjects.flatMap(sp => sp.timeTrackings || []);
            const filteredTrackings = trackings.filter(
                t => t.startTime >= startDate && t.startTime <= endDate
            );

            const totalHours = filteredTrackings.reduce((sum, t) => sum + t.durationMinutes, 0) / 60;

            return {
                projectId: project.id,
                projectName: project.name,
                totalHours: Math.round(totalHours * 100) / 100,
                sessionsCount: filteredTrackings.length,
            };
        });

        return report;
    }
}