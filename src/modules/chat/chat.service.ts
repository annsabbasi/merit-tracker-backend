// src/modules/chat/chat.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { CreateChatRoomDto, UpdateChatRoomDto, AddChatMembersDto, RemoveChatMembersDto, SendMessageDto, UpdateMessageDto, ChatQueryDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
    constructor(private prisma: PrismaService) { }

    async createRoom(dto: CreateChatRoomDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const project = await this.prisma.project.findFirst({ where: { id: dto.projectId, companyId }, include: { members: true } });
        if (!project) throw new NotFoundException('Project not found');
        const isMember = project.members.some((m) => m.userId === currentUserId);
        const isProjectLead = project.projectLeadId === currentUserId;
        const isAdmin = currentUserRole !== UserRole.USER;
        if (!isMember && !isProjectLead && !isAdmin) throw new ForbiddenException('You must be a project member');
        const { memberIds, ...roomData } = dto;
        return this.prisma.$transaction(async (prisma) => {
            const room = await prisma.chatRoom.create({ data: { ...roomData, createdById: currentUserId } });
            await prisma.chatRoomMember.create({ data: { chatRoomId: room.id, userId: currentUserId, isQcAdmin: currentUserRole !== UserRole.USER } });
            if (memberIds?.length) {
                const validMemberIds = memberIds.filter((id) => id !== currentUserId && (project.members.some((m) => m.userId === id) || project.projectLeadId === id));
                if (validMemberIds.length) await prisma.chatRoomMember.createMany({ data: validMemberIds.map((userId) => ({ chatRoomId: room.id, userId })), skipDuplicates: true });
            }
            return this.findRoom(room.id, companyId);
        });
    }

    async findAllRooms(companyId: string, query?: ChatQueryDto) {
        const where: any = { project: { companyId }, isActive: true };
        if (query?.projectId) where.projectId = query.projectId;
        if (query?.search) where.OR = [{ name: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }];
        return this.prisma.chatRoom.findMany({ where, include: { project: { select: { id: true, name: true } }, createdBy: { select: { id: true, firstName: true, lastName: true } }, members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } }, _count: { select: { members: true, messages: true } } }, orderBy: { updatedAt: 'desc' } });
    }

    async findUserRooms(userId: string, companyId: string) {
        return this.prisma.chatRoom.findMany({ where: { project: { companyId }, isActive: true, members: { some: { userId } } }, include: { project: { select: { id: true, name: true } }, members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } }, messages: { take: 1, orderBy: { createdAt: 'desc' }, select: { content: true, createdAt: true, sender: { select: { firstName: true, lastName: true } } } }, _count: { select: { members: true, messages: true } } }, orderBy: { updatedAt: 'desc' } });
    }

    async findRoom(id: string, companyId: string) {
        const room = await this.prisma.chatRoom.findFirst({ where: { id, project: { companyId } }, include: { project: { select: { id: true, name: true } }, createdBy: { select: { id: true, firstName: true, lastName: true } }, members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, role: true } } } } } });
        if (!room) throw new NotFoundException('Chat room not found');
        return room;
    }

    async updateRoom(id: string, dto: UpdateChatRoomDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const room = await this.findRoom(id, companyId);
        if (!this.canManageRoom(currentUserId, currentUserRole, room)) throw new ForbiddenException('Insufficient permissions');
        return this.prisma.chatRoom.update({ where: { id }, data: dto, include: { project: { select: { id: true, name: true } }, members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } } } });
    }

    async addMembers(id: string, dto: AddChatMembersDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const room = await this.findRoom(id, companyId);
        if (!this.canManageRoom(currentUserId, currentUserRole, room)) throw new ForbiddenException('Insufficient permissions');
        const project = await this.prisma.project.findUnique({ where: { id: room.projectId }, include: { members: true } });
        const validUserIds = dto.userIds.filter((userId) => project?.members.some((m) => m.userId === userId) || project?.projectLeadId === userId);
        if (!validUserIds.length) throw new BadRequestException('No valid project members');
        await this.prisma.chatRoomMember.createMany({ data: validUserIds.map((userId) => ({ chatRoomId: id, userId })), skipDuplicates: true });
        return this.findRoom(id, companyId);
    }

    async removeMembers(id: string, dto: RemoveChatMembersDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const room = await this.findRoom(id, companyId);
        if (!this.canManageRoom(currentUserId, currentUserRole, room)) throw new ForbiddenException('Insufficient permissions');
        if (dto.userIds.includes(room.createdById)) throw new BadRequestException('Cannot remove room creator');
        await this.prisma.chatRoomMember.deleteMany({ where: { chatRoomId: id, userId: { in: dto.userIds } } });
        return this.findRoom(id, companyId);
    }

    async deleteRoom(id: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const room = await this.findRoom(id, companyId);
        if (room.createdById !== currentUserId && currentUserRole !== UserRole.COMPANY) throw new ForbiddenException('Only room creator or company admin can delete');
        await this.prisma.chatRoom.delete({ where: { id } });
        return { message: 'Chat room deleted' };
    }

    async sendMessage(roomId: string, dto: SendMessageDto, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const room = await this.findRoom(roomId, companyId);
        const isMember = room.members.some((m) => m.userId === currentUserId);
        if (!isMember && currentUserRole === UserRole.USER) throw new ForbiddenException('You must be a room member');
        const message = await this.prisma.chatMessage.create({ data: { chatRoomId: roomId, senderId: currentUserId, content: dto.content }, include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } } });
        await this.prisma.chatRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } });
        return message;
    }

    async getMessages(roomId: string, currentUserId: string, currentUserRole: UserRole, companyId: string, limit = 50, before?: string) {
        const room = await this.findRoom(roomId, companyId);
        const isMember = room.members.some((m) => m.userId === currentUserId);
        if (!isMember && currentUserRole === UserRole.USER) throw new ForbiddenException('You must be a room member');
        const where: any = { chatRoomId: roomId, isDeleted: false };
        if (before) where.createdAt = { lt: new Date(before) };
        return this.prisma.chatMessage.findMany({ where, include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } }, orderBy: { createdAt: 'desc' }, take: limit });
    }

    async updateMessage(messageId: string, dto: UpdateMessageDto, currentUserId: string, companyId: string) {
        const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId }, include: { chatRoom: { include: { project: true } } } });
        if (!message) throw new NotFoundException('Message not found');
        if (message.chatRoom.project.companyId !== companyId) throw new ForbiddenException('Access denied');
        if (message.senderId !== currentUserId) throw new ForbiddenException('You can only edit your own messages');
        return this.prisma.chatMessage.update({ where: { id: messageId }, data: { content: dto.content, isEdited: true }, include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } } });
    }

    async deleteMessage(messageId: string, currentUserId: string, currentUserRole: UserRole, companyId: string) {
        const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId }, include: { chatRoom: { include: { project: true } } } });
        if (!message) throw new NotFoundException('Message not found');
        if (message.chatRoom.project.companyId !== companyId) throw new ForbiddenException('Access denied');
        if (message.senderId !== currentUserId && currentUserRole === UserRole.USER) throw new ForbiddenException('You can only delete your own messages');
        await this.prisma.chatMessage.update({ where: { id: messageId }, data: { isDeleted: true } });
        return { message: 'Message deleted' };
    }

    private canManageRoom(userId: string, userRole: UserRole, room: any): boolean {
        if (userRole === UserRole.COMPANY || userRole === UserRole.QC_ADMIN) return true;
        if (room.createdById === userId) return true;
        const member = room.members?.find((m: any) => m.userId === userId);
        return member && member.isQcAdmin;
    }
}