// src/modules/users/users.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User, UserRole, NotificationType } from '@prisma/client';
import { UpdateUserDto, UpdateUserRoleDto } from './dto/users.dto';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    // ============================================
    // Helper: Send notification
    // ============================================
    private async sendNotification(
        userId: string,
        type: NotificationType,
        title: string,
        message: string,
        metadata?: Record<string, any>
    ) {
        await this.prisma.notification.create({
            data: {
                userId,
                type,
                title,
                message,
                metadata: metadata || {},
            },
        });
    }

    // ============================================
    // FIND ALL
    // ============================================
    async findAll(companyId: string): Promise<User[]> {
        return this.prisma.user.findMany({
            where: { companyId },
            include: { department: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ============================================
    // FIND ONE
    // ============================================
    async findOne(id: string, companyId: string): Promise<User> {
        const user = await this.prisma.user.findFirst({
            where: {
                id,
                companyId,
            },
            include: {
                department: true,
                company: true,
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    // ============================================
    // FIND BY EMAIL
    // ============================================
    async findByEmail(email: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { email },
            include: { company: true },
        });
    }

    // ============================================
    // UPDATE USER
    // ============================================
    async update(id: string, updateDto: UpdateUserDto, currentUser: User): Promise<User> {
        const user = await this.findOne(id, currentUser.companyId);

        // Only allow updating own profile or if user is admin
        if (user.id !== currentUser.id && currentUser.role === UserRole.USER) {
            throw new ForbiddenException('You can only update your own profile');
        }

        const oldDepartmentId = user.departmentId;
        const newDepartmentId = updateDto.departmentId;
        const departmentChanged = newDepartmentId !== undefined && newDepartmentId !== oldDepartmentId;

        // Validate department exists if departmentId is provided
        let newDepartment: any = null;
        if (updateDto.departmentId) {
            newDepartment = await this.prisma.department.findFirst({
                where: {
                    id: updateDto.departmentId,
                    companyId: currentUser.companyId,
                },
            });

            if (!newDepartment) {
                throw new NotFoundException('Department not found in your company');
            }
        }

        const updatedUser = await this.prisma.user.update({
            where: { id },
            data: updateDto,
            include: { department: true, company: true },
        });

        // ============================================
        // SEND NOTIFICATIONS
        // ============================================

        // Notify user about department change (if changed by admin)
        if (departmentChanged && currentUser.id !== id) {
            await this.sendNotification(
                id,
                NotificationType.DEPARTMENT_ASSIGNMENT,
                'Department Changed',
                newDepartment
                    ? `You have been moved to the "${newDepartment.name}" department.`
                    : 'You have been removed from your department.',
                {
                    oldDepartmentId,
                    newDepartmentId: newDepartmentId || null,
                    newDepartmentName: newDepartment?.name || null,
                    changedBy: currentUser.id,
                }
            );
        }

        return updatedUser;
    }

    // ============================================
    // UPDATE ROLE
    // ============================================
    async updateRole(id: string, updateDto: UpdateUserRoleDto, currentUser: User): Promise<User> {
        // Only company admin or QC admin can change roles
        if (currentUser.role === UserRole.USER) {
            throw new ForbiddenException('Insufficient permissions to change roles');
        }

        const user = await this.findOne(id, currentUser.companyId);

        // Cannot change company admin role
        if (user.role === UserRole.COMPANY) {
            throw new ForbiddenException('Cannot change company admin role');
        }

        // QC_ADMIN cannot promote to COMPANY
        if (currentUser.role === UserRole.QC_ADMIN && updateDto.role === UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can promote to company admin role');
        }

        const oldRole = user.role;

        const updatedUser = await this.prisma.user.update({
            where: { id },
            data: { role: updateDto.role },
            include: { department: true, company: true },
        });

        // ============================================
        // SEND NOTIFICATIONS
        // ============================================

        // Notify user about role change
        if (id !== currentUser.id) {
            const isPromotion = this.isRolePromotion(oldRole, updateDto.role);

            await this.sendNotification(
                id,
                NotificationType.ROLE_CHANGE,
                isPromotion ? 'Role Promotion' : 'Role Updated',
                `Your role has been changed from ${oldRole.replace('_', ' ')} to ${updateDto.role.replace('_', ' ')}.`,
                {
                    oldRole,
                    newRole: updateDto.role,
                    changedBy: currentUser.id,
                    isPromotion,
                }
            );
        }

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId: currentUser.companyId,
                userId: currentUser.id,
                activityType: 'USER_ROLE_CHANGED',
                description: `Changed ${user.firstName} ${user.lastName}'s role from ${oldRole} to ${updateDto.role}`,
                metadata: {
                    targetUserId: id,
                    oldRole,
                    newRole: updateDto.role,
                },
            },
        });

        return updatedUser;
    }

    // ============================================
    // DEACTIVATE USER
    // ============================================
    async deactivate(id: string, currentUser: User): Promise<User> {
        // Only company admin can deactivate users
        if (currentUser.role !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can deactivate users');
        }

        const user = await this.findOne(id, currentUser.companyId);

        // Cannot deactivate self
        if (user.id === currentUser.id) {
            throw new ForbiddenException('Cannot deactivate your own account');
        }

        // Cannot deactivate company admin
        if (user.role === UserRole.COMPANY) {
            throw new ForbiddenException('Cannot deactivate company admin');
        }

        const updatedUser = await this.prisma.user.update({
            where: { id },
            data: { isActive: false },
            include: { department: true, company: true },
        });

        // ============================================
        // SEND NOTIFICATIONS
        // ============================================

        // Notify the user
        await this.sendNotification(
            id,
            NotificationType.SYSTEM,
            'Account Deactivated',
            'Your account has been deactivated. Please contact your administrator for more information.',
            {
                deactivatedBy: currentUser.id,
                reason: 'Administrative action',
            }
        );

        // Notify user's department head if exists
        if (user.departmentId) {
            const department = await this.prisma.department.findUnique({
                where: { id: user.departmentId },
                include: { lead: { select: { id: true } } },
            });

            if (department?.lead && department.lead.id !== currentUser.id) {
                await this.sendNotification(
                    department.lead.id,
                    NotificationType.SYSTEM,
                    'Team Member Deactivated',
                    `${user.firstName} ${user.lastName} from your department has been deactivated.`,
                    {
                        userId: id,
                        userName: `${user.firstName} ${user.lastName}`,
                        departmentId: department.id,
                        departmentName: department.name,
                    }
                );
            }
        }

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId: currentUser.companyId,
                userId: currentUser.id,
                activityType: 'USER_ROLE_CHANGED',
                description: `Deactivated user ${user.firstName} ${user.lastName}`,
                metadata: {
                    targetUserId: id,
                    action: 'deactivate',
                },
            },
        });

        return updatedUser;
    }

    // ============================================
    // ACTIVATE USER
    // ============================================
    async activate(id: string, currentUser: User): Promise<User> {
        if (currentUser.role !== UserRole.COMPANY) {
            throw new ForbiddenException('Only company admin can activate users');
        }

        const user = await this.prisma.user.findFirst({
            where: { id, companyId: currentUser.companyId },
            include: { department: true },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const updatedUser = await this.prisma.user.update({
            where: { id },
            data: { isActive: true },
            include: { department: true, company: true },
        });

        // ============================================
        // SEND NOTIFICATIONS
        // ============================================

        // Notify the user
        await this.sendNotification(
            id,
            NotificationType.SYSTEM,
            'Account Activated',
            'Your account has been activated. You can now access the platform.',
            {
                activatedBy: currentUser.id,
            }
        );

        // Notify user's department head if exists
        if (user.departmentId) {
            const department = await this.prisma.department.findUnique({
                where: { id: user.departmentId },
                include: { lead: { select: { id: true } } },
            });

            if (department?.lead && department.lead.id !== currentUser.id) {
                await this.sendNotification(
                    department.lead.id,
                    NotificationType.SYSTEM,
                    'Team Member Activated',
                    `${user.firstName} ${user.lastName} has been activated and can now work in your department.`,
                    {
                        userId: id,
                        userName: `${user.firstName} ${user.lastName}`,
                        departmentId: department.id,
                        departmentName: department.name,
                    }
                );
            }
        }

        // Log activity
        await this.prisma.activityLog.create({
            data: {
                companyId: currentUser.companyId,
                userId: currentUser.id,
                activityType: 'USER_ROLE_CHANGED',
                description: `Activated user ${user.firstName} ${user.lastName}`,
                metadata: {
                    targetUserId: id,
                    action: 'activate',
                },
            },
        });

        return updatedUser;
    }

    // ============================================
    // GET LEADERBOARD
    // ============================================
    async getLeaderboard(companyId: string): Promise<User[]> {
        return this.prisma.user.findMany({
            where: { companyId, isActive: true },
            orderBy: { points: 'desc' },
            take: 50,
            include: {
                department: {
                    select: { id: true, name: true, tag: true },
                },
            },
        });
    }

    // ============================================
    // Helper: Check if role change is a promotion
    // ============================================
    private isRolePromotion(oldRole: UserRole, newRole: UserRole): boolean {
        const roleHierarchy: Record<UserRole, number> = {
            [UserRole.USER]: 1,
            [UserRole.QC_ADMIN]: 2,
            [UserRole.COMPANY]: 3,
            [UserRole.SUPER_ADMIN]: 4,
        };

        return roleHierarchy[newRole] > roleHierarchy[oldRole];
    }
}