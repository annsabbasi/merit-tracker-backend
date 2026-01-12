// src/modules/auth/desktop-auth.controller.ts
import { Controller, Post, Body, Get, Query, Headers, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
// import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
// import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import { AuthService } from '../auth.service';
import { PrismaService } from 'src/prisma/prisma.service';

@ApiTags('desktop-auth')
@Controller('desktop-auth')
export class DesktopAuthController {
    private desktopTokens = new Map<string, { userId: string; companyId: string; expiresAt: Date }>();

    constructor(
        private readonly authService: AuthService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) {
        // Clean up expired tokens every hour
        setInterval(() => this.cleanupExpiredTokens(), 3600000);
    }

    /**
     * Generate a desktop auth session for Electron app
     */
    @Post('initiate')
    @ApiOperation({ summary: 'Initiate desktop authentication' })
    async initiateDesktopAuth(@Body() body: { email: string; password: string }) {
        try {
            // Validate credentials
            const user = await this.authService.validateUser(body.email, body.password);

            if (!user) {
                throw new Error('Invalid credentials');
            }

            // Generate a short-lived desktop token
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            // Store token with user info
            this.desktopTokens.set(token, {
                userId: user.id,
                companyId: user.companyId,
                expiresAt,
            });

            return {
                success: true,
                token,
                expiresAt,
            };
        } catch (error) {
            return {
                success: false,
                error: 'Invalid credentials',
            };
        }
    }

    /**
     * Exchange desktop token for JWT (used by Electron)
     */
    @Post('exchange')
    @ApiOperation({ summary: 'Exchange desktop token for JWT' })
    async exchangeToken(@Body() body: { token: string }) {
        const session = this.desktopTokens.get(body.token);

        if (!session) {
            return {
                success: false,
                error: 'Invalid or expired token',
            };
        }

        // Check if token expired
        if (new Date() > session.expiresAt) {
            this.desktopTokens.delete(body.token);
            return {
                success: false,
                error: 'Token expired',
            };
        }

        // Generate JWT
        const payload = {
            sub: session.userId,
            companyId: session.companyId,
            type: 'desktop-auth',
        };

        const jwtToken = this.jwtService.sign(payload, {
            secret: this.configService.get('JWT_SECRET'),
            expiresIn: '30d', // Longer expiry for desktop
        });

        // Clean up used token
        this.desktopTokens.delete(body.token);

        return {
            success: true,
            token: jwtToken,
            userId: session.userId,
            companyId: session.companyId,
        };
    }

    /**
     * Generate a one-time login URL (for QR code or deep link)
     */
    @Get('login-url')
    @ApiOperation({ summary: 'Generate one-time login URL' })
    async generateLoginUrl(@Query('userId') userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { company: true },
        });

        if (!user) {
            throw new Error('User not found');
        }

        // Generate one-time code
        const code = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Store code
        await this.prisma.oneTimeCode.create({
            data: {
                code,
                userId: user.id,
                type: 'DESKTOP_AUTH',
                expiresAt,
                metadata: {
                    platform: 'desktop',
                },
            },
        });

        // Return deep link URL
        return {
            url: `merittracker://auth?code=${code}`,
            qrData: `merittracker://auth?code=${code}`,
            code,
            expiresAt,
        };
    }

    /**
     * Verify one-time code (used by Electron)
     */
    @Post('verify-code')
    @ApiOperation({ summary: 'Verify one-time code' })
    async verifyCode(@Body() body: { code: string }) {
        const oneTimeCode = await this.prisma.oneTimeCode.findUnique({
            where: { code: body.code },
            include: { user: true },
        });

        if (!oneTimeCode) {
            return {
                success: false,
                error: 'Invalid code',
            };
        }

        if (oneTimeCode.expiresAt < new Date()) {
            await this.prisma.oneTimeCode.delete({ where: { code: body.code } });
            return {
                success: false,
                error: 'Code expired',
            };
        }

        if (oneTimeCode.type !== 'DESKTOP_AUTH') {
            return {
                success: false,
                error: 'Invalid code type',
            };
        }

        // Generate JWT
        const payload = {
            sub: oneTimeCode.userId,
            companyId: oneTimeCode.user.companyId,
            type: 'desktop-auth',
        };

        const jwtToken = this.jwtService.sign(payload, {
            secret: this.configService.get('JWT_SECRET'),
            expiresIn: '30d',
        });

        // Delete used code
        await this.prisma.oneTimeCode.delete({ where: { code: body.code } });

        return {
            success: true,
            token: jwtToken,
            userId: oneTimeCode.userId,
            companyId: oneTimeCode.user.companyId,
        };
    }

    /**
     * Health check endpoint for Electron
     */
    @Get('health')
    @HttpCode(200)
    @ApiExcludeEndpoint()
    healthCheck() {
        return { status: 'ok', timestamp: new Date().toISOString() };
    }

    /**
     * Clean up expired desktop tokens
     */
    private cleanupExpiredTokens() {
        const now = new Date();
        for (const [token, session] of this.desktopTokens.entries()) {
            if (session.expiresAt < now) {
                this.desktopTokens.delete(token);
            }
        }
    }
}