import type { Socket } from 'socket.io';
import { config } from '../lib/config.js';
import { GameError } from '../lib/errors.js';
import { createId } from '../lib/id.js';
import {
	chatTextSchema,
	chooseWordSchema,
	createRoomSchema,
	drawEndSchema,
	drawMoveSchema,
	drawStartSchema,
	joinRoomSchema,
	reconnectRoomSchema,
	sessionIdSchema,
	settingsSchema,
} from '../lib/validation.js';
import { RateLimiter } from '../lib/rateLimiter.js';
import { ReconnectService, reconnectTimerKey } from '../services/reconnectService.js';
import { RoomService } from '../services/roomService.js';
import { GameService, type GameServer } from '../services/gameService.js';
import { PersistenceService } from '../services/persistenceService.js';
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from '../types/socket.js';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, value: unknown) {
	const result = schema.safeParse(value);
	if (!result.success) throw new GameError(result.error.issues[0]?.message ?? 'Invalid request.', 'VALIDATION_ERROR');
	return result.data;
}

function reportError(socket: GameSocket, error: unknown) {
	if (error instanceof GameError) {
		socket.emit('error', { code: error.code, message: error.message });
		return;
	}
	console.error(error);
	socket.emit('error', { code: 'SERVER_ERROR', message: 'The request could not be completed.' });
}

function emitRoomNotice(io: GameServer, roomCode: string, text: string) {
	io.to(roomCode).emit('chat:message', {
		id: createId(),
		playerId: 'system',
		playerName: 'Arena',
		text,
		type: 'system',
		createdAt: Date.now(),
	});
}

function execute(socket: GameSocket, operation: () => void | Promise<void>) {
	try {
		void Promise.resolve(operation()).catch((error: unknown) => reportError(socket, error));
	} catch (error) {
		reportError(socket, error);
	}
}

export function registerSocketHandlers(
	io: GameServer,
	rooms: RoomService,
	game: GameService,
	reconnects: ReconnectService,
	persistence = new PersistenceService(),
) {
	const limiter = new RateLimiter();

	io.use((socket, next) => {
		const session = sessionIdSchema.safeParse(socket.handshake.auth?.sessionId);
		if (!session.success) {
			next(new Error('A valid player session is required.'));
			return;
		}
		socket.data.sessionId = session.data;
		next();
	});

	io.on('connection', (socket) => {
		const client = socket as GameSocket;

		function membership() {
			const { roomCode, playerId } = client.data;
			if (!roomCode || !playerId) throw new GameError('Join a room first.', 'NOT_IN_ROOM');
			const room = rooms.getRoom(roomCode);
			const player = rooms.getPlayer(room, playerId);
			if (player.socketId !== client.id || !player.isConnected) throw new GameError('This socket is no longer active for the player.', 'SOCKET_REPLACED');
			return { room, player };
		}

		function broadcastRoom(roomCode: string) {
			const room = rooms.getRoom(roomCode);
			const snapshot = rooms.snapshot(room);
			for (const player of room.players) {
				if (player.isConnected && player.socketId) {
					io.to(player.socketId).emit('room:update', { room: snapshot, yourPlayerId: player.id });
				}
			}
		}

		client.on('room:create', (payload) => execute(client, async () => {
			const request = parse(createRoomSchema, payload);
			const profileId = request.profileId ?? createId();
			await persistence.ensureProfile(profileId, client.data.sessionId, request.name, '🦊');
			const { room, player } = rooms.create({
				name: request.name,
				sessionId: client.data.sessionId,
				profileId,
				socketId: client.id,
				settings: request.settings,
				roomName: request.roomName,
				visibility: request.visibility,
			});
			client.data.roomCode = room.code;
			client.data.playerId = player.id;
			void client.join(room.code);
			await persistence.saveRoom(room);
			client.emit('room:created', { room: rooms.snapshot(room), yourPlayerId: player.id });
			broadcastRoom(room.code);
		}));

		client.on('room:join', (payload) => execute(client, async () => {
			const request = parse(joinRoomSchema, payload);
			if (request.sessionId !== client.data.sessionId) throw new GameError('Session does not match this connection.', 'INVALID_SESSION');
			const profileId = request.profileId ?? createId();
			await persistence.ensureProfile(profileId, request.sessionId, request.name, '🦊');
			const { room, player } = rooms.join({
				code: request.roomCode,
				name: request.name,
				sessionId: request.sessionId,
				profileId,
				socketId: client.id,
			});
			client.data.roomCode = room.code;
			client.data.playerId = player.id;
			void client.join(room.code);
			client.emit('room:joined', { room: rooms.snapshot(room), yourPlayerId: player.id });
			game.resendPrivateState(room, player);
			const publicPlayer = rooms.snapshot(room).players.find((candidate) => candidate.id === player.id);
			if (publicPlayer) client.to(room.code).emit('player:joined', { player: publicPlayer });
			emitRoomNotice(io, room.code, `${player.name} joined the room.`);
			await persistence.saveRoom(room);
			broadcastRoom(room.code);
		}));

		client.on('room:reconnect', (payload) => execute(client, () => {
			const request = parse(reconnectRoomSchema, payload);
			if (request.sessionId !== client.data.sessionId) throw new GameError('Session does not match this connection.', 'INVALID_SESSION');
			const { room, player } = rooms.reconnect(request.roomCode, request.sessionId, client.id);
			reconnects.clear(reconnectTimerKey(room.code, player.id));
			room.disconnectTimers.delete(player.id);
			client.data.roomCode = room.code;
			client.data.playerId = player.id;
			void client.join(room.code);
			client.emit('room:reconnected', { room: rooms.snapshot(room), yourPlayerId: player.id });
			game.resendPrivateState(room, player);
			broadcastRoom(room.code);
		}));

		client.on('room:update-settings', (payload) => execute(client, async () => {
			const request = parse(settingsSchema, payload.settings);
			const { room, player } = membership();
			rooms.updateSettings(room, player, request);
			await persistence.saveRoom(room);
			broadcastRoom(room.code);
		}));

		client.on('player:ready', (payload) => execute(client, () => {
			if (!payload || typeof payload.isReady !== 'boolean') throw new GameError('Readiness must be true or false.', 'VALIDATION_ERROR');
			const { room, player } = membership();
			rooms.setReady(room, player, payload.isReady);
			broadcastRoom(room.code);
		}));

		client.on('room:leave', () => execute(client, async () => {
			const current = rooms.findBySocketId(client.id);
			if (!current) return;
			const { room, player } = current;
			game.handlePlayerUnavailable(room, player.id);
			reconnects.clear(reconnectTimerKey(room.code, player.id));
			const result = rooms.leave(client.id);
			client.leave(room.code);
			client.data.roomCode = undefined;
			client.data.playerId = undefined;
			if (!result) return;
			if (result.roomDestroyed) {
				reconnects.clearRoom(room.code);
				await persistence.expireRoom(room.code);
				return;
			}
			io.to(room.code).emit('player:left', { playerId: player.id });
			emitRoomNotice(io, room.code, `${player.name} left the room.`);
			if (result.hostChanged) io.to(room.code).emit('host:changed', { hostId: result.hostChanged.id });
			await persistence.saveRoom(room);
			broadcastRoom(room.code);
		}));

		client.on('game:start', () => execute(client, () => {
			const { room, player } = membership();
			game.start(room.code, player.id);
		}));

		client.on('game:rematch', () => execute(client, async () => {
			const { room, player } = membership();
			game.rematch(room.code, player.id);
			await persistence.saveRoom(room);
		}));

		client.on('round:choose-word', (payload) => execute(client, () => {
			const request = parse(chooseWordSchema, payload);
			const { room, player } = membership();
			game.chooseWord(room.code, player.id, request.word);
		}));

		client.on('draw:start', (payload) => execute(client, () => {
			if (!limiter.allow(`${client.id}:drawing`, config.maxDrawingEventsPerSecond)) throw new GameError('Drawing too quickly. Try again in a moment.', 'RATE_LIMITED');
			const request = parse(drawStartSchema, payload);
			const { room, player } = membership();
			game.addStrokeStart(room.code, player.id, request.strokeId, request);
		}));

		client.on('draw:move', (payload) => execute(client, () => {
			if (!limiter.allow(`${client.id}:drawing`, config.maxDrawingEventsPerSecond)) throw new GameError('Drawing too quickly. Try again in a moment.', 'RATE_LIMITED');
			const request = parse(drawMoveSchema, payload);
			const { room, player } = membership();
			game.addStrokePoints(room.code, player.id, request.strokeId, request.points);
		}));

		client.on('draw:end', (payload) => execute(client, () => {
			const request = parse(drawEndSchema, payload);
			const { room, player } = membership();
			game.finishStroke(room.code, player.id, request.strokeId);
		}));

		client.on('draw:clear', () => execute(client, () => {
			const { room, player } = membership();
			game.clearCanvas(room.code, player.id);
		}));

		client.on('draw:undo', () => execute(client, () => {
			const { room, player } = membership();
			game.undoCanvas(room.code, player.id);
		}));

		client.on('draw:redo', () => execute(client, () => {
			const { room, player } = membership();
			game.redoCanvas(room.code, player.id);
		}));

		client.on('chat:send', (payload) => execute(client, () => {
			if (!limiter.allow(`${client.id}:chat`, config.maxChatMessagesPerSecond)) throw new GameError('You are sending messages too quickly.', 'RATE_LIMITED');
			const request = parse(chatTextSchema, payload.text);
			const { room, player } = membership();
			game.guess(room.code, player.id, request);
		}));

		client.on('disconnect', () => {
			limiter.delete(`${client.id}:chat`);
			limiter.delete(`${client.id}:drawing`);
			const disconnected = rooms.disconnect(client.id);
			if (!disconnected) return;
			const { room, player, hostChanged } = disconnected;
			if (hostChanged) io.to(room.code).emit('host:changed', { hostId: hostChanged.id });
			game.handlePlayerUnavailable(room, player.id);
			void persistence.saveRoom(room);
			broadcastRoom(room.code);
			const key = reconnectTimerKey(room.code, player.id);
			const timer = reconnects.schedule(key, config.reconnectGraceMs, () => {
				const removed = rooms.removeDisconnectedPlayer(room, player.id);
				if (!removed) return;
				if (removed.roomDestroyed) {
					reconnects.clearRoom(room.code);
					void persistence.expireRoom(room.code);
					return;
				}
				io.to(room.code).emit('player:left', { playerId: player.id });
				emitRoomNotice(io, room.code, `${player.name} left the room.`);
				if (removed.hostChanged) io.to(room.code).emit('host:changed', { hostId: removed.hostChanged.id });
				void persistence.saveRoom(room);
				broadcastRoom(room.code);
			});
			room.disconnectTimers.set(player.id, timer);
		});
	});
}