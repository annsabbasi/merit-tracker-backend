// src/modules/chat/chat.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatRoom } from '../../entities/chat-room.entity';
import { ChatRoomMember } from '../../entities/chat-room-member.entity';
import { ChatMessage } from '../../entities/chat-message.entity';
import { Project } from '../../entities/project.entity';
import { User, UserRole } from '../../entities/user.entity';
import { CreateChatRoomDto, AddMemberDto, SendMessageDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
    constructor(
        @InjectRepository(ChatRoom)
        private chatRoomRepository: Repository<ChatRoom>,
        @InjectRepository(ChatRoomMember)
        private chatRoomMemberRepository: Repository<ChatRoomMember>,
        @InjectRepository(ChatMessage)
        private chatMessageRepository: Repository<ChatMessage>,
        @InjectRepository(Project)
        private projectRepository: Repository<Project>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) { }

    async createRoom(createDto: CreateChatRoomDto, currentUser: User): Promise<ChatRoom> {
        const project = await this.projectRepository.findOne({
            where: { id: createDto.projectId, companyId: currentUser.companyId },
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        // Check if at least one QC Admin is being added
        const members = await this.userRepository.findByIds(createDto.memberIds);
        const hasQcAdmin = members.some(
            member => member.role === UserRole.QC_ADMIN || member.role === UserRole.COMPANY_ADMIN
        );

        if (!hasQcAdmin) {
            throw new BadRequestException('Chat room must have at least one QC Admin');
        }

        const chatRoom = this.chatRoomRepository.create({
            name: createDto.name,
            description: createDto.description,
            projectId: createDto.projectId,
            createdById: currentUser.id,
        });

        const savedRoom = await this.chatRoomRepository.save(chatRoom);

        // Add members
        for (const userId of createDto.memberIds) {
            const user = members.find(m => m.id === userId);
            const member = this.chatRoomMemberRepository.create({
                chatRoomId: savedRoom.id,
                userId,
                isQcAdmin: user?.role === UserRole.QC_ADMIN || user?.role === UserRole.COMPANY_ADMIN,
            });
            await this.chatRoomMemberRepository.save(member);
        }

        return this.findOne(savedRoom.id, currentUser.companyId);
    }

    async findAll(projectId: string, companyId: string): Promise<ChatRoom[]> {
        const project = await this.projectRepository.findOne({
            where: { id: projectId, companyId },
        });

        if (!project) {
            throw new NotFoundException('Project not found');
        }

        return this.chatRoomRepository.find({
            where: { projectId },
            relations: ['createdBy', 'members', 'members.user'],
            order: { createdAt: 'DESC' },
        });
    }

    async findOne(id: string, companyId: string): Promise<ChatRoom> {
        const chatRoom = await this.chatRoomRepository.findOne({
            where: { id },
            relations: ['project', 'createdBy', 'members', 'members.user'],
        });

        if (!chatRoom) {
            throw new NotFoundException('Chat room not found');
        }

        if (chatRoom.project.companyId !== companyId) {
            throw new ForbiddenException('Access denied');
        }

        return chatRoom;
    }

    async addMember(roomId: string, addDto: AddMemberDto, currentUser: User): Promise<ChatRoomMember> {
        const chatRoom = await this.findOne(roomId, currentUser.companyId);

        // Check if user exists and is in same company
        const user = await this.userRepository.findOne({
            where: { id: addDto.userId, companyId: currentUser.companyId },
        });

        if (!user) {
            throw new BadRequestException('User not found');
        }

        // Check if already a member
        const existing = await this.chatRoomMemberRepository.findOne({
            where: { chatRoomId: roomId, userId: addDto.userId },
        });

        if (existing) {
            throw new BadRequestException('User is already a member');
        }

        const member = this.chatRoomMemberRepository.create({
            chatRoomId: roomId,
            userId: addDto.userId,
            isQcAdmin: user.role === UserRole.QC_ADMIN || user.role === UserRole.COMPANY_ADMIN,
        });

        return this.chatRoomMemberRepository.save(member);
    }

    async sendMessage(roomId: string, messageDto: SendMessageDto, currentUser: User): Promise<ChatMessage> {
        const chatRoom = await this.findOne(roomId, currentUser.companyId);

        // Check if user is a member
        const membership = await this.chatRoomMemberRepository.findOne({
            where: { chatRoomId: roomId, userId: currentUser.id },
        });

        if (!membership) {
            throw new ForbiddenException('You are not a member of this chat room');
        }

        const message = this.chatMessageRepository.create({
            chatRoomId: roomId,
            senderId: currentUser.id,
            content: messageDto.content,
        });

        return this.chatMessageRepository.save(message);
    }

    async getMessages(roomId: string, currentUser: User, limit: number = 50): Promise<ChatMessage[]> {
        const chatRoom = await this.findOne(roomId, currentUser.companyId);

        // Check if user is a member
        const membership = await this.chatRoomMemberRepository.findOne({
            where: { chatRoomId: roomId, userId: currentUser.id },
        });

        if (!membership) {
            throw new ForbiddenException('You are not a member of this chat room');
        }

        return this.chatMessageRepository.find({
            where: { chatRoomId: roomId, isDeleted: false },
            relations: ['sender'],
            order: { createdAt: 'DESC' },
            take: limit,
        });
    }
}