// src/prisma/prisma.service.ts
// Updated for Prisma 6/7+ with driver adapters

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);
    private pool: Pool;

    constructor() {
        // Create PostgreSQL connection pool
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            // Connection pool settings for production
            max: 20,                    // Maximum number of connections
            idleTimeoutMillis: 30000,   // Close idle connections after 30s
            connectionTimeoutMillis: 10000, // Timeout after 10s when connecting
        });

        // Create Prisma adapter
        const adapter = new PrismaPg(pool);

        // Initialize PrismaClient with adapter
        super({ adapter });

        this.pool = pool;
    }

    async onModuleInit() {
        try {
            await this.$connect();
            this.logger.log('Database connection established');
        } catch (error) {
            this.logger.error('Failed to connect to database', error);
            throw error;
        }
    }

    async onModuleDestroy() {
        await this.$disconnect();
        await this.pool.end();
        this.logger.log('Database connection closed');
    }

    // Utility method for health checks
    async isHealthy(): Promise<boolean> {
        try {
            await this.$queryRaw`SELECT 1`;
            return true;
        } catch {
            return false;
        }
    }

    // Utility method for transactions with automatic retry
    async executeInTransaction<T>(
        fn: (prisma: Omit<PrismaService, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>) => Promise<T>,
        maxRetries = 3,
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.$transaction(fn, {
                    maxWait: 5000,  // Max time to wait for transaction slot
                    timeout: 10000, // Max time for transaction to complete
                });
            } catch (error) {
                lastError = error as Error;
                this.logger.warn(`Transaction attempt ${attempt} failed: ${lastError.message}`);

                // Only retry on specific errors (deadlock, serialization failure)
                if (!this.isRetryableError(error)) {
                    throw error;
                }

                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
            }
        }

        throw lastError;
    }

    private isRetryableError(error: unknown): boolean {
        if (error instanceof Error) {
            // PostgreSQL error codes for retryable errors
            const retryableCodes = ['40001', '40P01']; // Serialization failure, deadlock
            return retryableCodes.some(code => error.message.includes(code));
        }
        return false;
    }
}