import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Player, Room } from '../types/game.js';

export class GameRepository {
	constructor(private readonly prisma: PrismaClient | null) {}

	async start(room: Room) {
		if (!this.prisma) return null;
		const game = await this.prisma.game.create({
			data: {
				roomCode: room.code,
				rounds: room.settings.rounds,
				settings: room.settings as unknown as Prisma.InputJsonValue,
				players: {
					create: room.players.map((player) => ({
						playerId: player.id,
						userId: player.profileId,
						username: player.name,
						avatar: player.avatar,
						color: player.color,
					})),
				},
			},
			select: { id: true },
		});
		return game.id;
	}

	async saveRound(room: Room, gameId: string) {
		if (!this.prisma) return;
		const drawer = room.players.find((player) => player.id === room.drawerId);
		const selectedWordHash = room.secretWord
			? createHash('sha256').update(room.secretWord.normalize('NFKC').toLocaleLowerCase()).digest('hex')
			: null;
		const scoresAwarded = Object.fromEntries(room.roundScores.entries());
		const startedAt = new Date(room.roundStartedAt ?? Date.now() - room.settings.drawTime * 1000);
		const endedAt = new Date();

		await this.prisma.$transaction(async (transaction) => {
			const round = await transaction.round.upsert({
				where: { gameId_roundNumber: { gameId, roundNumber: room.round } },
				create: {
					gameId,
					roundNumber: room.round,
					drawerUserId: drawer?.profileId,
					drawerName: drawer?.name ?? 'Unknown',
					durationSeconds: Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)),
					selectedWordHash,
					scoresAwarded: scoresAwarded as Prisma.InputJsonValue,
					startedAt,
					endedAt,
				},
				update: {
					selectedWordHash,
					scoresAwarded: scoresAwarded as Prisma.InputJsonValue,
					endedAt,
				},
				select: { id: true },
			});

			await transaction.guess.deleteMany({ where: { roundId: round.id } });
			if (room.guessHistory.length > 0) {
				await transaction.guess.createMany({
					data: room.guessHistory.map((guess) => {
						const player = room.players.find((candidate) => candidate.id === guess.playerId);
						return {
							gameId,
							roundId: round.id,
							userId: player?.profileId,
							playerId: guess.playerId,
							correct: guess.correct,
							points: guess.points,
							guessedAt: new Date(guess.guessedAt),
						};
					}),
				});
			}

			await transaction.drawingSummary.deleteMany({ where: { gameId, roundId: round.id } });
			if (drawer) {
				await transaction.drawingSummary.create({
					data: {
						gameId,
						roundId: round.id,
						userId: drawer.profileId,
						strokeCount: room.strokes.length,
						durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
					},
				});
			}
		});
	}

	async finish(room: Room, gameId: string) {
		if (!this.prisma) return;
		const winner = [...room.players].sort((left, right) => right.score - left.score)[0];
		const endedAt = new Date();
		await this.prisma.$transaction(async (transaction) => {
			const existing = await transaction.game.findUnique({ where: { id: gameId }, select: { status: true } });
			if (!existing || existing.status === 'FINISHED') return;

			await transaction.game.update({
				where: { id: gameId },
				data: { status: 'FINISHED', endedAt, winnerId: winner?.profileId ?? null },
			});

			for (const player of room.players) {
				const drawingsCompleted = room.drawingCounts.get(player.id) ?? 0;
				await transaction.gamePlayer.updateMany({
					where: { gameId, playerId: player.id },
					data: {
						finalScore: player.score,
						correctGuesses: player.correctGuesses,
						roundsWon: player.roundsWon,
						fastestGuessMs: player.fastestGuessMs,
						drawingsCompleted,
					},
				});

				const profile = await transaction.profile.findUnique({ where: { userId: player.profileId } });
				if (!profile) continue;
				const fastestGuessMs = profile.fastestGuessMs === null ? player.fastestGuessMs
					: player.fastestGuessMs === null ? profile.fastestGuessMs
						: Math.min(profile.fastestGuessMs, player.fastestGuessMs);
				await transaction.profile.update({
					where: { userId: player.profileId },
					data: {
						gamesPlayed: { increment: 1 },
						gamesWon: { increment: winner?.id === player.id ? 1 : 0 },
						totalScore: { increment: player.score },
						correctGuesses: { increment: player.correctGuesses },
						fastestGuessMs,
						drawingsCompleted: { increment: drawingsCompleted },
					},
				});
			}
		});
	}

	async getPublicGame(gameId: string) {
		if (!this.prisma) return null;
		return this.prisma.game.findUnique({
			where: { id: gameId },
			select: {
				id: true,
				roomCode: true,
				status: true,
				startedAt: true,
				endedAt: true,
				rounds: true,
				winner: { select: { id: true, profile: { select: { username: true, avatar: true } } } },
				players: {
					orderBy: { finalScore: 'desc' },
					select: { playerId: true, username: true, avatar: true, finalScore: true, correctGuesses: true, roundsWon: true, fastestGuessMs: true, drawingsCompleted: true },
				},
				roundsData: {
					orderBy: { roundNumber: 'asc' },
					select: { roundNumber: true, drawerName: true, durationSeconds: true, scoresAwarded: true, startedAt: true, endedAt: true },
				},
			},
		});
	}
}

export function getPlayerById(room: Room, playerId: string): Player | undefined {
	return room.players.find((player) => player.id === playerId);
}