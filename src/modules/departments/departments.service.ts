// src/modules/departments/departments.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from '../../entities/department.entity';
import { User, UserRole } from '../../entities/user.entity';
import { CreateDepartmentDto, UpdateDepartmentDto, AssignUsersDto } from './dto/departments.dto';
import { In } from 'typeorm';

@Injectable()
export class DepartmentsService {
    constructor(
        @InjectRepository(Department)
        private departmentsRepository: Repository<Department>,
        @InjectRepository(User)
        private usersRepository: Repository<User>,
    ) { }

    async create(createDto: CreateDepartmentDto, currentUser: User): Promise<Department> {
        if (currentUser.role === UserRole.USER) {
            throw new ForbiddenException('Insufficient permissions to create department');
        }

        const department = this.departmentsRepository.create({
            ...createDto,
            companyId: currentUser.companyId,
        });

        return this.departmentsRepository.save(department);
    }

    async findAll(companyId: string): Promise<Department[]> {
        return this.departmentsRepository.find({
            where: { companyId },
            relations: ['lead', 'users'],
            order: { createdAt: 'DESC' },
        });
    }

    async findOne(id: string, companyId: string): Promise<Department> {
        const department = await this.departmentsRepository.findOne({
            where: { id, companyId },
            relations: ['lead', 'users'],
        });

        if (!department) {
            throw new NotFoundException('Department not found');
        }

        return department;
    }

    async update(id: string, updateDto: UpdateDepartmentDto, currentUser: User): Promise<Department> {
        if (currentUser.role === UserRole.USER) {
            throw new ForbiddenException('Insufficient permissions to update department');
        }

        const department = await this.findOne(id, currentUser.companyId);
        Object.assign(department, updateDto);
        return this.departmentsRepository.save(department);
    }

    async assignUsers(id: string, assignDto: AssignUsersDto, currentUser: User): Promise<Department> {
        if (currentUser.role === UserRole.USER) {
            throw new ForbiddenException('Insufficient permissions to assign users');
        }

        const department = await this.findOne(id, currentUser.companyId);

        // Update users with new department
        await this.usersRepository.update(
            { id: In(assignDto.userIds), companyId: currentUser.companyId },
            { departmentId: department.id },
        );

        return this.findOne(id, currentUser.companyId);
    }

    async delete(id: string, currentUser: User): Promise<void> {
        if (currentUser.role !== UserRole.COMPANY_ADMIN) {
            throw new ForbiddenException('Only company admin can delete departments');
        }

        const department = await this.findOne(id, currentUser.companyId);

        // Remove department from users
        await this.usersRepository.update(
            { departmentId: department.id },
            { departmentId: '' },
        );

        await this.departmentsRepository.remove(department);
    }
}