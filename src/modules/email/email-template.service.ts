// src/modules/email/email-template.service.ts
import { Injectable } from '@nestjs/common';
import { EmailType, EmailContext } from './interfaces/email.interface';

@Injectable()
export class EmailTemplateService {
    private readonly brandColor = '#4F46E5'; // Indigo
    private readonly brandColorLight = '#EEF2FF';
    private readonly textColor = '#1F2937';
    private readonly mutedTextColor = '#6B7280';

    /**
     * Get email template by type
     */
    getTemplate(type: EmailType, context: EmailContext): { subject: string; html: string } {
        const templates: Record<EmailType, () => { subject: string; html: string }> = {
            // Auth
            [EmailType.WELCOME_COMPANY]: () => this.welcomeCompanyTemplate(context),
            [EmailType.WELCOME_USER]: () => this.welcomeUserTemplate(context),
            [EmailType.PASSWORD_RESET]: () => this.passwordResetTemplate(context),
            [EmailType.EMAIL_VERIFICATION]: () => this.emailVerificationTemplate(context),

            // Projects
            [EmailType.PROJECT_CREATED]: () => this.projectCreatedTemplate(context),
            [EmailType.PROJECT_ASSIGNMENT]: () => this.projectAssignmentTemplate(context),
            [EmailType.PROJECT_LEAD_ASSIGNMENT]: () => this.projectLeadAssignmentTemplate(context),
            [EmailType.PROJECT_STATUS_CHANGED]: () => this.projectStatusChangedTemplate(context),
            [EmailType.PROJECT_DELETED]: () => this.projectDeletedTemplate(context),

            // SubProjects
            [EmailType.SUBPROJECT_CREATED]: () => this.subProjectCreatedTemplate(context),
            [EmailType.SUBPROJECT_ASSIGNMENT]: () => this.subProjectAssignmentTemplate(context),
            [EmailType.SUBPROJECT_QC_HEAD_ASSIGNMENT]: () => this.qcHeadAssignmentTemplate(context),
            [EmailType.SUBPROJECT_STATUS_CHANGED]: () => this.subProjectStatusChangedTemplate(context),

            // Tasks
            [EmailType.TASK_CREATED]: () => this.taskCreatedTemplate(context),
            [EmailType.TASK_ASSIGNMENT]: () => this.taskAssignmentTemplate(context),
            [EmailType.TASK_COMPLETED]: () => this.taskCompletedTemplate(context),
            [EmailType.TASK_REASSIGNED]: () => this.taskReassignedTemplate(context),

            // Departments
            [EmailType.DEPARTMENT_ASSIGNMENT]: () => this.departmentAssignmentTemplate(context),
            [EmailType.DEPARTMENT_HEAD_ASSIGNMENT]: () => this.departmentHeadAssignmentTemplate(context),
            [EmailType.DEPARTMENT_REMOVED]: () => this.departmentRemovedTemplate(context),

            // SOPs
            [EmailType.SOP_PENDING_APPROVAL]: () => this.sopPendingApprovalTemplate(context),
            [EmailType.SOP_APPROVED]: () => this.sopApprovedTemplate(context),
            [EmailType.SOP_REJECTED]: () => this.sopRejectedTemplate(context),
            [EmailType.SOP_RESUBMITTED]: () => this.sopResubmittedTemplate(context),

            // User Management
            [EmailType.ROLE_CHANGED]: () => this.roleChangedTemplate(context),
            [EmailType.ACCOUNT_ACTIVATED]: () => this.accountActivatedTemplate(context),
            [EmailType.ACCOUNT_DEACTIVATED]: () => this.accountDeactivatedTemplate(context),

            // Desktop Agent
            [EmailType.AGENT_INSTALLED]: () => this.agentInstalledTemplate(context),
            [EmailType.AGENT_OFFLINE_WARNING]: () => this.agentOfflineWarningTemplate(context),

            // Achievements
            [EmailType.ACHIEVEMENT_EARNED]: () => this.achievementEarnedTemplate(context),
            [EmailType.MILESTONE_REACHED]: () => this.milestoneReachedTemplate(context),
            [EmailType.STREAK_MILESTONE]: () => this.streakMilestoneTemplate(context),

            // Subscription
            [EmailType.TRIAL_ENDING_SOON]: () => this.trialEndingSoonTemplate(context),
            [EmailType.TRIAL_EXPIRED]: () => this.trialExpiredTemplate(context),
            [EmailType.SUBSCRIPTION_EXPIRED]: () => this.subscriptionExpiredTemplate(context),
        };

        return templates[type]();
    }

    // ============================================
    // BASE TEMPLATE WRAPPER
    // ============================================

    private wrapInBaseTemplate(content: string, context: EmailContext): string {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Merit Tracker</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, ${this.brandColor} 0%, #7C3AED 100%); padding: 30px 40px; border-radius: 12px 12px 0 0;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                                            📊 Merit Tracker
                                        </h1>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            ${content}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 30px 40px; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="text-align: center;">
                                        <p style="margin: 0 0 10px 0; color: ${this.mutedTextColor}; font-size: 14px;">
                                            This email was sent by Merit Tracker
                                        </p>
                                        <p style="margin: 0 0 10px 0; color: ${this.mutedTextColor}; font-size: 12px;">
                                            Need help? Contact us at 
                                            <a href="mailto:${context.supportEmail}" style="color: ${this.brandColor}; text-decoration: none;">${context.supportEmail}</a>
                                        </p>
                                        <p style="margin: 0; color: ${this.mutedTextColor}; font-size: 12px;">
                                            © ${context.year} Merit Tracker. All rights reserved.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
    }

    private createButton(text: string, url: string, primary: boolean = true): string {
        const bgColor = primary ? this.brandColor : '#ffffff';
        const textColor = primary ? '#ffffff' : this.brandColor;
        const border = primary ? 'none' : `2px solid ${this.brandColor}`;

        return `
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 25px 0;">
                <tr>
                    <td style="background-color: ${bgColor}; border-radius: 8px; border: ${border};">
                        <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; color: ${textColor}; text-decoration: none; font-weight: 600; font-size: 16px;">
                            ${text}
                        </a>
                    </td>
                </tr>
            </table>`;
    }

    private createInfoBox(title: string, content: string, icon: string = '📌'): string {
        return `
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${this.brandColorLight}; border-radius: 8px; margin: 20px 0;">
                <tr>
                    <td style="padding: 20px;">
                        <p style="margin: 0 0 8px 0; font-size: 14px; color: ${this.brandColor}; font-weight: 600;">
                            ${icon} ${title}
                        </p>
                        <p style="margin: 0; color: ${this.textColor}; font-size: 15px;">
                            ${content}
                        </p>
                    </td>
                </tr>
            </table>`;
    }

    private createSuccessBox(content: string): string {
        return `
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ECFDF5; border-radius: 8px; border-left: 4px solid #10B981; margin: 20px 0;">
                <tr>
                    <td style="padding: 20px;">
                        <p style="margin: 0; color: #065F46; font-size: 15px;">
                            ✅ ${content}
                        </p>
                    </td>
                </tr>
            </table>`;
    }

    private createWarningBox(content: string): string {
        return `
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #FEF3C7; border-radius: 8px; border-left: 4px solid #F59E0B; margin: 20px 0;">
                <tr>
                    <td style="padding: 20px;">
                        <p style="margin: 0; color: #92400E; font-size: 15px;">
                            ⚠️ ${content}
                        </p>
                    </td>
                </tr>
            </table>`;
    }

    // ============================================
    // AUTH TEMPLATES
    // ============================================

    private welcomeCompanyTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Welcome to Merit Tracker, ${ctx.recipientName}! 🎉
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Thank you for registering <strong>${ctx.companyName}</strong> with Merit Tracker. Your account is now ready to use!
            </p>
            
            ${this.createInfoBox('Your Company Code', `Share this code with your team members to join: <strong style="font-size: 18px; letter-spacing: 2px;">${ctx.companyCode}</strong>`, '🔑')}
            
            <p style="margin: 20px 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Here's what you can do next:
            </p>
            <ul style="margin: 0 0 20px 0; padding-left: 20px; color: ${this.textColor}; font-size: 15px; line-height: 1.8;">
                <li>Set up your company profile and logo</li>
                <li>Create departments to organize your team</li>
                <li>Invite team members using your company code</li>
                <li>Create your first project</li>
                <li>Install the Desktop Agent for time tracking</li>
            </ul>
            
            ${this.createButton('Go to Dashboard', ctx.dashboardUrl)}
            
            <p style="margin: 20px 0 0 0; color: ${this.mutedTextColor}; font-size: 14px;">
                Your 3-day trial has started. Explore all features and see how Merit Tracker can boost your team's productivity!
            </p>`;

        return {
            subject: `Welcome to Merit Tracker, ${ctx.recipientName}! Your account is ready`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private welcomeUserTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Welcome to ${ctx.companyName}! 🎉
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, your Merit Tracker account has been created successfully. You're now part of the <strong>${ctx.companyName}</strong> team!
            </p>
            
            <p style="margin: 20px 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Getting started is easy:
            </p>
            <ul style="margin: 0 0 20px 0; padding-left: 20px; color: ${this.textColor}; font-size: 15px; line-height: 1.8;">
                <li>Log in to your account</li>
                <li>Complete your profile</li>
                <li>Check your assigned projects and tasks</li>
                <li>Install the Desktop Agent for time tracking</li>
            </ul>
            
            ${this.createButton('Login to Merit Tracker', ctx.loginUrl)}
            
            <p style="margin: 20px 0 0 0; color: ${this.mutedTextColor}; font-size: 14px;">
                If you have any questions, reach out to your company administrator.
            </p>`;

        return {
            subject: `Welcome to ${ctx.companyName} - Your Merit Tracker account is ready`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private passwordResetTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Reset Your Password
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, we received a request to reset your password. Click the button below to create a new password.
            </p>
            
            ${this.createButton('Reset Password', ctx.resetUrl)}
            
            ${this.createWarningBox('This link will expire in 1 hour. If you didn\'t request this, please ignore this email.')}
            
            <p style="margin: 20px 0 0 0; color: ${this.mutedTextColor}; font-size: 14px;">
                If the button doesn't work, copy and paste this link: ${ctx.resetUrl}
            </p>`;

        return {
            subject: 'Reset your Merit Tracker password',
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private emailVerificationTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Verify Your Email
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, please verify your email address by clicking the button below.
            </p>
            
            ${this.createButton('Verify Email', ctx.verifyUrl)}`;

        return {
            subject: 'Verify your Merit Tracker email',
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    // ============================================
    // PROJECT TEMPLATES
    // ============================================

    private projectCreatedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                New Project Created 📁
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, a new project has been created in your department.
            </p>
            
            ${this.createInfoBox('Project Details', `
                <strong>Name:</strong> ${ctx.projectName}<br>
                <strong>Department:</strong> ${ctx.departmentName}<br>
                <strong>Created by:</strong> ${ctx.createdBy}
            `, '📋')}
            
            ${this.createButton('View Project', ctx.projectUrl)}`;

        return {
            subject: `New Project Created: ${ctx.projectName}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private projectAssignmentTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                You've Been Added to a Project! 🎯
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, you have been assigned to a new project.
            </p>
            
            ${this.createInfoBox('Project Details', `
                <strong>Project:</strong> ${ctx.projectName}<br>
                <strong>Department:</strong> ${ctx.departmentName}<br>
                <strong>Your Role:</strong> ${ctx.role}<br>
                <strong>Assigned by:</strong> ${ctx.assignedBy}
            `, '📋')}
            
            ${this.createButton('View Project', ctx.projectUrl)}
            
            <p style="margin: 20px 0 0 0; color: ${this.mutedTextColor}; font-size: 14px;">
                Log in to see your tasks and start contributing to the project.
            </p>`;

        return {
            subject: `You've been added to project: ${ctx.projectName}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private projectLeadAssignmentTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                You're Now a Project Lead! 🌟
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Congratulations ${ctx.recipientName}! You have been assigned as the lead for a project.
            </p>
            
            ${this.createInfoBox('Your New Responsibilities', `
                <strong>Project:</strong> ${ctx.projectName}<br>
                <strong>Department:</strong> ${ctx.departmentName}
            `, '👑')}
            
            <p style="margin: 20px 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                As project lead, you can:
            </p>
            <ul style="margin: 0 0 20px 0; padding-left: 20px; color: ${this.textColor}; font-size: 15px; line-height: 1.8;">
                <li>Manage project members</li>
                <li>Create and assign subprojects</li>
                <li>Track team progress</li>
                <li>Update project status</li>
            </ul>
            
            ${this.createButton('Go to Project', ctx.projectUrl)}`;

        return {
            subject: `You're now the lead of: ${ctx.projectName}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private projectStatusChangedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Project Status Updated 📊
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, the status of project <strong>${ctx.projectName}</strong> has been updated.
            </p>
            
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 20px 0;">
                <tr>
                    <td style="padding: 15px; background-color: #FEE2E2; border-radius: 8px 0 0 8px; text-align: center; width: 45%;">
                        <p style="margin: 0 0 5px 0; font-size: 12px; color: #991B1B;">PREVIOUS</p>
                        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #991B1B;">${ctx.oldStatus}</p>
                    </td>
                    <td style="padding: 15px; background-color: #f3f4f6; text-align: center; width: 10%;">
                        <span style="font-size: 20px;">→</span>
                    </td>
                    <td style="padding: 15px; background-color: #D1FAE5; border-radius: 0 8px 8px 0; text-align: center; width: 45%;">
                        <p style="margin: 0 0 5px 0; font-size: 12px; color: #065F46;">CURRENT</p>
                        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #065F46;">${ctx.newStatus}</p>
                    </td>
                </tr>
            </table>`;

        return {
            subject: `Project "${ctx.projectName}" status changed to ${ctx.newStatus}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private projectDeletedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Project Deleted
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, the project <strong>${ctx.projectName}</strong> has been deleted.
            </p>
            
            ${this.createWarningBox('All associated data, subprojects, and tasks have been removed.')}`;

        return {
            subject: `Project "${ctx.projectName}" has been deleted`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    // ============================================
    // SUBPROJECT TEMPLATES
    // ============================================

    private subProjectCreatedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                New Subproject Created 📝
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, a new subproject has been created in project <strong>${ctx.projectName}</strong>.
            </p>
            
            ${this.createInfoBox('Subproject Details', `
                <strong>Title:</strong> ${ctx.subProjectTitle}<br>
                <strong>Project:</strong> ${ctx.projectName}<br>
                <strong>Created by:</strong> ${ctx.createdBy}
            `, '📋')}
            
            ${this.createButton('View Subproject', ctx.subProjectUrl)}`;

        return {
            subject: `New Subproject: ${ctx.subProjectTitle}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private subProjectAssignmentTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                You've Been Added to a Subproject! 📌
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, you have been added to a subproject.
            </p>
            
            ${this.createInfoBox('Subproject Details', `
                <strong>Subproject:</strong> ${ctx.subProjectTitle}<br>
                <strong>Project:</strong> ${ctx.projectName}
            `, '📋')}
            
            ${this.createButton('View Subproject', ctx.subProjectUrl)}`;

        return {
            subject: `Added to subproject: ${ctx.subProjectTitle}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private qcHeadAssignmentTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                You're Now a QC Head! 🎖️
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Congratulations ${ctx.recipientName}! You have been assigned as the QC Head for a subproject.
            </p>
            
            ${this.createInfoBox('Your Assignment', `
                <strong>Subproject:</strong> ${ctx.subProjectTitle}<br>
                <strong>Project:</strong> ${ctx.projectName}
            `, '👑')}
            
            <p style="margin: 20px 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                As QC Head, you're responsible for:
            </p>
            <ul style="margin: 0 0 20px 0; padding-left: 20px; color: ${this.textColor}; font-size: 15px; line-height: 1.8;">
                <li>Quality assurance oversight</li>
                <li>Reviewing task completions</li>
                <li>Managing subproject members</li>
            </ul>
            
            ${this.createButton('View Subproject', ctx.subProjectUrl)}`;

        return {
            subject: `You're QC Head of: ${ctx.subProjectTitle}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private subProjectStatusChangedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Subproject Status Updated
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, the status of <strong>${ctx.subProjectTitle}</strong> has been updated to <strong>${ctx.newStatus}</strong>.
            </p>`;

        return {
            subject: `Subproject "${ctx.subProjectTitle}" status: ${ctx.newStatus}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    // ============================================
    // TASK TEMPLATES
    // ============================================

    private taskCreatedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                New Task Created ✅
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, a new task has been created.
            </p>
            
            ${this.createInfoBox('Task Details', `
                <strong>Task:</strong> ${ctx.taskTitle}<br>
                <strong>Subproject:</strong> ${ctx.subProjectTitle}<br>
                <strong>Points:</strong> ${ctx.pointsValue} pts
                ${ctx.dueDate ? `<br><strong>Due:</strong> ${ctx.dueDate}` : ''}
            `, '📝')}
            
            ${this.createButton('View Task', ctx.taskUrl)}`;

        return {
            subject: `New Task: ${ctx.taskTitle}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private taskAssignmentTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                New Task Assigned to You! 📋
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, you have been assigned a new task.
            </p>
            
            ${this.createInfoBox('Task Details', `
                <strong>Task:</strong> ${ctx.taskTitle}<br>
                <strong>Subproject:</strong> ${ctx.subProjectTitle}<br>
                <strong>Project:</strong> ${ctx.projectName}<br>
                <strong>Points:</strong> 🏆 ${ctx.pointsValue} pts
                ${ctx.dueDate ? `<br><strong>Due:</strong> 📅 ${ctx.dueDate}` : ''}
                ${ctx.assignedBy ? `<br><strong>Assigned by:</strong> ${ctx.assignedBy}` : ''}
            `, '✅')}
            
            ${this.createButton('Start Working', ctx.taskUrl)}
            
            <p style="margin: 20px 0 0 0; color: ${this.mutedTextColor}; font-size: 14px;">
                Complete this task to earn ${ctx.pointsValue} points!
            </p>`;

        return {
            subject: `Task Assigned: ${ctx.taskTitle} (${ctx.pointsValue} pts)`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private taskCompletedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Task Completed! 🎉
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Congratulations ${ctx.recipientName}! You've completed a task.
            </p>
            
            ${this.createSuccessBox(`You earned <strong>${ctx.pointsEarned} points</strong> for completing "${ctx.taskTitle}"`)}
            
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${this.brandColorLight}; border-radius: 8px; margin: 20px 0;">
                <tr>
                    <td style="padding: 25px; text-align: center;">
                        <p style="margin: 0 0 5px 0; font-size: 14px; color: ${this.mutedTextColor};">Your Total Points</p>
                        <p style="margin: 0; font-size: 36px; font-weight: 700; color: ${this.brandColor};">🏆 ${ctx.totalPoints}</p>
                    </td>
                </tr>
            </table>
            
            <p style="margin: 20px 0 0 0; color: ${this.mutedTextColor}; font-size: 14px; text-align: center;">
                Keep up the great work! Check your dashboard for more tasks.
            </p>`;

        return {
            subject: `Task Completed: +${ctx.pointsEarned} points earned! 🎉`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private taskReassignedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Task Reassigned
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, the task <strong>${ctx.taskTitle}</strong> has been reassigned to ${ctx.newAssignee}.
            </p>`;

        return {
            subject: `Task "${ctx.taskTitle}" has been reassigned`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    // ============================================
    // DEPARTMENT TEMPLATES
    // ============================================

    private departmentAssignmentTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Department Assignment 🏢
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, you have been assigned to the <strong>${ctx.departmentName}</strong> department.
            </p>
            
            ${this.createSuccessBox(`Welcome to the ${ctx.departmentName} team!`)}`;

        return {
            subject: `You've been assigned to ${ctx.departmentName}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private departmentHeadAssignmentTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                You're Now Department Head! 👑
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Congratulations ${ctx.recipientName}! You have been assigned as the head of <strong>${ctx.departmentName}</strong>.
            </p>
            
            <p style="margin: 20px 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Your responsibilities include:
            </p>
            <ul style="margin: 0 0 20px 0; padding-left: 20px; color: ${this.textColor}; font-size: 15px; line-height: 1.8;">
                <li>Managing department members</li>
                <li>Overseeing department projects</li>
                <li>Tracking team performance</li>
            </ul>
            
            ${this.createButton('View Department', ctx.dashboardUrl)}`;

        return {
            subject: `You're now head of ${ctx.departmentName}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private departmentRemovedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Department Change
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, you have been removed from the <strong>${ctx.departmentName}</strong> department.
            </p>
            <p style="margin: 0; color: ${this.mutedTextColor}; font-size: 14px;">
                Contact your administrator for more information.
            </p>`;

        return {
            subject: `Removed from ${ctx.departmentName}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    // ============================================
    // SOP TEMPLATES
    // ============================================

    private sopPendingApprovalTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                SOP Pending Approval 📄
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                A new SOP has been submitted and requires your approval.
            </p>
            
            ${this.createInfoBox('SOP Details', `
                <strong>Title:</strong> ${ctx.sopTitle}<br>
                <strong>Type:</strong> ${ctx.sopType}<br>
                <strong>Submitted by:</strong> ${ctx.creatorName}
            `, '📝')}
            
            ${this.createButton('Review SOP', ctx.sopUrl)}`;

        return {
            subject: `SOP Pending Approval: ${ctx.sopTitle}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private sopApprovedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                SOP Approved! ✅
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Great news ${ctx.recipientName}! Your SOP has been approved.
            </p>
            
            ${this.createSuccessBox(`"${ctx.sopTitle}" is now available for all users to view.`)}
            
            ${this.createButton('View SOP', ctx.sopUrl)}`;

        return {
            subject: `Your SOP "${ctx.sopTitle}" has been approved! ✅`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private sopRejectedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                SOP Needs Revision
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, your SOP <strong>"${ctx.sopTitle}"</strong> has been reviewed and requires some changes.
            </p>
            
            ${this.createWarningBox(`<strong>Reason:</strong> ${ctx.rejectionReason}`)}
            
            <p style="margin: 20px 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Please update your SOP and resubmit for approval.
            </p>
            
            ${this.createButton('Edit SOP', ctx.sopUrl)}`;

        return {
            subject: `SOP "${ctx.sopTitle}" needs revision`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private sopResubmittedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                SOP Resubmitted for Approval 📄
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                An SOP has been updated and resubmitted for approval.
            </p>
            
            ${this.createInfoBox('SOP Details', `
                <strong>Title:</strong> ${ctx.sopTitle}<br>
                <strong>Resubmitted by:</strong> ${ctx.creatorName}
            `, '📝')}
            
            ${this.createButton('Review SOP', ctx.sopUrl)}`;

        return {
            subject: `SOP Resubmitted: ${ctx.sopTitle}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    // ============================================
    // USER MANAGEMENT TEMPLATES
    // ============================================

    private roleChangedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const emoji = ctx.isPromotion ? '🎉' : '📋';
        const title = ctx.isPromotion ? 'Congratulations on Your Promotion!' : 'Your Role Has Been Updated';

        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                ${title} ${emoji}
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, your role has been updated.
            </p>
            
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 20px 0;">
                <tr>
                    <td style="padding: 15px; background-color: #f3f4f6; border-radius: 8px 0 0 8px; text-align: center; width: 45%;">
                        <p style="margin: 0 0 5px 0; font-size: 12px; color: ${this.mutedTextColor};">PREVIOUS ROLE</p>
                        <p style="margin: 0; font-size: 16px; font-weight: 600; color: ${this.textColor};">${ctx.oldRole}</p>
                    </td>
                    <td style="padding: 15px; background-color: #f3f4f6; text-align: center; width: 10%;">
                        <span style="font-size: 20px;">→</span>
                    </td>
                    <td style="padding: 15px; background-color: ${ctx.isPromotion ? '#D1FAE5' : '#f3f4f6'}; border-radius: 0 8px 8px 0; text-align: center; width: 45%;">
                        <p style="margin: 0 0 5px 0; font-size: 12px; color: ${ctx.isPromotion ? '#065F46' : this.mutedTextColor};">NEW ROLE</p>
                        <p style="margin: 0; font-size: 16px; font-weight: 600; color: ${ctx.isPromotion ? '#065F46' : this.textColor};">${ctx.newRole}</p>
                    </td>
                </tr>
            </table>`;

        return {
            subject: ctx.isPromotion
                ? `🎉 Congratulations! You've been promoted to ${ctx.newRole}`
                : `Your role has been updated to ${ctx.newRole}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private accountActivatedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Account Activated! ✅
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, your account has been activated. You can now access Merit Tracker.
            </p>
            
            ${this.createSuccessBox('Your account is now active and ready to use.')}
            
            ${this.createButton('Login Now', ctx.loginUrl)}`;

        return {
            subject: 'Your Merit Tracker account has been activated',
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private accountDeactivatedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Account Deactivated
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, your Merit Tracker account has been deactivated.
            </p>
            
            ${this.createWarningBox('You will no longer be able to access the platform.')}
            
            <p style="margin: 20px 0 0 0; color: ${this.mutedTextColor}; font-size: 14px;">
                If you believe this was done in error, please contact your company administrator.
            </p>`;

        return {
            subject: 'Your Merit Tracker account has been deactivated',
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    // ============================================
    // ACHIEVEMENT TEMPLATES
    // ============================================

    private achievementEarnedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Achievement Unlocked! 🏆
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Congratulations ${ctx.recipientName}!
            </p>
            
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%); border-radius: 12px; margin: 20px 0;">
                <tr>
                    <td style="padding: 30px; text-align: center;">
                        <p style="margin: 0 0 10px 0; font-size: 48px;">🏆</p>
                        <p style="margin: 0 0 10px 0; font-size: 20px; font-weight: 700; color: #92400E;">${ctx.achievementTitle}</p>
                        <p style="margin: 0; font-size: 14px; color: #B45309;">${ctx.achievementDescription}</p>
                    </td>
                </tr>
            </table>
            
            <p style="margin: 20px 0 0 0; color: ${this.mutedTextColor}; font-size: 14px; text-align: center;">
                Keep up the amazing work! 💪
            </p>`;

        return {
            subject: `🏆 Achievement Unlocked: ${ctx.achievementTitle}`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private milestoneReachedTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Milestone Reached! 🎯
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Amazing work ${ctx.recipientName}! You've reached a major milestone.
            </p>
            
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${this.brandColorLight}; border-radius: 12px; margin: 20px 0;">
                <tr>
                    <td style="padding: 30px; text-align: center;">
                        <p style="margin: 0 0 5px 0; font-size: 14px; color: ${this.mutedTextColor};">${ctx.milestoneType}</p>
                        <p style="margin: 0; font-size: 48px; font-weight: 700; color: ${this.brandColor};">${ctx.milestoneValue}</p>
                    </td>
                </tr>
            </table>`;

        return {
            subject: `🎯 Milestone: ${ctx.milestoneValue} ${ctx.milestoneType}!`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private streakMilestoneTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Streak Milestone! 🔥
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Incredible ${ctx.recipientName}! You're on fire!
            </p>
            
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%); border-radius: 12px; margin: 20px 0;">
                <tr>
                    <td style="padding: 30px; text-align: center;">
                        <p style="margin: 0 0 10px 0; font-size: 48px;">🔥</p>
                        <p style="margin: 0 0 5px 0; font-size: 14px; color: #991B1B;">CURRENT STREAK</p>
                        <p style="margin: 0; font-size: 36px; font-weight: 700; color: #DC2626;">${ctx.streakDays} Days</p>
                    </td>
                </tr>
            </table>`;

        return {
            subject: `🔥 ${ctx.streakDays} Day Streak! Keep it going!`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    // ============================================
    // DESKTOP AGENT TEMPLATES
    // ============================================

    private agentInstalledTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Desktop Agent Installed! 💻
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, Merit Tracker Desktop has been installed successfully.
            </p>
            
            ${this.createInfoBox('Installation Details', `
                <strong>Machine:</strong> ${ctx.machineName}<br>
                <strong>Platform:</strong> ${ctx.platform}
            `, '💻')}
            
            <p style="margin: 20px 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                You can now:
            </p>
            <ul style="margin: 0 0 20px 0; padding-left: 20px; color: ${this.textColor}; font-size: 15px; line-height: 1.8;">
                <li>Track time with screen capture</li>
                <li>Sync your work across devices</li>
                <li>Work on projects requiring monitoring</li>
            </ul>`;

        return {
            subject: 'Merit Tracker Desktop installed successfully',
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private agentOfflineWarningTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Desktop Agent Offline ⚠️
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, your desktop agent appears to be offline.
            </p>
            
            ${this.createWarningBox('You may not be able to track time on projects that require screen capture.')}
            
            <p style="margin: 20px 0 0 0; color: ${this.mutedTextColor}; font-size: 14px;">
                Please ensure Merit Tracker Desktop is running if you need to track time.
            </p>`;

        return {
            subject: '⚠️ Your Merit Tracker Desktop agent is offline',
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    // ============================================
    // SUBSCRIPTION TEMPLATES
    // ============================================

    private trialEndingSoonTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Trial Ending Soon ⏰
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, your trial for <strong>${ctx.companyName}</strong> is ending soon.
            </p>
            
            ${this.createWarningBox(`You have <strong>${ctx.daysRemaining} days</strong> remaining in your trial.`)}
            
            <p style="margin: 20px 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Upgrade now to continue enjoying:
            </p>
            <ul style="margin: 0 0 20px 0; padding-left: 20px; color: ${this.textColor}; font-size: 15px; line-height: 1.8;">
                <li>Unlimited team members</li>
                <li>Advanced time tracking</li>
                <li>Screen capture features</li>
                <li>Performance analytics</li>
            </ul>
            
            ${this.createButton('Upgrade Now', ctx.upgradeUrl)}`;

        return {
            subject: `⏰ Your Merit Tracker trial ends in ${ctx.daysRemaining} days`,
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private trialExpiredTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Trial Expired
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, the trial period for <strong>${ctx.companyName}</strong> has ended.
            </p>
            
            ${this.createWarningBox('Your team\'s access to Merit Tracker features has been limited.')}
            
            <p style="margin: 20px 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Upgrade today to restore full access for your team.
            </p>
            
            ${this.createButton('View Plans', ctx.upgradeUrl)}`;

        return {
            subject: 'Your Merit Tracker trial has expired',
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }

    private subscriptionExpiredTemplate(ctx: EmailContext): { subject: string; html: string } {
        const content = `
            <h2 style="margin: 0 0 20px 0; color: ${this.textColor}; font-size: 24px;">
                Subscription Expired
            </h2>
            <p style="margin: 0 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Hi ${ctx.recipientName}, the subscription for <strong>${ctx.companyName}</strong> has expired.
            </p>
            
            ${this.createWarningBox('Your team\'s access to Merit Tracker has been limited.')}
            
            <p style="margin: 20px 0 15px 0; color: ${this.textColor}; font-size: 16px; line-height: 1.6;">
                Renew your subscription to continue tracking your team's productivity.
            </p>
            
            ${this.createButton('Renew Subscription', ctx.upgradeUrl)}`;

        return {
            subject: 'Your Merit Tracker subscription has expired',
            html: this.wrapInBaseTemplate(content, ctx),
        };
    }
}