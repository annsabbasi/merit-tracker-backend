// src/modules/email/email.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailTemplateService } from './email-template.service';

@Global()
@Module({
    imports: [ConfigModule],
    providers: [EmailService, EmailTemplateService],
    exports: [EmailService, EmailTemplateService],
})
export class EmailModule { }