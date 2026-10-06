import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Player, Room } from '../types/game.js';

export class GameRepository {
	private readonly pending = new Map<string, PendingGame>();

	constructor(private readonly prisma: PrismaClient | null) {}

	async start(room: Room) {
		const gameId = randomUUID();
		this.pending.set(gameId, { gameId, roomCode: room.code, startedAt: new Date(), rounds: [], players: room.players.map(toPlayerRecord), settings: room.settings });
		return this.prisma ? gameId : null;
	}

	async saveRound(room: Room, gameId: string) {
		const pending = this.pending.get(gameId);
		if (!pending) return;
		const drawer = room.players.find((player) => player.id === room.drawerId);
		const selectedWordHash = room.secretWord
			? createHash('sha256').update(room.secretWord.normalize('NFKC').toLocaleLowerCase()).digest('hex')
			: null;
		const scoresAwarded = Object.fromEntries(room.roundScores.entries());
		const startedAt = new Date(room.roundStartedAt ?? Date.now() - room.settings.drawTime * 1000);
		const endedAt = new Date();

		const round: PendingRound = {
			roundNumber: room.round,
			drawerUserId: drawer?.profileId,
			drawerName: drawer?.name ?? 'Unknown',
			durationSeconds: Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)),
			selectedWordHash,
			scoresAwarded,
			startedAt,
			endedAt,
			guesses: room.guessHistory.map((guess) => {
				const player = room.players.find((candidate) => candidate.id === guess.playerId);
				return { userId: player?.profileId, playerId: guess.playerId, correct: guess.correct, points: guess.points, guessedAt: new Date(guess.guessedAt) };
			}),
			drawing: drawer ? { userId: drawer.profileId, strokeCount: room.strokes.length, durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()) } : null,
		};
		const existing = pending.rounds.findIndex((candidate) => candidate.roundNumber === round.roundNumber);
		if (existing >= 0) pending.rounds[existing] = round;
		else pending.rounds.push(round);
	}

	async finish(room: Room, gameId: string) {
		const pending = this.pending.get(gameId);
		if (!pending || !this.prisma) {
			this.pending.delete(gameId);
			return;
		}
		const winner = [...room.players].sort((left, right) => right.score - left.score)[0];
		const endedAt = new Date();
		await this.prisma.$transaction(async (transaction) => {
			await transaction.game.create({
			data: {
				id: gameId,
				roomCode: room.code,
				status: 'FINISHED',
				startedAt: pending.startedAt,
				endedAt,
				rounds: room.settings.rounds,
				winnerId: winner?.profileId ?? null,
				settings: pending.settings as unknown as Prisma.InputJsonValue,
				players: { create: room.players.map(toPlayerRecord) },
				roundsData: { create: pending.rounds.map((round) => ({
					roundNumber: round.roundNumber,
					drawerUserId: round.drawerUserId,
					drawerName: round.drawerName,
					durationSeconds: round.durationSeconds,
					selectedWordHash: round.selectedWordHash,
					scoresAwarded: round.scoresAwarded as Prisma.InputJsonValue,
					startedAt: round.startedAt,
					endedAt: round.endedAt,
					guesses: { create: round.guesses.map((guess) => ({ ...guess, game: { connect: { id: gameId } } })) },
					drawings: round.drawing ? { create: { ...round.drawing, game: { connect: { id: gameId } } } } : undefined,
				})) },
			},
			});
			for (const player of room.players) {
				const drawingsCompleted = room.drawingCounts.get(player.id) ?? 0;
				await transaction.gamePlayer.updateMany({ where: { gameId, playerId: player.id }, data: { finalScore: player.score, correctGuesses: player.correctGuesses, roundsWon: player.roundsWon, fastestGuessMs: player.fastestGuessMs, drawingsCompleted } });
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
		this.pending.delete(gameId);
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

type PendingGame = {
	gameId: string;
	roomCode: string;
	startedAt: Date;
	settings: Room['settings'];
	players: ReturnType<typeof toPlayerRecord>[];
	rounds: PendingRound[];
};

type PendingRound = {
	roundNumber: number;
	drawerUserId?: string;
	drawerName: string;
	durationSeconds: number;
	selectedWordHash: string | null;
	scoresAwarded: Record<string, number>;
	startedAt: Date;
	endedAt: Date;
	guesses: { userId?: string; playerId: string; correct: boolean; points: number; guessedAt: Date }[];
	drawing: { userId: string; strokeCount: number; durationMs: number } | null;
};

function toPlayerRecord(player: Player) {
	return {
		playerId: player.id,
		userId: player.profileId,
		username: player.name,
		avatar: player.avatar,
		color: player.color,
		finalScore: player.score,
		correctGuesses: player.correctGuesses,
		roundsWon: player.roundsWon,
		fastestGuessMs: player.fastestGuessMs,
		drawingsCompleted: 0,
	};
}
