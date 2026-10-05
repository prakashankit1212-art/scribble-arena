import type { Server } from 'socket.io';
import { config } from '../lib/config.js';
import { GameError } from '../lib/errors.js';
import { createHintIndexes, isWordOption, maskWord, pickWordOptions } from './wordService.js';
import type { ClientToServerEvents, InterServerEvents, RoundStartPayload, ServerToClientEvents, SocketData } from '../types/socket.js';
import type { GamePhase, Player, Room, StrokeInput } from '../types/game.js';
import { RoomService } from './roomService.js';
import { ScoreService } from './scoreService.js';
import type { PersistenceService } from './persistenceService.js';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export class GameService {
	constructor(
		private readonly io: GameServer,
		private readonly rooms: RoomService,
		private readonly scores: ScoreService,
		private readonly persistence?: PersistenceService,
	) {}

	start(roomCode: string, playerId: string) {
		const room = this.rooms.getRoom(roomCode);
		const player = this.rooms.getPlayer(room, playerId);
		if (player.id !== room.hostId) throw new GameError('Only the host can start the game.', 'NOT_HOST');
		if (room.phase !== 'LOBBY') throw new GameError('This game has already started.', 'GAME_STARTED');
		const connectedPlayers = room.players.filter((candidate) => candidate.isConnected);
		if (connectedPlayers.length < 2) throw new GameError('At least two connected players are required.', 'NOT_ENOUGH_PLAYERS');

		room.round = 1;
		room.drawerId = connectedPlayers[0].id;
		room.phase = 'WORD_CHOICE';
		room.secretWord = null;
		room.wordOptions = pickWordOptions(room.settings.difficulty);
		this.startWordChoiceTimer(room);
		room.roundStartedAt = null;
		room.strokes = [];
		room.activeStrokes.clear();
		room.redoStrokes = [];
		room.correctGuessers.clear();
		room.guessHistory = [];
		room.drawingCounts.clear();
		room.roundScores.clear();
		for (const candidate of room.players) {
			candidate.score = 0;
			candidate.correctGuesses = 0;
			candidate.roundsWon = 0;
			candidate.fastestGuessMs = null;
		}
		void this.persistence?.startGame(room);
		this.io.to(room.code).emit('game:start', { round: room.round, phase: room.phase, drawerId: room.drawerId });
		this.sendWordOptions(room);
		this.broadcastRoom(room);
		this.broadcastRoundUpdate(room);
		return room;
	}

	rematch(roomCode: string, playerId: string) {
		const room = this.rooms.getRoom(roomCode);
		const player = this.rooms.getPlayer(room, playerId);
		if (player.id !== room.hostId) throw new GameError('Only the host can start a rematch.', 'NOT_HOST');
		if (room.phase !== 'FINISHED') throw new GameError('The current game must finish before a rematch.', 'GAME_STARTED');
		if (room.players.filter((candidate) => candidate.isConnected).length < 2) throw new GameError('At least two connected players are required.', 'NOT_ENOUGH_PLAYERS');

		room.phase = 'LOBBY';
		room.round = 0;
		room.drawerId = null;
		room.secretWord = null;
		room.wordOptions = [];
		if (room.wordChoiceTimer) clearTimeout(room.wordChoiceTimer);
		room.wordChoiceTimer = null;
		room.wordChoiceEndsAt = null;
		room.roundEndsAt = null;
		room.strokes = [];
		room.activeStrokes.clear();
		room.redoStrokes = [];
		room.correctGuessers.clear();
		room.roundScores.clear();
		for (const candidate of room.players) candidate.isReady = false;
		this.broadcastRoom(room);
		return room;
	}

	chooseWord(roomCode: string, playerId: string, word: string) {
		const room = this.rooms.getRoom(roomCode);
		this.assertDrawer(room, playerId, 'WORD_CHOICE');
		if (!isWordOption(word, room.wordOptions)) throw new GameError('Choose one of the words offered by the server.', 'INVALID_WORD');

		room.secretWord = room.wordOptions.find((option) => option.toLocaleLowerCase() === word.trim().toLocaleLowerCase()) ?? null;
		if (!room.secretWord) throw new GameError('That word is no longer available.', 'INVALID_WORD');
		if (room.wordChoiceTimer) clearTimeout(room.wordChoiceTimer);
		room.wordChoiceTimer = null;
		room.wordChoiceEndsAt = null;
		room.wordOptions = [];
		room.phase = 'DRAWING';
		room.roundStartedAt = Date.now();
		room.roundEndsAt = Date.now() + room.settings.drawTime * 1000;
		room.revealedHintIndexes = createHintIndexes(room.secretWord);
		room.correctGuessers.clear();
		room.guessHistory = [];
		room.strokes = [];
		room.activeStrokes.clear();
		room.redoStrokes = [];
		room.roundScores.clear();
		this.io.to(room.code).emit('round:chosen', { round: room.round, drawerId: room.drawerId! });
		this.emitRoundStarts(room);
		this.broadcastRoom(room);
		this.broadcastRoundUpdate(room);
		this.startTimers(room);
		return room;
	}

	guess(roomCode: string, playerId: string, text: string) {
		const room = this.rooms.getRoom(roomCode);
		const player = this.rooms.getPlayer(room, playerId);
		if (room.phase !== 'DRAWING' || player.id === room.drawerId) return;

		const result = this.scores.applyGuess(room, player, text);
		room.guessHistory.push({
			playerId: player.id,
			correct: result.kind === 'correct' || result.kind === 'duplicate',
			points: result.kind === 'correct' ? result.points : 0,
			guessedAt: Date.now(),
		});
		const correct = result.kind === 'correct' || result.kind === 'duplicate';
		const message = {
			id: `${Date.now()}-${player.id}`,
			playerId: player.id,
			playerName: player.name,
			text: result.kind === 'correct' ? `✓ Correct guess! +${result.points} points` : correct ? '✓ Correct guess!' : text,
			type: correct ? 'correct' as const : 'guess' as const,
			createdAt: Date.now(),
		};
		this.io.to(room.code).emit('chat:message', message);

		if (result.kind === 'correct') {
			this.io.to(room.code).emit('guess:correct', {
				playerId: player.id,
				playerName: player.name,
				points: result.points,
				drawerId: room.drawerId,
				drawerBonus: result.drawerBonus,
			});
			this.broadcastRoom(room);
			const guessers = room.players.filter((candidate) => candidate.isConnected && candidate.id !== room.drawerId);
			if (guessers.length > 0 && guessers.every((candidate) => room.correctGuessers.has(candidate.id))) {
				this.endRound(room, 'all-guessed');
			}
		}
	}

	addStrokeStart(roomCode: string, playerId: string, strokeId: string, input: Omit<StrokeInput, 'points'> & { point: StrokeInput['points'][number] }) {
		const room = this.rooms.getRoom(roomCode);
		this.assertDrawer(room, playerId, 'DRAWING');
		if (room.activeStrokes.has(strokeId)) throw new GameError('Stroke is already active.', 'INVALID_STROKE');
		const stroke = { id: strokeId, playerId, points: [input.point], color: input.color, size: input.size, tool: input.tool };
		room.activeStrokes.set(strokeId, stroke);
		room.redoStrokes = [];
		this.io.to(room.code).except(this.socketId(room, playerId)).emit('draw:start', { stroke });
	}

	addStrokePoints(roomCode: string, playerId: string, strokeId: string, points: StrokeInput['points']) {
		const room = this.rooms.getRoom(roomCode);
		this.assertDrawer(room, playerId, 'DRAWING');
		const stroke = room.activeStrokes.get(strokeId);
		if (!stroke || stroke.playerId !== playerId) throw new GameError('Active stroke not found.', 'INVALID_STROKE');
		if (stroke.points.length + points.length > config.maxStrokePoints) throw new GameError('Stroke has too many points.', 'INVALID_STROKE');
		stroke.points.push(...points);
		this.io.to(room.code).except(this.socketId(room, playerId)).emit('draw:move', { strokeId, points });
	}

	finishStroke(roomCode: string, playerId: string, strokeId: string) {
		const room = this.rooms.getRoom(roomCode);
		this.assertDrawer(room, playerId, 'DRAWING');
		const stroke = room.activeStrokes.get(strokeId);
		if (!stroke || stroke.playerId !== playerId) throw new GameError('Active stroke not found.', 'INVALID_STROKE');
		room.activeStrokes.delete(strokeId);
		room.strokes.push(stroke);
		this.io.to(room.code).except(this.socketId(room, playerId)).emit('draw:end', { strokeId });
	}

	clearCanvas(roomCode: string, playerId: string) {
		const room = this.rooms.getRoom(roomCode);
		this.assertDrawer(room, playerId, 'DRAWING');
		room.strokes = [];
		room.activeStrokes.clear();
		room.redoStrokes = [];
		this.io.to(room.code).emit('draw:clear');
	}

	undoCanvas(roomCode: string, playerId: string) {
		const room = this.rooms.getRoom(roomCode);
		this.assertDrawer(room, playerId, 'DRAWING');
		const removed = room.strokes.pop() ?? null;
		if (removed) room.redoStrokes.push(removed);
		this.io.to(room.code).emit('draw:undo', { strokeId: removed?.id ?? null });
		return removed;
	}

	redoCanvas(roomCode: string, playerId: string) {
		const room = this.rooms.getRoom(roomCode);
		this.assertDrawer(room, playerId, 'DRAWING');
		const stroke = room.redoStrokes.pop() ?? null;
		if (stroke) room.strokes.push(stroke);
		this.io.to(room.code).emit('draw:redo', { stroke });
		return stroke;
	}

	handlePlayerUnavailable(room: Room, playerId: string) {
		if (room.drawerId !== playerId) return;
		if (room.phase === 'DRAWING') {
			this.endRound(room, 'drawer-disconnected');
			return;
		}
		if (room.phase !== 'WORD_CHOICE') return;

		const connected = room.players.filter((player) => player.isConnected && player.id !== playerId);
		if (connected.length === 0) return;
		room.drawerId = connected[0].id;
		room.wordOptions = pickWordOptions(room.settings.difficulty);
		this.startWordChoiceTimer(room);
		this.sendWordOptions(room);
		this.broadcastRoom(room);
		this.broadcastRoundUpdate(room);
	}

	getRoundStartPayload(room: Room, player: Player): RoundStartPayload | null {
		if (room.phase !== 'DRAWING' || !room.secretWord || !room.roundEndsAt || !room.drawerId) return null;
		const shared = {
			round: room.round,
			drawerId: room.drawerId,
			serverTime: Date.now(),
			roundEndsAt: room.roundEndsAt,
		};
		if (player.id === room.drawerId) return { ...shared, role: 'drawer', word: room.secretWord };
		return { ...shared, role: 'guesser', maskedWord: this.maskedWord(room) };
	}

	resendPrivateState(room: Room, player: Player) {
		if (player.socketId && room.phase === 'WORD_CHOICE' && player.id === room.drawerId) {
			this.io.to(player.socketId).emit('word:options', { options: [...room.wordOptions], selectionEndsAt: room.wordChoiceEndsAt });
		}
		const roundStart = this.getRoundStartPayload(room, player);
		if (roundStart && player.socketId) this.io.to(player.socketId).emit('round:start', roundStart);
	}

	private assertDrawer(room: Room, playerId: string, phase: 'WORD_CHOICE' | 'DRAWING') {
		if (room.phase !== phase) throw new GameError('This action is not allowed in the current game phase.', 'INVALID_PHASE');
		if (room.drawerId !== playerId) throw new GameError('Only the current drawer can do that.', 'NOT_DRAWER');
		const player = this.rooms.getPlayer(room, playerId);
		if (!player.isConnected) throw new GameError('Player is disconnected.', 'PLAYER_DISCONNECTED');
	}

	private sendWordOptions(room: Room) {
		const drawer = room.players.find((player) => player.id === room.drawerId);
		if (drawer?.socketId) this.io.to(drawer.socketId).emit('word:options', { options: [...room.wordOptions], selectionEndsAt: room.wordChoiceEndsAt });
	}

	private startWordChoiceTimer(room: Room) {
		if (room.wordChoiceTimer) clearTimeout(room.wordChoiceTimer);
		room.wordChoiceEndsAt = Date.now() + 15_000;
		room.wordChoiceTimer = setTimeout(() => {
			room.wordChoiceTimer = null;
			if (room.phase === 'WORD_CHOICE' && room.drawerId && room.wordOptions.length > 0) {
				this.chooseWord(room.code, room.drawerId, room.wordOptions[0]);
			}
		}, 15_000);
		room.wordChoiceTimer.unref();
	}

	private emitRoundStarts(room: Room) {
		for (const player of room.players) {
			if (!player.isConnected || !player.socketId) continue;
			const payload = this.getRoundStartPayload(room, player);
			if (payload) this.io.to(player.socketId).emit('round:start', payload);
		}
	}

	private startTimers(room: Room) {
		this.clearRoundTimers(room);
		room.roundTimer = setTimeout(() => this.endRound(room, 'time'), room.settings.drawTime * 1000);
		room.roundTimer.unref();
		room.tickTimer = setInterval(() => {
			if (!room.roundEndsAt || room.roundEndsAt <= Date.now()) {
				this.endRound(room, 'time');
				return;
			}
			this.broadcastRoundUpdate(room);
		}, 1000);
		room.tickTimer.unref();
	}

	private endRound(room: Room, reason: string) {
		if (room.phase !== 'DRAWING') return;
		this.clearRoundTimers(room);
		room.phase = 'ROUND_END';
		room.roundEndsAt = null;
		room.activeStrokes.clear();
		const topEntry = [...room.roundScores.entries()].sort((left, right) => right[1] - left[1])[0];
		const topPlayer = topEntry ? room.players.find((player) => player.id === topEntry[0]) : null;
		const nextRoundAt = Date.now() + 2200;
		if (topPlayer) topPlayer.roundsWon += 1;
		if (room.drawerId) room.drawingCounts.set(room.drawerId, (room.drawingCounts.get(room.drawerId) ?? 0) + 1);
		this.io.to(room.code).emit('round:end', {
			round: room.round,
			reason,
			word: room.secretWord ?? '',
			drawerId: room.drawerId,
			drawerBonus: room.correctGuessers.size * 50,
			topGuesser: topEntry && topPlayer ? { playerId: topPlayer.id, playerName: topPlayer.name, points: topEntry[1] } : null,
			nextRoundAt,
		});
		void this.persistence?.saveRound(room);
		this.broadcastRoom(room);
		room.transitionTimer = setTimeout(() => { void this.advance(room); }, Math.max(0, nextRoundAt - Date.now()));
		room.transitionTimer.unref();
	}

	private async advance(room: Room) {
		room.transitionTimer = null;
		if (room.phase !== 'ROUND_END') return;
		if (room.round >= room.settings.rounds) {
			room.phase = 'FINISHED';
			room.drawerId = null;
			room.secretWord = null;
			room.wordOptions = [];
			await this.persistence?.finishGame(room);
			this.io.to(room.code).emit('game:end', { players: this.rooms.snapshot(room).players });
			this.broadcastRoom(room);
			return;
		}

		room.round += 1;
		room.phase = 'WORD_CHOICE';
		room.secretWord = null;
		room.wordOptions = pickWordOptions(room.settings.difficulty);
		this.startWordChoiceTimer(room);
		room.roundStartedAt = null;
		room.revealedHintIndexes = [];
		room.roundEndsAt = null;
		room.strokes = [];
		room.activeStrokes.clear();
		room.redoStrokes = [];
		room.correctGuessers.clear();
		room.guessHistory = [];
		room.roundScores.clear();
		room.drawerId = this.nextDrawer(room);
		if (!room.drawerId) {
			room.phase = 'FINISHED';
			await this.persistence?.finishGame(room);
			this.io.to(room.code).emit('game:end', { players: this.rooms.snapshot(room).players });
			this.broadcastRoom(room);
			return;
		}
		this.io.to(room.code).emit('game:start', { round: room.round, phase: room.phase, drawerId: room.drawerId });
		this.sendWordOptions(room);
		this.broadcastRoom(room);
		this.broadcastRoundUpdate(room);
	}

	private nextDrawer(room: Room) {
		const connected = room.players.filter((player) => player.isConnected);
		if (connected.length === 0) return null;
		const previousIndex = connected.findIndex((player) => player.id === room.drawerId);
		return connected[(previousIndex + 1 + connected.length) % connected.length].id;
	}

	private maskedWord(room: Room) {
		if (!room.secretWord || !room.roundEndsAt) return '';
		const elapsedSeconds = Math.max(0, room.settings.drawTime - Math.ceil((room.roundEndsAt - Date.now()) / 1000));
		return maskWord(room.secretWord, elapsedSeconds, room.settings.hints, room.revealedHintIndexes);
	}

	private broadcastRoundUpdate(room: Room) {
		this.io.to(room.code).emit('round:update', {
			phase: room.phase,
			round: room.round,
			drawerId: room.drawerId,
			wordChoiceEndsAt: room.wordChoiceEndsAt,
			serverTime: Date.now(),
			roundEndsAt: room.roundEndsAt,
			maskedWord: this.maskedWord(room),
		});
	}

	private broadcastRoom(room: Room) {
		const snapshot = this.rooms.snapshot(room);
		for (const player of room.players) {
			if (player.isConnected && player.socketId) {
				this.io.to(player.socketId).emit('room:update', { room: snapshot, yourPlayerId: player.id });
			}
		}
	}

	private socketId(room: Room, playerId: string) {
		const player = this.rooms.getPlayer(room, playerId);
		if (!player.socketId) throw new GameError('Player is disconnected.', 'PLAYER_DISCONNECTED');
		return player.socketId;
	}

	private clearRoundTimers(room: Room) {
		if (room.roundTimer) clearTimeout(room.roundTimer);
		if (room.tickTimer) clearInterval(room.tickTimer);
		room.roundTimer = null;
		room.tickTimer = null;
	}
}