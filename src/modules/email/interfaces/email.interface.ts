// src/modules/email/interfaces/email.interface.ts

export interface EmailOptions {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    cc?: string | string[];
    bcc?: string | string[];
    attachments?: EmailAttachment[];
    replyTo?: string;
}

export interface EmailAttachment {
    filename: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
}

export interface EmailContext {
    // Common fields
    recipientName?: string;
    companyName?: string;
    companyLogo?: string;
    year?: number;
    supportEmail?: string;
    appUrl?: string;

    // Specific context fields
    [key: string]: any;
}

export enum EmailType {
    // Auth emails
    WELCOME_COMPANY = 'welcome_company',
    WELCOME_USER = 'welcome_user',
    PASSWORD_RESET = 'password_reset',
    EMAIL_VERIFICATION = 'email_verification',

    // Project emails
    PROJECT_CREATED = 'project_created',
    PROJECT_ASSIGNMENT = 'project_assignment',
    PROJECT_LEAD_ASSIGNMENT = 'project_lead_assignment',
    PROJECT_STATUS_CHANGED = 'project_status_changed',
    PROJECT_DELETED = 'project_deleted',

    // SubProject emails
    SUBPROJECT_CREATED = 'subproject_created',
    SUBPROJECT_ASSIGNMENT = 'subproject_assignment',
    SUBPROJECT_QC_HEAD_ASSIGNMENT = 'subproject_qc_head_assignment',
    SUBPROJECT_STATUS_CHANGED = 'subproject_status_changed',

    // Task emails
    TASK_CREATED = 'task_created',
    TASK_ASSIGNMENT = 'task_assignment',
    TASK_COMPLETED = 'task_completed',
    TASK_REASSIGNED = 'task_reassigned',

    // Department emails
    DEPARTMENT_ASSIGNMENT = 'department_assignment',
    DEPARTMENT_HEAD_ASSIGNMENT = 'department_head_assignment',
    DEPARTMENT_REMOVED = 'department_removed',

    // SOP emails
    SOP_PENDING_APPROVAL = 'sop_pending_approval',
    SOP_APPROVED = 'sop_approved',
    SOP_REJECTED = 'sop_rejected',
    SOP_RESUBMITTED = 'sop_resubmitted',

    // User management emails
    ROLE_CHANGED = 'role_changed',
    ACCOUNT_ACTIVATED = 'account_activated',
    ACCOUNT_DEACTIVATED = 'account_deactivated',

    // Desktop agent emails
    AGENT_INSTALLED = 'agent_installed',
    AGENT_OFFLINE_WARNING = 'agent_offline_warning',

    // Achievement emails
    ACHIEVEMENT_EARNED = 'achievement_earned',
    MILESTONE_REACHED = 'milestone_reached',
    STREAK_MILESTONE = 'streak_milestone',

    // Subscription emails
    TRIAL_ENDING_SOON = 'trial_ending_soon',
    TRIAL_EXPIRED = 'trial_expired',
    SUBSCRIPTION_EXPIRED = 'subscription_expired',
}