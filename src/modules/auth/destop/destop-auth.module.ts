import { Module } from '@nestjs/common';
// import { DesktopAuthController } from './desktop-auth.controller';
// import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DesktopAuthController } from './destop-auth.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from '../auth.service';
// import { PrismaService } from '../../prisma/prisma.service';

@Module({
    imports: [
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get('JWT_SECRET'),
                signOptions: {
                    expiresIn: configService.get('JWT_EXPIRATION') || '7d',
                },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [DesktopAuthController],
    providers: [AuthService, PrismaService],
    exports: [],
})
export class DesktopAuthModule { }