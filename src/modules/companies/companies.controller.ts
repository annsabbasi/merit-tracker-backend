// src/modules/companies/companies.controller.ts
import {
    Controller,
    Get,
    Put,
    Post,
    Delete,
    Body,
    Param,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    BadRequestException,
    Patch
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/guards';
import { UpdateCompanyDto, UpdateCompanyNameDto } from './dto/companies.dto';

@ApiTags('companies')
@Controller('companies')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CompaniesController {
    constructor(private readonly companiesService: CompaniesService) { }

    @Get('my-company')
    @ApiOperation({ summary: 'Get current user company' })
    async getMyCompany(@CurrentUser('companyId') companyId: string) {
        return this.companiesService.findOne(companyId);
    }

    @Get('my-company/stats')
    @ApiOperation({ summary: 'Get company statistics' })
    async getCompanyStats(@CurrentUser('companyId') companyId: string) {
        return this.companiesService.getCompanyStats(companyId);
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.COMPANY)
    @ApiOperation({ summary: 'Update company details (name can only be changed once)' })
    async update(
        @Param('id') id: string,
        @Body() updateDto: UpdateCompanyDto,
        @CurrentUser('role') currentUserRole: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        // Ensure user can only update their own company
        if (id !== companyId) {
            throw new BadRequestException('You can only update your own company');
        }
        return this.companiesService.update(id, updateDto, currentUserRole as UserRole);
    }

    @Patch(':id/name')
    @UseGuards(RolesGuard)
    @Roles(UserRole.COMPANY)
    @ApiOperation({ summary: 'Update company name (one-time only)' })
    async updateName(
        @Param('id') id: string,
        @Body() dto: UpdateCompanyNameDto,
        @CurrentUser('role') currentUserRole: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        if (id !== companyId) {
            throw new BadRequestException('You can only update your own company');
        }
        return this.companiesService.updateName(id, dto, currentUserRole as UserRole);
    }

    @Post(':id/logo')
    @UseGuards(RolesGuard)
    @Roles(UserRole.COMPANY)
    @ApiOperation({ summary: 'Upload or update company logo' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Logo image file (JPEG, PNG, WebP, SVG - max 5MB)',
                },
            },
        },
    })
    @UseInterceptors(
        FileInterceptor('file', {
            limits: {
                fileSize: 5 * 1024 * 1024, // 5MB
            },
            fileFilter: (req, file, callback) => {
                const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
                if (allowedMimes.includes(file.mimetype)) {
                    callback(null, true);
                } else {
                    callback(new BadRequestException('Only JPEG, PNG, WebP, and SVG images are allowed'), false);
                }
            },
        })
    )
    async uploadLogo(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser('role') currentUserRole: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        if (id !== companyId) {
            throw new BadRequestException('You can only update your own company');
        }
        if (!file) {
            throw new BadRequestException('Logo file is required');
        }
        return this.companiesService.updateLogo(id, file, currentUserRole as UserRole);
    }

    @Delete(':id/logo')
    @UseGuards(RolesGuard)
    @Roles(UserRole.COMPANY)
    @ApiOperation({ summary: 'Remove company logo' })
    async removeLogo(
        @Param('id') id: string,
        @CurrentUser('role') currentUserRole: string,
        @CurrentUser('companyId') companyId: string,
    ) {
        if (id !== companyId) {
            throw new BadRequestException('You can only update your own company');
        }
        return this.companiesService.removeLogo(id, currentUserRole as UserRole);
    }
}