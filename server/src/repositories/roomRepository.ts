import { Prisma, RoomStatus as PrismaRoomStatus, type PrismaClient } from '@prisma/client';
import type { Room } from '../types/game.js';

export class RoomRepository {
	constructor(private readonly prisma: PrismaClient | null) {}

	async save(room: Room) {
		if (!this.prisma) return;
		const status: PrismaRoomStatus = room.phase === 'FINISHED' ? 'FINISHED' : room.phase === 'LOBBY' ? 'WAITING' : 'ACTIVE';
		const expiresAt = status === 'WAITING' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;
		const data: Prisma.RoomUncheckedUpdateInput = {
			name: room.name,
			hostUserId: room.players.find((player) => player.id === room.hostId)?.profileId ?? null,
			visibility: room.visibility,
			status,
			settings: room.settings as unknown as Prisma.InputJsonValue,
			maxPlayers: room.settings.maxPlayers,
			currentPlayers: room.players.length,
			lastActiveAt: new Date(),
			expiresAt,
		};
		await this.prisma.room.upsert({
			where: { code: room.code },
			create: {
				code: room.code,
				name: room.name,
				hostUserId: room.players.find((player) => player.id === room.hostId)?.profileId ?? null,
				visibility: room.visibility,
				status,
				settings: room.settings as unknown as Prisma.InputJsonValue,
				maxPlayers: room.settings.maxPlayers,
				currentPlayers: room.players.length,
				lastActiveAt: new Date(),
				expiresAt,
			},
			update: data,
		});
	}

	async expireOrphanedRooms() {
		if (!this.prisma) return;
		await this.prisma.room.updateMany({
			where: { status: { in: ['WAITING', 'ACTIVE'] } },
			data: { status: 'EXPIRED', currentPlayers: 0, expiresAt: new Date() },
		});
	}

	async expireRoom(code: string) {
		if (!this.prisma) return;
		await this.prisma.room.updateMany({ where: { code }, data: { status: 'EXPIRED', currentPlayers: 0, expiresAt: new Date() } });
	}

	async publicRooms() {
		if (!this.prisma) return [];
		return this.prisma.room.findMany({
			where: {
				visibility: 'PUBLIC',
				status: 'WAITING',
				OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
			},
			orderBy: { lastActiveAt: 'desc' },
			take: 30,
			select: {
				code: true,
				name: true,
				currentPlayers: true,
				maxPlayers: true,
				settings: true,
				host: { select: { profile: { select: { username: true, avatar: true } } } },
			},
		}).then((rooms) => rooms.filter((room) => room.currentPlayers < room.maxPlayers));
	}
}