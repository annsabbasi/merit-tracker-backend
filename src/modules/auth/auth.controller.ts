// src/modules/auth/auth.controller.ts
import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterCompanyDto, RegisterUserDto, LoginDto } from './dto/auth.dto';
// import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, SkipSubscriptionCheck } from './guards';
// import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('')
@Controller('')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    @SkipSubscriptionCheck()
    @ApiOperation({ summary: 'Login user' })
    async login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @Post('register/company')
    @SkipSubscriptionCheck()
    @ApiOperation({ summary: 'Register new company with admin user' })
    async registerCompany(@Body() registerDto: RegisterCompanyDto) {
        return this.authService.registerCompany(registerDto);
    }

    @Post('register/user')
    @SkipSubscriptionCheck()
    @ApiOperation({ summary: 'Register new user to existing company' })
    async registerUser(@Body() registerDto: RegisterUserDto) {
        return this.authService.registerUser(registerDto);
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    @SkipSubscriptionCheck()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get current authenticated user' })
    async getMe(@CurrentUser('id') userId: string) {
        return this.authService.getProfile(userId);
    }

    @Get('subscription-status')
    @UseGuards(JwtAuthGuard)
    @SkipSubscriptionCheck()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get company subscription status' })
    async getSubscriptionStatus(@CurrentUser('companyId') companyId: string) {
        return this.authService.getSubscriptionStatus(companyId);
    }
}