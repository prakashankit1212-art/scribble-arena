import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export type LeaderboardOrder = 'score' | 'wins' | 'correct';

export class ProfileRepository {
	constructor(private readonly prisma: PrismaClient | null) {}

	async upsertIdentity(userId: string, sessionId: string, username: string, avatar: string) {
		if (!this.prisma) return;
		await this.upsertProfile(userId, username, avatar);
		const sessionHash = createHash('sha256').update(sessionId).digest('hex');
		const now = new Date();
		await this.prisma.session.upsert({
			where: { sessionHash },
			create: { userId, sessionHash, lastSeenAt: now, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
			update: { userId, lastSeenAt: now, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
		});
	}

	async upsertProfile(userId: string, username: string, avatar: string) {
		if (!this.prisma) return;
		await this.prisma.user.upsert({
			where: { id: userId },
			create: { id: userId, profile: { create: { username, avatar } } },
			update: { profile: { upsert: { create: { username, avatar }, update: { username, avatar } } } },
		});
	}

	async ownsSession(userId: string, sessionId: string) {
		if (!this.prisma) return false;
		const sessionHash = createHash('sha256').update(sessionId).digest('hex');
		return Boolean(await this.prisma.session.findFirst({ where: { userId, sessionHash }, select: { id: true } }));
	}

	async getPublicProfile(userId: string) {
		if (!this.prisma) return null;
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				createdAt: true,
				profile: {
					select: {
						username: true,
						avatar: true,
						gamesPlayed: true,
						gamesWon: true,
						totalScore: true,
						correctGuesses: true,
						fastestGuessMs: true,
						drawingsCompleted: true,
					},
				},
			},
		});
		if (!user?.profile) return null;
		return {
			id: user.id,
			createdAt: user.createdAt,
			...user.profile,
			winRate: user.profile.gamesPlayed === 0 ? 0 : user.profile.gamesWon / user.profile.gamesPlayed,
		};
	}

	async updateProfile(userId: string, input: { username?: string; avatar?: string }) {
		if (!this.prisma) return null;
		return this.prisma.profile.update({
			where: { userId },
			data: input,
			select: { userId: true, username: true, avatar: true },
		});
	}

	async leaderboard(order: LeaderboardOrder, limit: number) {
		if (!this.prisma) return [];
		const orderBy = order === 'wins' ? { gamesWon: 'desc' as const }
			: order === 'correct' ? { correctGuesses: 'desc' as const }
				: { totalScore: 'desc' as const };
		return this.prisma.profile.findMany({
			orderBy: [orderBy, { username: 'asc' }],
			take: limit,
			select: {
				userId: true,
				username: true,
				avatar: true,
				totalScore: true,
				gamesWon: true,
				correctGuesses: true,
			},
		});
	}
}