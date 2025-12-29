// src/modules/storage/storage.service.ts
import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

export interface UploadResult {
    url: string;
    path: string;
    bucket: string;
    fileName: string;
    originalName: string;
    mimeType: string;
    size: number;
}

export interface FileValidationOptions {
    maxSizeMB?: number;
    allowedMimeTypes?: string[];
}

@Injectable()
export class StorageService {
    private supabase: SupabaseClient;
    private bucketName: string;

    // Default allowed file types
    private readonly DEFAULT_ALLOWED_TYPES = {
        image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
        video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
        document: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
        ],
    };

    // All allowed types combined
    private readonly ALL_ALLOWED_TYPES = [
        ...this.DEFAULT_ALLOWED_TYPES.image,
        ...this.DEFAULT_ALLOWED_TYPES.video,
        ...this.DEFAULT_ALLOWED_TYPES.document,
    ];

    constructor(private configService: ConfigService) {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
        }

        this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        this.bucketName = this.configService.get<string>('SUPABASE_STORAGE_BUCKET') || 'sops';
    }

    /**
     * Initialize the storage bucket if it doesn't exist
     */
    async initializeBucket(): Promise<void> {
        try {
            const { data: buckets } = await this.supabase.storage.listBuckets();
            const bucketExists = buckets?.some(b => b.name === this.bucketName);

            if (!bucketExists) {
                const { error } = await this.supabase.storage.createBucket(this.bucketName, {
                    public: true,
                    fileSizeLimit: 100 * 1024 * 1024, // 100MB limit
                    allowedMimeTypes: this.ALL_ALLOWED_TYPES,
                });

                if (error) {
                    console.error('Failed to create bucket:', error);
                }
            }
        } catch (error) {
            console.error('Error initializing bucket:', error);
        }
    }

    /**
     * Upload a file to Supabase Storage
     */
    async uploadFile(
        file: Express.Multer.File,
        companyId: string,
        folder: string = 'sops',
        options?: FileValidationOptions
    ): Promise<UploadResult> {
        // Validate file
        this.validateFile(file, options);

        // Generate unique filename
        const fileExt = path.extname(file.originalname);
        const fileName = `${uuidv4()}${fileExt}`;
        const filePath = `${companyId}/${folder}/${fileName}`;

        // Upload to Supabase
        const { data, error } = await this.supabase.storage
            .from(this.bucketName)
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            });

        if (error) {
            console.error('Supabase upload error:', error);
            throw new InternalServerErrorException('Failed to upload file to storage');
        }

        // Get public URL
        const { data: urlData } = this.supabase.storage
            .from(this.bucketName)
            .getPublicUrl(filePath);

        return {
            url: urlData.publicUrl,
            path: filePath,
            bucket: this.bucketName,
            fileName,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
        };
    }

    /**
     * Upload multiple files
     */
    async uploadMultipleFiles(
        files: Express.Multer.File[],
        companyId: string,
        folder: string = 'sops',
        options?: FileValidationOptions
    ): Promise<UploadResult[]> {
        const results: UploadResult[] = [];

        for (const file of files) {
            const result = await this.uploadFile(file, companyId, folder, options);
            results.push(result);
        }

        return results;
    }

    /**
     * Delete a file from storage
     */
    async deleteFile(filePath: string): Promise<void> {
        const { error } = await this.supabase.storage
            .from(this.bucketName)
            .remove([filePath]);

        if (error) {
            console.error('Failed to delete file:', error);
            throw new InternalServerErrorException('Failed to delete file from storage');
        }
    }

    /**
     * Delete multiple files
     */
    async deleteMultipleFiles(filePaths: string[]): Promise<void> {
        if (filePaths.length === 0) return;

        const { error } = await this.supabase.storage
            .from(this.bucketName)
            .remove(filePaths);

        if (error) {
            console.error('Failed to delete files:', error);
            throw new InternalServerErrorException('Failed to delete files from storage');
        }
    }

    /**
     * Get a signed URL for private files (if bucket is private)
     */
    async getSignedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
        const { data, error } = await this.supabase.storage
            .from(this.bucketName)
            .createSignedUrl(filePath, expiresIn);

        if (error) {
            throw new InternalServerErrorException('Failed to generate signed URL');
        }

        return data.signedUrl;
    }

    /**
     * Generate thumbnail for video (returns placeholder - actual implementation would use FFmpeg)
     */
    async generateVideoThumbnail(videoUrl: string): Promise<string | null> {
        // In production, you would use FFmpeg or a service like Cloudinary
        // For now, return null and let frontend handle video thumbnail
        return null;
    }

    /**
     * Get file type category from mime type
     */
    getFileCategory(mimeType: string): 'VIDEO' | 'IMAGE' | 'PDF' | 'DOCUMENT' {
        if (mimeType.startsWith('video/')) return 'VIDEO';
        if (mimeType.startsWith('image/')) return 'IMAGE';
        if (mimeType === 'application/pdf') return 'PDF';
        return 'DOCUMENT';
    }

    /**
     * Validate file against options
     */
    private validateFile(file: Express.Multer.File, options?: FileValidationOptions): void {
        const maxSizeMB = options?.maxSizeMB || 100; // Default 100MB
        const allowedTypes = options?.allowedMimeTypes || this.ALL_ALLOWED_TYPES;

        // Check file size
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        if (file.size > maxSizeBytes) {
            throw new BadRequestException(`File size exceeds maximum allowed size of ${maxSizeMB}MB`);
        }

        // Check mime type
        if (!allowedTypes.includes(file.mimetype)) {
            throw new BadRequestException(
                `File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
            );
        }
    }

    /**
     * Extract file path from URL
     */
    extractPathFromUrl(url: string): string | null {
        try {
            const urlObj = new URL(url);
            const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)/);
            return pathMatch ? pathMatch[1] : null;
        } catch {
            return null;
        }
    }
}