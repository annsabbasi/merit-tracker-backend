// src/modules/sops/sops.controller.ts
import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Patch,
    UseInterceptors,
    UploadedFile,
    UploadedFiles,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { SopsService } from './sops.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CreateSopDto, UpdateSopDto, ApproveSopDto, RejectSopDto, SopQueryDto } from './dto/sops.dto';
import { CurrentUser, Roles } from '../auth/guards';

@ApiTags('sops')
@Controller('sops')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SopsController {
    constructor(private readonly sopsService: SopsService) { }

    // ============================================
    // CREATE WITH URL (existing endpoint)
    // ============================================
    @Post()
    @ApiOperation({ summary: 'Create a new SOP with URL' })
    async create(
        @Body() createDto: CreateSopDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.sopsService.create(createDto, userId, companyId);
    }

    // ============================================
    // CREATE WITH FILE UPLOAD (new endpoint)
    // ============================================
    @Post('upload')
    @ApiOperation({ summary: 'Create a new SOP by uploading a file' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['file', 'title'],
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Main SOP file (video, image, pdf, document)',
                },
                thumbnail: {
                    type: 'string',
                    format: 'binary',
                    description: 'Optional thumbnail image',
                },
                title: {
                    type: 'string',
                    description: 'SOP title',
                },
                description: {
                    type: 'string',
                    description: 'SOP description',
                },
                duration: {
                    type: 'number',
                    description: 'Duration in seconds (for videos)',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags for categorization',
                },
            },
        },
    })
    @UseInterceptors(
        FileFieldsInterceptor(
            [
                { name: 'file', maxCount: 1 },
                { name: 'thumbnail', maxCount: 1 },
            ],
            {
                limits: {
                    fileSize: 100 * 1024 * 1024, // 100MB
                },
            }
        )
    )
    async createWithUpload(
        @UploadedFiles()
        files: {
            file?: Express.Multer.File[];
            thumbnail?: Express.Multer.File[];
        },
        @Body() body: { title: string; description?: string; duration?: string; tags?: string | string[] },
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string
    ) {
        if (!files.file || files.file.length === 0) {
            throw new BadRequestException('File is required');
        }

        if (!body.title?.trim()) {
            throw new BadRequestException('Title is required');
        }

        const mainFile = files.file[0];
        const thumbnailFile = files.thumbnail?.[0];

        // Parse tags if it's a string (from form-data)
        let tags: string[] = [];
        if (body.tags) {
            if (typeof body.tags === 'string') {
                try {
                    tags = JSON.parse(body.tags);
                } catch {
                    tags = body.tags.split(',').map(t => t.trim()).filter(Boolean);
                }
            } else {
                tags = body.tags;
            }
        }

        return this.sopsService.createWithFile(
            mainFile,
            thumbnailFile,
            {
                title: body.title.trim(),
                description: body.description?.trim(),
                duration: body.duration ? parseInt(body.duration) : undefined,
                tags: tags.length > 0 ? tags : undefined,
            },
            userId,
            companyId
        );
    }

    // ============================================
    // GET ALL
    // ============================================
    @Get()
    @ApiOperation({ summary: 'Get all SOPs' })
    async findAll(
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string,
        @Query() query: SopQueryDto
    ) {
        // Regular users only see approved SOPs
        return role === UserRole.USER
            ? this.sopsService.findApproved(companyId, query)
            : this.sopsService.findAll(companyId, query);
    }

    // ============================================
    // GET APPROVED
    // ============================================
    @Get('approved')
    @ApiOperation({ summary: 'Get all approved SOPs' })
    async findApproved(
        @CurrentUser('companyId') companyId: string,
        @Query() query: SopQueryDto
    ) {
        return this.sopsService.findApproved(companyId, query);
    }

    // ============================================
    // GET PENDING (admin only)
    // ============================================
    @Get('pending')
    @UseGuards(RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Get all pending SOPs' })
    async findPending(@CurrentUser('companyId') companyId: string) {
        return this.sopsService.findPendingApproval(companyId);
    }

    // ============================================
    // GET STATS (admin only)
    // ============================================
    @Get('stats')
    @UseGuards(RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Get SOP statistics' })
    async getStats(@CurrentUser('companyId') companyId: string) {
        return this.sopsService.getStats(companyId);
    }

    // ============================================
    // GET MY SOPs
    // ============================================
    @Get('my-sops')
    @ApiOperation({ summary: 'Get current user\'s SOPs' })
    async findMySops(
        @CurrentUser('id') userId: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.sopsService.findUserSops(userId, companyId);
    }

    // ============================================
    // GET ONE
    // ============================================
    @Get(':id')
    @ApiOperation({ summary: 'Get SOP by ID' })
    async findOne(
        @Param('id') id: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.sopsService.findOne(id, companyId);
    }

    // ============================================
    // UPDATE
    // ============================================
    @Put(':id')
    @ApiOperation({ summary: 'Update SOP' })
    async update(
        @Param('id') id: string,
        @Body() updateDto: UpdateSopDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.sopsService.update(id, updateDto, userId, role as UserRole, companyId);
    }

    // ============================================
    // APPROVE (admin only)
    // ============================================
    @Patch(':id/approve')
    @UseGuards(RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Approve SOP' })
    async approve(
        @Param('id') id: string,
        @Body() dto: ApproveSopDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.sopsService.approve(id, dto, userId, role as UserRole, companyId);
    }

    // ============================================
    // REJECT (admin only)
    // ============================================
    @Patch(':id/reject')
    @UseGuards(RolesGuard)
    @Roles(UserRole.QC_ADMIN, UserRole.COMPANY_ADMIN)
    @ApiOperation({ summary: 'Reject SOP' })
    async reject(
        @Param('id') id: string,
        @Body() dto: RejectSopDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.sopsService.reject(id, dto, userId, role as UserRole, companyId);
    }

    // ============================================
    // INCREMENT VIEW COUNT
    // ============================================
    @Patch(':id/view')
    @ApiOperation({ summary: 'Increment view count' })
    async incrementView(
        @Param('id') id: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.sopsService.incrementViewCount(id, companyId);
    }

    // ============================================
    // DELETE
    // ============================================
    @Delete(':id')
    @ApiOperation({ summary: 'Delete SOP' })
    async delete(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') role: string,
        @CurrentUser('companyId') companyId: string
    ) {
        return this.sopsService.delete(id, userId, role as UserRole, companyId);
    }
}