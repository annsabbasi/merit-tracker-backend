// src/modules/companies/dto/companies.dto.ts
import { IsString, IsOptional, IsUrl, IsBoolean, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCompanyDto {
    @ApiPropertyOptional({ description: 'Company name (can only be changed once)' })
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({ description: 'Company address' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    address?: string;

    @ApiPropertyOptional({ description: 'Company phone number' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;

    @ApiPropertyOptional({ description: 'Company website URL' })
    @IsOptional()
    @IsUrl()
    website?: string;

    @ApiPropertyOptional({ description: 'Enable/disable screen capture for company' })
    @IsOptional()
    @IsBoolean()
    screenCaptureEnabled?: boolean;
}

export class UpdateCompanyLogoDto {
    @ApiProperty({ description: 'Logo URL from storage upload' })
    @IsString()
    logo: string;
}

export class UpdateCompanyNameDto {
    @ApiProperty({ description: 'New company name (can only be set once after creation)' })
    @IsString()
    @MinLength(2)
    @MaxLength(100)
    name: string;
}

export class CompanyResponseDto {
    id: string;
    name: string;
    companyCode: string;
    logo: string | null;
    address: string | null;
    phone: string | null;
    website: string | null;
    subscriptionStatus: string;
    trialEndsAt: Date | null;
    subscriptionEndsAt: Date | null;
    isActive: boolean;
    screenCaptureEnabled: boolean;
    nameChangedAt: Date | null;
    canChangeName: boolean; // Helper field for frontend
    createdAt: Date;
    updatedAt: Date;
}