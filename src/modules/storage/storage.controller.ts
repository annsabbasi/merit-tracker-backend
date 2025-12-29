// src/modules/storage/storage.controller.ts
import {
    Controller,
    Post,
    Delete,
    Body,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    UploadedFiles,
    BadRequestException,
    Param,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/guards';
import { StorageService, UploadResult } from './storage.service';

@ApiTags('storage')
@Controller('storage')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StorageController {
    constructor(private readonly storageService: StorageService) { }

    @Post('upload')
    @ApiOperation({ summary: 'Upload a single file' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
                folder: {
                    type: 'string',
                    description: 'Folder to upload to (default: sops)',
                },
            },
        },
    })
    @UseInterceptors(
        FileInterceptor('file', {
            limits: {
                fileSize: 100 * 1024 * 1024, // 100MB
            },
        })
    )
    async uploadFile(
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser('companyId') companyId: string,
        @Body('folder') folder?: string
    ): Promise<UploadResult> {
        if (!file) {
            throw new BadRequestException('No file provided');
        }

        return this.storageService.uploadFile(file, companyId, folder || 'sops');
    }

    @Post('upload/multiple')
    @ApiOperation({ summary: 'Upload multiple files' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                files: {
                    type: 'array',
                    items: {
                        type: 'string',
                        format: 'binary',
                    },
                },
                folder: {
                    type: 'string',
                    description: 'Folder to upload to (default: sops)',
                },
            },
        },
    })
    @UseInterceptors(
        FilesInterceptor('files', 10, {
            limits: {
                fileSize: 100 * 1024 * 1024, // 100MB per file
            },
        })
    )
    async uploadMultipleFiles(
        @UploadedFiles() files: Express.Multer.File[],
        @CurrentUser('companyId') companyId: string,
        @Body('folder') folder?: string
    ): Promise<UploadResult[]> {
        if (!files || files.length === 0) {
            throw new BadRequestException('No files provided');
        }

        return this.storageService.uploadMultipleFiles(files, companyId, folder || 'sops');
    }

    @Post('upload/sop')
    @ApiOperation({ summary: 'Upload SOP file with optional thumbnail' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
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
            },
        },
    })
    @UseInterceptors(
        FilesInterceptor('files', 2, {
            limits: {
                fileSize: 100 * 1024 * 1024,
            },
        })
    )
    async uploadSopFiles(
        @UploadedFiles() files: Express.Multer.File[],
        @CurrentUser('companyId') companyId: string
    ): Promise<{
        file: UploadResult;
        thumbnail?: UploadResult;
        detectedType: 'VIDEO' | 'IMAGE' | 'PDF' | 'DOCUMENT';
    }> {
        if (!files || files.length === 0) {
            throw new BadRequestException('No file provided');
        }

        // First file is always the main file
        const mainFile = files[0];
        const thumbnailFile = files.length > 1 ? files[1] : undefined;

        // Upload main file
        const fileResult = await this.storageService.uploadFile(mainFile, companyId, 'sops');

        // Detect file type
        const detectedType = this.storageService.getFileCategory(mainFile.mimetype);

        // Upload thumbnail if provided
        let thumbnailResult: UploadResult | undefined;
        if (thumbnailFile) {
            thumbnailResult = await this.storageService.uploadFile(
                thumbnailFile,
                companyId,
                'sops/thumbnails'
            );
        }

        return {
            file: fileResult,
            thumbnail: thumbnailResult,
            detectedType,
        };
    }

    @Delete('delete')
    @ApiOperation({ summary: 'Delete a file from storage' })
    async deleteFile(@Body('filePath') filePath: string): Promise<{ message: string }> {
        if (!filePath) {
            throw new BadRequestException('File path is required');
        }

        await this.storageService.deleteFile(filePath);
        return { message: 'File deleted successfully' };
    }

    @Delete('delete/multiple')
    @ApiOperation({ summary: 'Delete multiple files from storage' })
    async deleteMultipleFiles(@Body('filePaths') filePaths: string[]): Promise<{ message: string }> {
        if (!filePaths || filePaths.length === 0) {
            throw new BadRequestException('File paths are required');
        }

        await this.storageService.deleteMultipleFiles(filePaths);
        return { message: 'Files deleted successfully' };
    }
}
