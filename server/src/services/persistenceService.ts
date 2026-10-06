import { checkDatabase, databaseConfigured, prisma } from '../db/client.js';
import type { Room } from '../types/game.js';
import { GameRepository } from '../repositories/gameRepository.js';
import { ProfileRepository, type LeaderboardOrder } from '../repositories/profileRepository.js';
import { RoomRepository } from '../repositories/roomRepository.js';

export class PersistenceService {
	private persistenceReady = false;
	private readonly profiles = new ProfileRepository(prisma);
	private readonly rooms = new RoomRepository(prisma);
	private readonly games = new GameRepository(prisma);
	private readonly gameIds = new Map<string, string>();
	private readonly roomQueues = new Map<string, Promise<void>>();

	get configured() {
		return databaseConfigured && this.persistenceReady;
	}

	health() {
		return checkDatabase();
	}

	async initialize() {
		if (!databaseConfigured) return;
		try {
			await this.rooms.expireOrphanedRooms();
			this.persistenceReady = true;
		} catch (error) {
			console.error('Could not expire rooms from a previous server process.', error);
		}
	}

	async ensureProfile(userId: string, sessionId: string, username: string, avatar: string) {
		if (!this.persistenceReady) return;
		try {
			await this.profiles.upsertIdentity(userId, sessionId, username, avatar);
		} catch (error) {
			console.error('Could not persist player profile.', error);
		}
	}

	async saveRoom(room: Room) {
		if (!this.persistenceReady) return;
		await this.enqueue(room.code, async () => {
			try {
				await this.rooms.save(room);
			} catch (error) {
				console.error(`Could not persist room ${room.code}.`, error);
			}
		});
	}

	async expireRoom(code: string) {
		if (!this.persistenceReady) return;
		try {
			await this.rooms.expireRoom(code);
		} catch (error) {
			console.error(`Could not expire room ${code}.`, error);
		}
	}

	startGame(room: Room) {
		if (!this.persistenceReady) return Promise.resolve();
		return this.enqueue(room.code, async () => {
			try {
				for (const player of room.players) {
					await this.profiles.upsertIdentity(player.profileId, player.sessionId, player.name, player.avatar);
				}
			const gameId = await this.games.start(room);
			if (gameId) this.gameIds.set(room.code, gameId);
			await this.rooms.save(room);
			} catch (error) {
				console.error(`Could not persist the start of room ${room.code}.`, error);
			}
		});
	}

	saveRound(room: Room) {
		if (!this.persistenceReady) return Promise.resolve();
		return this.enqueue(room.code, async () => {
			try {
				const gameId = this.gameIds.get(room.code);
				if (gameId) await this.games.saveRound(room, gameId);
				await this.rooms.save(room);
			} catch (error) {
				console.error(`Could not persist round ${room.round} for room ${room.code}.`, error);
			}
		});
	}

	finishGame(room: Room) {
		if (!this.persistenceReady) return Promise.resolve();
		return this.enqueue(room.code, async () => {
			try {
				const gameId = this.gameIds.get(room.code);
				if (gameId) await this.games.finish(room, gameId);
				await this.rooms.save(room);
				this.gameIds.delete(room.code);
			} catch (error) {
				console.error(`Could not persist completed game for room ${room.code}.`, error);
			}
		});
	}

	async saveRoomSafely(room: Room) {
		return this.saveRoom(room);
	}

	publicRooms() {
		return this.rooms.publicRooms();
	}

	async createProfile(userId: string, sessionId: string, username: string, avatar: string) {
		await this.profiles.upsertIdentity(userId, sessionId, username, avatar);
		return this.profiles.getPublicProfile(userId);
	}

	ownsProfile(userId: string, sessionId: string) {
		return this.profiles.ownsSession(userId, sessionId);
	}

	getProfile(userId: string) {
		return this.profiles.getPublicProfile(userId);
	}

	updateProfile(userId: string, input: { username?: string; avatar?: string }) {
		return this.profiles.updateProfile(userId, input);
	}

	leaderboard(order: LeaderboardOrder, limit: number) {
		return this.profiles.leaderboard(order, limit);
	}

	gameHistory(gameId: string) {
		return this.games.getPublicGame(gameId);
	}

	private enqueue(roomCode: string, operation: () => Promise<void>) {
		const previous = this.roomQueues.get(roomCode) ?? Promise.resolve();
		const next = previous.catch(() => undefined).then(operation);
		this.roomQueues.set(roomCode, next);
		void next.finally(() => {
			if (this.roomQueues.get(roomCode) === next) this.roomQueues.delete(roomCode);
		});
		return next;
	}
}
