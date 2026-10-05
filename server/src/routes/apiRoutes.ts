import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { RateLimiter } from '../lib/rateLimiter.js';
import { sessionIdSchema, nameSchema, roomCodeSchema } from '../lib/validation.js';
import { PersistenceService } from '../services/persistenceService.js';
import { RoomService } from '../services/roomService.js';

const leaderboardQuerySchema = z.object({
	sort: z.enum(['score', 'wins', 'correct']).default('score'),
	limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

const profileInputSchema = z.object({
	profileId: z.string().uuid(),
	username: nameSchema,
	avatar: z.string().trim().min(1).max(16).default('🦊'),
}).strict();

const profileUpdateSchema = z.object({
	username: nameSchema.optional(),
	avatar: z.string().trim().min(1).max(16).optional(),
}).strict().refine((value) => value.username !== undefined || value.avatar !== undefined);

function errorResponse(response: Response, status: number, code: string, message: string) {
	response.status(status).json({ error: { code, message } });
}

function asyncRoute(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
	return (request, response, next) => {
		void handler(request, response).catch(next);
	};
}

export function createApiRouter(persistence: PersistenceService, rooms: RoomService) {
	const router = Router();
	const limiter = new RateLimiter();
	router.use((request, response, next) => {
		if (!limiter.allow(`${request.ip}:api`, 120, 60_000)) {
			errorResponse(response, 429, 'RATE_LIMITED', 'Too many requests. Try again shortly.');
			return;
		}
		next();
	});

	router.get('/leaderboard', asyncRoute(async (request, response) => {
		const query = leaderboardQuerySchema.safeParse(request.query);
		if (!query.success) {
			errorResponse(response, 400, 'INVALID_QUERY', 'Leaderboard filters are invalid.');
			return;
		}
		if (!persistence.configured) {
			errorResponse(response, 503, 'DATABASE_UNAVAILABLE', 'Leaderboard data is unavailable until PostgreSQL is configured.');
			return;
		}
		response.json({ sort: query.data.sort, players: await persistence.leaderboard(query.data.sort, query.data.limit) });
	}));

	router.get('/rooms/public', asyncRoute(async (_request, response) => {
		const liveRooms = rooms.publicRooms().map((room) => {
			const host = room.players.find((player) => player.isHost);
			return {
				code: room.code,
				name: room.name,
				host: host ? { username: host.name, avatar: host.avatar } : null,
				players: room.players.filter((player) => player.isConnected).length,
				maxPlayers: room.settings.maxPlayers,
				settings: room.settings,
			};
		});
		let persistedRooms: Awaited<ReturnType<PersistenceService['publicRooms']>> = [];
		if (persistence.configured) {
			try {
				persistedRooms = await persistence.publicRooms();
			} catch (error) {
				console.error('Could not load persisted public room metadata.', error);
			}
		}
		const activeCodes = new Set(liveRooms.map((room) => room.code));
		const persisted = persistedRooms
			.filter((room) => !activeCodes.has(room.code))
			.map((room) => ({
				code: room.code,
				name: room.name,
				host: room.host?.profile ?? null,
				players: room.currentPlayers,
				maxPlayers: room.maxPlayers,
				settings: room.settings,
			}));
		response.json({ rooms: [...liveRooms, ...persisted].filter((room) => room.players < room.maxPlayers) });
	}));

	router.get('/profile/:playerId', asyncRoute(async (request, response) => {
		const playerId = z.string().uuid().safeParse(request.params.playerId);
		if (!playerId.success) {
			errorResponse(response, 400, 'INVALID_PLAYER_ID', 'Player ID is invalid.');
			return;
		}
		if (!persistence.configured) {
			errorResponse(response, 503, 'DATABASE_UNAVAILABLE', 'Profiles are unavailable until PostgreSQL is configured.');
			return;
		}
		const profile = await persistence.getProfile(playerId.data);
		if (!profile) {
			errorResponse(response, 404, 'PROFILE_NOT_FOUND', 'Profile not found.');
			return;
		}
		response.json({ profile });
	}));

	router.post('/profile', asyncRoute(async (request, response) => {
		const parsed = profileInputSchema.safeParse(request.body);
		const sessionId = sessionIdSchema.safeParse(request.header('x-player-session'));
		if (!parsed.success || !sessionId.success) {
			errorResponse(response, 400, 'INVALID_PROFILE', 'Profile details are invalid.');
			return;
		}
		if (!persistence.configured) {
			errorResponse(response, 503, 'DATABASE_UNAVAILABLE', 'Profiles are unavailable until PostgreSQL is configured.');
			return;
		}
		const profile = await persistence.createProfile(parsed.data.profileId, sessionId.data, parsed.data.username, parsed.data.avatar);
		response.status(201).json({ profile });
	}));

	router.patch('/profile/:playerId', asyncRoute(async (request, response) => {
		const playerId = z.string().uuid().safeParse(request.params.playerId);
		const parsed = profileUpdateSchema.safeParse(request.body);
		const sessionId = sessionIdSchema.safeParse(request.header('x-player-session'));
		if (!playerId.success || !parsed.success || !sessionId.success) {
			errorResponse(response, 400, 'INVALID_PROFILE', 'Profile update is invalid.');
			return;
		}
		if (!persistence.configured) {
			errorResponse(response, 503, 'DATABASE_UNAVAILABLE', 'Profiles are unavailable until PostgreSQL is configured.');
			return;
		}
		if (!await persistence.ownsProfile(playerId.data, sessionId.data)) {
			errorResponse(response, 403, 'PROFILE_FORBIDDEN', 'This session cannot update that profile.');
			return;
		}
		await persistence.updateProfile(playerId.data, parsed.data);
		response.json({ profile: await persistence.getProfile(playerId.data) });
	}));

	router.get('/games/:gameId', asyncRoute(async (request, response) => {
		const gameId = z.string().uuid().safeParse(request.params.gameId);
		if (!gameId.success) {
			errorResponse(response, 400, 'INVALID_GAME_ID', 'Game ID is invalid.');
			return;
		}
		if (!persistence.configured) {
			errorResponse(response, 503, 'DATABASE_UNAVAILABLE', 'Game history is unavailable until PostgreSQL is configured.');
			return;
		}
		const game = await persistence.gameHistory(gameId.data);
		if (!game) {
			errorResponse(response, 404, 'GAME_NOT_FOUND', 'Game not found.');
			return;
		}
		response.json({ game });
	}));

	return router;
}