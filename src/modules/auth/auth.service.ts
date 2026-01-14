// src/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterCompanyDto, RegisterUserDto, LoginDto } from './dto/auth.dto';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import { EmailService } from '../email/email.service'; // ADD THIS

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private emailService: EmailService, // ADD THIS
    ) { }

    async validateUser(email: string, password: string): Promise<any> {
        const user = await this.prisma.user.findUnique({
            where: { email },
            include: { company: true },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('Account is inactive');
        }

        if (!user.company.isActive) {
            throw new UnauthorizedException('Company account is inactive');
        }

        const { password: _, ...result } = user;
        return result;
    }

    async login(loginDto: LoginDto) {
        const user = await this.validateUser(loginDto.email, loginDto.password);

        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            companyId: user.companyId,
        };

        const subscriptionStatus = await this.getSubscriptionStatus(user.companyId);

        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                companyId: user.companyId,
                avatar: user.avatar,
                points: user.points,
            },
            company: {
                id: user.company.id,
                name: user.company.name,
                logo: user.company.logo,
                companyCode: user.company.companyCode,
            },
            subscription: subscriptionStatus,
        };
    }

    async registerCompany(registerDto: RegisterCompanyDto) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: registerDto.email },
        });
        if (existingUser) {
            throw new ConflictException('Email already exists');
        }

        const existingCompany = await this.prisma.company.findUnique({
            where: { name: registerDto.companyName },
        });
        if (existingCompany) {
            throw new ConflictException('Company name already exists');
        }

        const companyCode = await this.generateUniqueCompanyCode();
        const hashedPassword = await bcrypt.hash(registerDto.password, 10);

        const result = await this.prisma.$transaction(async (prisma) => {
            const company = await prisma.company.create({
                data: {
                    name: registerDto.companyName,
                    companyCode,
                    subscriptionStatus: SubscriptionStatus.TRIAL,
                    trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
                    isActive: true,
                },
            });

            const user = await prisma.user.create({
                data: {
                    email: registerDto.email,
                    password: hashedPassword,
                    firstName: registerDto.firstName,
                    lastName: registerDto.lastName,
                    role: UserRole.COMPANY,
                    companyId: company.id,
                    isActive: true,
                    phone: registerDto.phone,
                },
            });

            return { company, user };
        });

        // 🔥 SEND WELCOME EMAIL TO COMPANY ADMIN
        try {
            await this.emailService.sendWelcomeCompanyEmail(
                result.user.email,
                result.user.firstName,
                result.company.name,
                result.company.companyCode,
            );
        } catch (error) {
            // Log error but don't fail registration
            console.error('Failed to send welcome email:', error);
        }

        // Get the login response
        const loginResponse = await this.login({
            email: result.user.email,
            password: registerDto.password
        });

        return {
            ...loginResponse,
            companyCode: result.company.companyCode
        };
    }

    async registerUser(registerDto: RegisterUserDto) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: registerDto.email },
        });
        if (existingUser) {
            throw new ConflictException('Email already exists');
        }

        const company = await this.prisma.company.findUnique({
            where: { companyCode: registerDto.companyCode },
        });
        if (!company) {
            throw new BadRequestException('Invalid company code');
        }

        if (!company.isActive) {
            throw new BadRequestException('Company is not active');
        }

        const now = new Date();
        const isSubscriptionValid = this.checkSubscriptionValid(company, now);

        if (!isSubscriptionValid) {
            throw new BadRequestException('Company subscription has expired. Please contact your administrator.');
        }

        const hashedPassword = await bcrypt.hash(registerDto.password, 10);

        const user = await this.prisma.user.create({
            data: {
                email: registerDto.email,
                password: hashedPassword,
                firstName: registerDto.firstName,
                lastName: registerDto.lastName,
                role: UserRole.USER,
                companyId: company.id,
                isActive: true,
                phone: registerDto.phone,
            },
        });

        // 🔥 SEND WELCOME EMAIL TO NEW USER
        try {
            await this.emailService.sendWelcomeUserEmail(
                user.email,
                user.firstName,
                company.name,
            );
        } catch (error) {
            console.error('Failed to send welcome email:', error);
        }

        return this.login({ email: registerDto.email, password: registerDto.password });
    }

    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                company: {
                    select: {
                        id: true,
                        name: true,
                        logo: true,
                        companyCode: true,
                        subscriptionStatus: true,
                        trialEndsAt: true,
                        subscriptionEndsAt: true,
                    },
                },
                department: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const { password: _, ...result } = user;
        return result;
    }

    async getSubscriptionStatus(companyId: string) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: {
                subscriptionStatus: true,
                trialEndsAt: true,
                subscriptionEndsAt: true,
                isActive: true,
            },
        });

        if (!company) {
            throw new NotFoundException('Company not found');
        }

        const now = new Date();
        const isValid = this.checkSubscriptionValid(company, now);

        let daysRemaining = 0;
        let message = '';

        switch (company.subscriptionStatus) {
            case SubscriptionStatus.TRIAL:
                if (company.trialEndsAt) {
                    daysRemaining = Math.max(0, Math.ceil((company.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
                    message = daysRemaining > 0
                        ? `Trial expires in ${daysRemaining} day(s)`
                        : 'Trial has expired';
                }
                break;
            case SubscriptionStatus.ACTIVE:
                if (company.subscriptionEndsAt) {
                    daysRemaining = Math.max(0, Math.ceil((company.subscriptionEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
                    message = `Subscription renews in ${daysRemaining} day(s)`;
                } else {
                    message = 'Active subscription';
                }
                break;
            case SubscriptionStatus.EXPIRED:
                message = 'Subscription has expired';
                break;
            case SubscriptionStatus.CANCELLED:
                message = 'Subscription has been cancelled';
                break;
        }

        return {
            status: company.subscriptionStatus,
            isValid,
            daysRemaining,
            message,
            trialEndsAt: company.trialEndsAt,
            subscriptionEndsAt: company.subscriptionEndsAt,
        };
    }

    private checkSubscriptionValid(company: any, now: Date): boolean {
        switch (company.subscriptionStatus) {
            case SubscriptionStatus.TRIAL:
                return company.trialEndsAt ? company.trialEndsAt > now : true;
            case SubscriptionStatus.ACTIVE:
                return company.subscriptionEndsAt ? company.subscriptionEndsAt > now : true;
            case SubscriptionStatus.EXPIRED:
            case SubscriptionStatus.CANCELLED:
                return false;
            default:
                return false;
        }
    }

    private async generateUniqueCompanyCode(): Promise<string> {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        let isUnique = false;

        while (!isUnique) {
            code = '';
            for (let i = 0; i < 8; i++) {
                code += characters.charAt(Math.floor(Math.random() * characters.length));
            }

            const existing = await this.prisma.company.findUnique({
                where: { companyCode: code },
            });

            if (!existing) {
                isUnique = true;
            }
        }

        return code;
    }
}