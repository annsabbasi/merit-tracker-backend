// src/modules/email/email.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { EmailOptions, EmailType, EmailContext } from './interfaces/email.interface';
import { EmailTemplateService } from './email-template.service';

@Injectable()
export class EmailService implements OnModuleInit {
    private readonly logger = new Logger(EmailService.name);
    private transporter: Transporter;
    private readonly fromEmail: string;
    private readonly fromName: string;
    private readonly appUrl: string;
    private readonly supportEmail: string;
    private isEnabled: boolean = true;

    constructor(
        private readonly configService: ConfigService,
        private readonly templateService: EmailTemplateService,
    ) {
        this.fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL', 'noreply@merittracker.com');
        this.fromName = this.configService.get<string>('SMTP_FROM_NAME', 'Merit Tracker');
        this.appUrl = this.configService.get<string>('APP_URL', 'https://merittracker.com');
        this.supportEmail = this.configService.get<string>('SUPPORT_EMAIL', 'support@merittracker.com');
    }

    async onModuleInit() {
        await this.initializeTransporter();
    }

    private async initializeTransporter() {
        const host = this.configService.get<string>('SMTP_HOST');
        const port = this.configService.get<number>('SMTP_PORT', 587);
        // const port = this.configService.get<number>(587);
        const user = this.configService.get<string>('SMTP_USER');
        const pass = this.configService.get<string>('SMTP_PASS');
        const secure = this.configService.get<boolean>('SMTP_SECURE', false);

        if (!host || !user || !pass) {
            this.logger.warn('Email configuration incomplete. Email service disabled.');
            this.isEnabled = false;
            return;
        }

        try {
            this.transporter = nodemailer.createTransport({
                host,
                port,
                secure: false, // true for 465, false for other ports
                auth: {
                    user,
                    pass,
                },
                tls: {
                    rejectUnauthorized: false, // For development - remove in production
                },
            });

            // Verify connection
            await this.transporter.verify();
            this.logger.log('Email service initialized successfully');
            this.isEnabled = true;
        } catch (error) {
            this.logger.error('Failed to initialize email transporter:', error);
            this.isEnabled = false;
        }
    }

    /**
     * Send a raw email
     */
    async sendEmail(options: EmailOptions): Promise<boolean> {
        if (!this.isEnabled) {
            this.logger.warn('Email service is disabled. Skipping email send.');
            return false;
        }

        try {
            const mailOptions = {
                from: `"${this.fromName}" <${this.fromEmail}>`,
                to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
                subject: options.subject,
                html: options.html,
                text: options.text || this.stripHtml(options.html),
                cc: options.cc,
                bcc: options.bcc,
                attachments: options.attachments,
                replyTo: options.replyTo || this.supportEmail,
            };

            const result = await this.transporter.sendMail(mailOptions);
            this.logger.log(`Email sent successfully to ${options.to}: ${result.messageId}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to send email to ${options.to}:`, error);
            return false;
        }
    }

    /**
     * Send a templated email
     */
    async sendTemplatedEmail(
        type: EmailType,
        to: string | string[],
        context: EmailContext,
    ): Promise<boolean> {
        // Add default context values
        const fullContext: EmailContext = {
            year: new Date().getFullYear(),
            appUrl: this.appUrl,
            supportEmail: this.supportEmail,
            ...context,
        };

        const { subject, html } = this.templateService.getTemplate(type, fullContext);

        return this.sendEmail({
            to,
            subject,
            html,
        });
    }

    // ============================================
    // AUTH EMAILS
    // ============================================

    /**
     * Send welcome email to new company admin
     */
    async sendWelcomeCompanyEmail(
        email: string,
        firstName: string,
        companyName: string,
        companyCode: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.WELCOME_COMPANY, email, {
            recipientName: firstName,
            companyName,
            companyCode,
            loginUrl: `${this.appUrl}/login`,
            dashboardUrl: `${this.appUrl}/dashboard`,
        });
    }

    /**
     * Send welcome email to new user
     */
    async sendWelcomeUserEmail(
        email: string,
        firstName: string,
        companyName: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.WELCOME_USER, email, {
            recipientName: firstName,
            companyName,
            loginUrl: `${this.appUrl}/login`,
        });
    }

    // ============================================
    // PROJECT EMAILS
    // ============================================

    /**
     * Send project assignment email
     */
    async sendProjectAssignmentEmail(
        email: string,
        recipientName: string,
        projectName: string,
        departmentName: string,
        role: string,
        assignedBy: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.PROJECT_ASSIGNMENT, email, {
            recipientName,
            projectName,
            departmentName,
            role,
            assignedBy,
            projectUrl: `${this.appUrl}/projects`,
        });
    }

    /**
     * Send project lead assignment email
     */
    async sendProjectLeadAssignmentEmail(
        email: string,
        recipientName: string,
        projectName: string,
        departmentName: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.PROJECT_LEAD_ASSIGNMENT, email, {
            recipientName,
            projectName,
            departmentName,
            projectUrl: `${this.appUrl}/projects`,
        });
    }

    /**
     * Send project status change notification
     */
    async sendProjectStatusChangedEmail(
        email: string,
        recipientName: string,
        projectName: string,
        oldStatus: string,
        newStatus: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.PROJECT_STATUS_CHANGED, email, {
            recipientName,
            projectName,
            oldStatus: this.formatStatus(oldStatus),
            newStatus: this.formatStatus(newStatus),
        });
    }

    // ============================================
    // SUBPROJECT EMAILS
    // ============================================

    /**
     * Send subproject member added email
     */
    async sendSubProjectMemberAddedEmail(
        email: string,
        recipientName: string,
        subProjectTitle: string,
        projectName: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.SUBPROJECT_ASSIGNMENT, email, {
            recipientName,
            subProjectTitle,
            projectName,
            subProjectUrl: `${this.appUrl}/projects`,
        });
    }

    /**
     * Send QC Head assignment email
     */
    async sendQcHeadAssignmentEmail(
        email: string,
        recipientName: string,
        subProjectTitle: string,
        projectName: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.SUBPROJECT_QC_HEAD_ASSIGNMENT, email, {
            recipientName,
            subProjectTitle,
            projectName,
            subProjectUrl: `${this.appUrl}/projects`,
        });
    }

    // ============================================
    // TASK EMAILS
    // ============================================

    /**
     * Send task assignment email
     */
    async sendTaskAssignmentEmail(
        email: string,
        recipientName: string,
        taskTitle: string,
        subProjectTitle: string,
        projectName: string,
        pointsValue: number,
        dueDate?: Date,
        assignedBy?: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.TASK_ASSIGNMENT, email, {
            recipientName,
            taskTitle,
            subProjectTitle,
            projectName,
            pointsValue,
            dueDate: dueDate ? this.formatDate(dueDate) : null,
            assignedBy,
            taskUrl: `${this.appUrl}/tasks`,
        });
    }

    /**
     * Send task completed email
     */
    async sendTaskCompletedEmail(
        email: string,
        recipientName: string,
        taskTitle: string,
        pointsEarned: number,
        totalPoints: number,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.TASK_COMPLETED, email, {
            recipientName,
            taskTitle,
            pointsEarned,
            totalPoints,
        });
    }

    // ============================================
    // DEPARTMENT EMAILS
    // ============================================

    /**
     * Send department assignment email
     */
    async sendDepartmentAssignmentEmail(
        email: string,
        recipientName: string,
        departmentName: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.DEPARTMENT_ASSIGNMENT, email, {
            recipientName,
            departmentName,
        });
    }

    /**
     * Send department head assignment email
     */
    async sendDepartmentHeadAssignmentEmail(
        email: string,
        recipientName: string,
        departmentName: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.DEPARTMENT_HEAD_ASSIGNMENT, email, {
            recipientName,
            departmentName,
            dashboardUrl: `${this.appUrl}/departments`,
        });
    }

    // ============================================
    // SOP EMAILS
    // ============================================

    /**
     * Send SOP pending approval email to admins
     */
    async sendSopPendingApprovalEmail(
        emails: string[],
        sopTitle: string,
        sopType: string,
        creatorName: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.SOP_PENDING_APPROVAL, emails, {
            sopTitle,
            sopType,
            creatorName,
            sopUrl: `${this.appUrl}/sops/pending`,
        });
    }

    /**
     * Send SOP approved email
     */
    async sendSopApprovedEmail(
        email: string,
        recipientName: string,
        sopTitle: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.SOP_APPROVED, email, {
            recipientName,
            sopTitle,
            sopUrl: `${this.appUrl}/sops`,
        });
    }

    /**
     * Send SOP rejected email
     */
    async sendSopRejectedEmail(
        email: string,
        recipientName: string,
        sopTitle: string,
        rejectionReason: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.SOP_REJECTED, email, {
            recipientName,
            sopTitle,
            rejectionReason,
            sopUrl: `${this.appUrl}/sops`,
        });
    }

    // ============================================
    // USER MANAGEMENT EMAILS
    // ============================================

    /**
     * Send role change email
     */
    async sendRoleChangedEmail(
        email: string,
        recipientName: string,
        oldRole: string,
        newRole: string,
        isPromotion: boolean,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.ROLE_CHANGED, email, {
            recipientName,
            oldRole: this.formatRole(oldRole),
            newRole: this.formatRole(newRole),
            isPromotion,
        });
    }

    /**
     * Send account activated email
     */
    async sendAccountActivatedEmail(
        email: string,
        recipientName: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.ACCOUNT_ACTIVATED, email, {
            recipientName,
            loginUrl: `${this.appUrl}/login`,
        });
    }

    /**
     * Send account deactivated email
     */
    async sendAccountDeactivatedEmail(
        email: string,
        recipientName: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.ACCOUNT_DEACTIVATED, email, {
            recipientName,
        });
    }

    // ============================================
    // ACHIEVEMENT EMAILS
    // ============================================

    /**
     * Send achievement earned email
     */
    async sendAchievementEarnedEmail(
        email: string,
        recipientName: string,
        achievementTitle: string,
        achievementDescription: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.ACHIEVEMENT_EARNED, email, {
            recipientName,
            achievementTitle,
            achievementDescription,
        });
    }

    /**
     * Send milestone reached email
     */
    async sendMilestoneReachedEmail(
        email: string,
        recipientName: string,
        milestoneType: string,
        milestoneValue: number,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.MILESTONE_REACHED, email, {
            recipientName,
            milestoneType,
            milestoneValue,
        });
    }

    // ============================================
    // DESKTOP AGENT EMAILS
    // ============================================

    /**
     * Send desktop agent installed email
     */
    async sendAgentInstalledEmail(
        email: string,
        recipientName: string,
        machineName: string,
        platform: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.AGENT_INSTALLED, email, {
            recipientName,
            machineName,
            platform,
        });
    }

    // ============================================
    // SUBSCRIPTION EMAILS
    // ============================================

    /**
     * Send trial ending soon email
     */
    async sendTrialEndingSoonEmail(
        email: string,
        recipientName: string,
        companyName: string,
        daysRemaining: number,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.TRIAL_ENDING_SOON, email, {
            recipientName,
            companyName,
            daysRemaining,
            upgradeUrl: `${this.appUrl}/subscription`,
        });
    }

    /**
     * Send trial expired email
     */
    async sendTrialExpiredEmail(
        email: string,
        recipientName: string,
        companyName: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.TRIAL_EXPIRED, email, {
            recipientName,
            companyName,
            upgradeUrl: `${this.appUrl}/subscription`,
        });
    }

    // ============================================
    // BULK EMAIL METHODS
    // ============================================

    /**
     * Send email to multiple recipients with personalization
     */
    async sendBulkPersonalizedEmails(
        type: EmailType,
        recipients: Array<{ email: string; context: EmailContext }>,
    ): Promise<{ success: number; failed: number }> {
        let success = 0;
        let failed = 0;

        for (const recipient of recipients) {
            const result = await this.sendTemplatedEmail(type, recipient.email, recipient.context);
            if (result) {
                success++;
            } else {
                failed++;
            }
        }

        return { success, failed };
    }

    /**
    * Send subscription expired email
    */
    async sendSubscriptionExpiredEmail(
        email: string,
        recipientName: string,
        companyName: string,
    ): Promise<boolean> {
        return this.sendTemplatedEmail(EmailType.SUBSCRIPTION_EXPIRED, email, {
            recipientName,
            companyName,
            upgradeUrl: `${this.appUrl}/subscription`,
        });
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    private stripHtml(html: string): string {
        return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    private formatStatus(status: string): string {
        return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    }

    private formatRole(role: string): string {
        const roleMap: Record<string, string> = {
            USER: 'Team Member',
            QC_ADMIN: 'QC Administrator',
            COMPANY: 'Company Administrator',
            SUPER_ADMIN: 'Super Administrator',
        };
        return roleMap[role] || role;
    }

    private formatDate(date: Date): string {
        return new Date(date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    /**
     * Check if email service is enabled
     */
    isEmailEnabled(): boolean {
        return this.isEnabled;
    }
}