import { GameError } from '../lib/errors.js';
import { createId, createRoomCode } from '../lib/id.js';
import type { GameSettings, Player, Room, RoomSnapshot, RoomVisibility } from '../types/game.js';

const AVATARS = ['🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🐨', '🦁'];
const PLAYER_COLORS = ['#7c5cfc', '#ff5c8a', '#22b8a7', '#ffb648', '#4da3ff', '#9b78ff'];

interface CreateRoomInput {
	name: string;
	sessionId: string;
	profileId?: string;
	socketId: string;
	settings: GameSettings;
	roomName?: string;
	visibility?: RoomVisibility;
}

interface JoinRoomInput {
	code: string;
	name: string;
	sessionId: string;
	profileId?: string;
	socketId: string;
}

export class RoomService {
	private readonly rooms = new Map<string, Room>();

	create(input: CreateRoomInput) {
		this.assertSessionAvailable(input.sessionId);
		let code = createRoomCode();
		while (this.rooms.has(code)) code = createRoomCode();

		const host = this.createPlayer(input.name, input.sessionId, input.socketId, 0, input.profileId);
		host.isHost = true;
		const room: Room = {
			code,
			name: input.roomName?.trim() || `${input.name}'s Room`,
			visibility: input.visibility ?? 'PRIVATE',
			hostId: host.id,
			players: [host],
			settings: { ...input.settings },
			phase: 'LOBBY',
			round: 0,
			drawerId: null,
			secretWord: null,
			wordOptions: [],
			wordChoiceEndsAt: null,
			wordChoiceTimer: null,
			revealedHintIndexes: [],
			roundStartedAt: null,
			roundEndsAt: null,
			strokes: [],
			activeStrokes: new Map(),
			redoStrokes: [],
			roundScores: new Map(),
			correctGuessers: new Set(),
			guessHistory: [],
			drawingCounts: new Map(),
			createdAt: Date.now(),
			roundTimer: null,
			tickTimer: null,
			transitionTimer: null,
			disconnectTimers: new Map(),
		};
		this.rooms.set(code, room);
		return { room, player: host };
	}

	join(input: JoinRoomInput) {
		const room = this.getRoom(input.code);
		if (room.phase === 'FINISHED') throw new GameError('This room has already finished.', 'ROOM_FINISHED');
		if (room.players.some((player) => player.sessionId === input.sessionId)) {
			throw new GameError('This player session is already in the room.', 'SESSION_EXISTS');
		}
		this.assertSessionAvailable(input.sessionId);
		if (room.players.length >= room.settings.maxPlayers) throw new GameError('This room is full.', 'ROOM_FULL');

		const player = this.createPlayer(input.name, input.sessionId, input.socketId, room.players.length, input.profileId);
		room.players.push(player);
		return { room, player };
	}

	reconnect(code: string, sessionId: string, socketId: string) {
		const room = this.getRoom(code);
		const player = room.players.find((candidate) => candidate.sessionId === sessionId);
		if (!player || player.isConnected) throw new GameError('No disconnected player session was found.', 'RECONNECT_NOT_FOUND');
		player.isConnected = true;
		player.socketId = socketId;
		return { room, player };
	}

	getRoom(code: string) {
		const room = this.rooms.get(code.toUpperCase());
		if (!room) throw new GameError('Room not found.', 'ROOM_NOT_FOUND');
		return room;
	}

	getPlayer(room: Room, playerId: string) {
		const player = room.players.find((candidate) => candidate.id === playerId);
		if (!player) throw new GameError('Player is not in this room.', 'PLAYER_NOT_FOUND');
		return player;
	}

	findBySocketId(socketId: string) {
		for (const room of this.rooms.values()) {
			const player = room.players.find((candidate) => candidate.socketId === socketId);
			if (player) return { room, player };
		}
		return null;
	}

	findBySessionId(sessionId: string) {
		for (const room of this.rooms.values()) {
			const player = room.players.find((candidate) => candidate.sessionId === sessionId);
			if (player) return { room, player };
		}
		return null;
	}

	disconnect(socketId: string) {
		const membership = this.findBySocketId(socketId);
		if (!membership) return null;
		const { room, player } = membership;
		player.isConnected = false;
		player.socketId = null;
		const hostChanged = player.id === room.hostId ? this.transferHost(room) : null;
		return { room, player, hostChanged };
	}

	removeDisconnectedPlayer(room: Room, playerId: string) {
		const index = room.players.findIndex((player) => player.id === playerId);
		if (index < 0 || room.players[index].isConnected) return null;
		const [player] = room.players.splice(index, 1);
		room.disconnectTimers.delete(playerId);
		const hostChanged = player.id === room.hostId ? this.transferHost(room) : null;
		if (room.players.length === 0) {
			this.destroy(room);
			return { player, hostChanged, roomDestroyed: true };
		}
		return { player, hostChanged, roomDestroyed: false };
	}

	leave(socketId: string) {
		const membership = this.findBySocketId(socketId);
		if (!membership) return null;
		const { room, player } = membership;
		const index = room.players.indexOf(player);
		room.players.splice(index, 1);
		const hostChanged = player.id === room.hostId ? this.transferHost(room) : null;
		if (room.players.length === 0) this.destroy(room);
		return { room, player, hostChanged, roomDestroyed: room.players.length === 0 };
	}

	updateSettings(room: Room, player: Player, settings: GameSettings) {
		if (player.id !== room.hostId) throw new GameError('Only the host can change settings.', 'NOT_HOST');
		if (room.phase !== 'LOBBY') throw new GameError('Settings cannot change after the game starts.', 'GAME_STARTED');
		if (settings.maxPlayers < room.players.length) throw new GameError('Maximum players cannot be lower than the current room size.', 'INVALID_SETTINGS');
		room.settings = { ...settings };
	}

	setReady(room: Room, player: Player, isReady: boolean) {
		if (room.phase !== 'LOBBY') throw new GameError('Readiness cannot change after the game starts.', 'GAME_STARTED');
		player.isReady = isReady;
	}

	snapshot(room: Room): RoomSnapshot {
		return {
			code: room.code,
			name: room.name,
			visibility: room.visibility,
			hostId: room.hostId,
			players: room.players.map(({ sessionId: _sessionId, socketId: _socketId, ...player }) => ({ ...player })),
			settings: { ...room.settings },
			phase: room.phase,
			round: room.round,
			drawerId: room.drawerId,
			wordChoiceEndsAt: room.wordChoiceEndsAt,
			roundEndsAt: room.roundEndsAt,
			strokes: [...room.strokes, ...room.activeStrokes.values()].map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })),
		};
	}

	publicRooms() {
		return [...this.rooms.values()]
			.filter((room) => room.visibility === 'PUBLIC' && room.phase === 'LOBBY' && room.players.length < room.settings.maxPlayers)
			.map((room) => this.snapshot(room));
	}

	destroy(room: Room) {
		if (room.roundTimer) clearTimeout(room.roundTimer);
		if (room.wordChoiceTimer) clearTimeout(room.wordChoiceTimer);
		if (room.tickTimer) clearInterval(room.tickTimer);
		if (room.transitionTimer) clearTimeout(room.transitionTimer);
		for (const timer of room.disconnectTimers.values()) clearTimeout(timer);
		this.rooms.delete(room.code);
	}

	dispose() {
		for (const room of this.rooms.values()) this.destroy(room);
	}

	private createPlayer(name: string, sessionId: string, socketId: string, index: number, profileId?: string): Player {
		return {
			id: createId(),
			sessionId,
			profileId: profileId ?? createId(),
			name,
			avatar: AVATARS[index % AVATARS.length],
			color: PLAYER_COLORS[index % PLAYER_COLORS.length],
			score: 0,
			isHost: false,
			isReady: false,
			isConnected: true,
			correctGuesses: 0,
			roundsWon: 0,
			fastestGuessMs: null,
			joinedAt: Date.now(),
			socketId,
		};
	}

	private assertSessionAvailable(sessionId: string) {
		const existing = this.findBySessionId(sessionId);
		if (existing?.player.isConnected) throw new GameError('This player session is already active.', 'SESSION_IN_USE');
		if (existing) throw new GameError('Reconnect to your existing room instead of joining again.', 'SESSION_EXISTS');
	}

	private transferHost(room: Room) {
		const oldHost = room.players.find((player) => player.id === room.hostId);
		if (oldHost) oldHost.isHost = false;
		const nextHost = room.players.find((player) => player.isConnected) ?? room.players[0];
		if (!nextHost) return null;
		nextHost.isHost = true;
		room.hostId = nextHost.id;
		return nextHost;
	}
}