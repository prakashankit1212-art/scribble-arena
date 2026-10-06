import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, GameSettings, Phase, Player, RoomState, RoundSummary, ScoreFeedback, Screen, Stroke } from '../types/game';
import { getGameSocket, getProfileId, getSessionId, getStoredRoomCode, storeRoomCode, type GameSocket, type RoundStart } from '../services/socket';
export function useGame(name: string, initialSettings: GameSettings, setScreen: (screen: Screen) => void) {
	const [room, setRoom] = useState<RoomState | null>(null);
	const [yourPlayerId, setYourPlayerId] = useState<string | null>(null);
	const [drawerId, setDrawerId] = useState<string | null>(null);
	const [phase, setPhase] = useState<Phase>('lobby');
	const [round, setRound] = useState(0);
	const [word, setWord] = useState('');
	const [options, setOptions] = useState<string[]>([]);
	const [time, setTime] = useState(initialSettings.drawTime);
	const [deadline, setDeadline] = useState<number | null>(null);
	const [choiceDeadline, setChoiceDeadline] = useState<number | null>(null);
	const [choiceTime, setChoiceTime] = useState(0);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [strokes, setStrokes] = useState<Stroke[]>([]);
	const [canRedo, setCanRedo] = useState(false);
	const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(null);
	const [scoreFeedback, setScoreFeedback] = useState<ScoreFeedback[]>([]);
	const [isConnected, setIsConnected] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('reconnecting');
	const [pending, setPending] = useState<'create' | 'join' | 'start' | null>(null);
	const [error, setError] = useState<string | null>(null);
	const socketRef = useRef<GameSocket | null>(null);
	const playerIdRef = useRef<string | null>(null);

	useEffect(() => {
		let socket: GameSocket;
		try {
			socket = getGameSocket();
		} catch (connectionError) {
			setError(connectionError instanceof Error ? connectionError.message : 'Unable to connect to the game server.');
			return;
		}
		socketRef.current = socket;

		const applyRoom = (nextRoom: RoomState, nextPlayerId: string) => {
			setRoom(nextRoom);
			setYourPlayerId(nextPlayerId);
			playerIdRef.current = nextPlayerId;
			setDrawerId(nextRoom.drawerId);
			setRound(nextRoom.round);
			setPhase(toClientPhase(nextRoom.phase));
			setStrokes(nextRoom.strokes);
			if (nextRoom.roundEndsAt) {
				setDeadline(Date.now() + Math.max(0, nextRoom.roundEndsAt - Date.now()));
			} else {
				setDeadline(null);
			}
		};

		const onMembership = (payload: { room: RoomState; yourPlayerId: string }) => {
			applyRoom(payload.room, payload.yourPlayerId);
			storeRoomCode(payload.room.code);
			setPending(null);
			setError(null);
			setScreen(payload.room.phase === 'LOBBY' ? 'lobby' : payload.room.phase === 'FINISHED' ? 'results' : 'game');
		};
		const onConnect = () => {
			setIsConnected(true);
			setConnectionStatus('connected');
			setError(null);
			const roomCode = getStoredRoomCode();
			if (roomCode) socket.emit('room:reconnect', { roomCode, sessionId: getSessionId() });
		};
		const onDisconnect = () => {
			setIsConnected(false);
			setConnectionStatus(socket.active ? 'reconnecting' : 'disconnected');
		};
		const onConnectError = () => {
			setIsConnected(false);
			setConnectionStatus(socket.active ? 'reconnecting' : 'disconnected');
			setPending(null);
			setError('Could not reach the game server. Check that the backend is running.');
		};
		const onRoomUpdate = (payload: { room: RoomState; yourPlayerId: string }) => {
			applyRoom(payload.room, payload.yourPlayerId);
			setPending(null);
			setScreen(payload.room.phase === 'LOBBY' ? 'lobby' : payload.room.phase === 'FINISHED' ? 'results' : 'game');
		};
		const onGameStart = (payload: { round: number; phase: RoomState['phase']; drawerId: string }) => {
			setRound(payload.round);
			setDrawerId(payload.drawerId);
			setPhase('word-choice');
			setWord('');
			setOptions([]);
			setRoundSummary(null);
			setScreen('game');
		};
		const onWordOptions = (payload: { options: string[]; selectionEndsAt: number | null }) => {
			setOptions(payload.options);
			setChoiceDeadline(payload.selectionEndsAt ? Date.now() + Math.max(0, payload.selectionEndsAt - Date.now()) : null);
		};
		const onRoundChosen = () => setPhase('drawing');
		const onRoundStart = (payload: RoundStart) => {
			const remaining = Math.max(0, payload.roundEndsAt - payload.serverTime);
			setRound(payload.round);
			setDrawerId(payload.drawerId);
			setPhase('drawing');
			setWord(payload.role === 'drawer' ? payload.word : payload.maskedWord);
			setOptions([]);
			setDeadline(Date.now() + remaining);
			setTime(Math.ceil(remaining / 1000));
			setScreen('game');
		};
		const onRoundUpdate = (payload: { phase: RoomState['phase']; round: number; drawerId: string | null; serverTime: number; roundEndsAt: number | null; wordChoiceEndsAt: number | null; maskedWord: string }) => {
			setRound(payload.round);
			setDrawerId(payload.drawerId);
			setPhase(toClientPhase(payload.phase));
			setChoiceDeadline(payload.wordChoiceEndsAt ? Date.now() + Math.max(0, payload.wordChoiceEndsAt - payload.serverTime) : null);
			if (payload.roundEndsAt) {
				const remaining = Math.max(0, payload.roundEndsAt - payload.serverTime);
				setDeadline(Date.now() + remaining);
				setTime(Math.ceil(remaining / 1000));
				if (playerIdRef.current !== payload.drawerId) setWord(payload.maskedWord);
			} else {
				setDeadline(null);
			}
		};
		const onRoundEnd = (summary: RoundSummary) => {
			setRoundSummary(summary);
			setWord(summary.word);
			setPhase('round-end');
			setDeadline(null);
			setTime(0);
		};
		const onGameEnd = () => {
			setPhase('finished');
			setScreen('results');
		};
		const onChatMessage = (message: ChatMessage) => setMessages((current) => [...current, message]);
		const onGuessCorrect = (payload: { playerId: string; playerName: string; points: number; drawerId: string | null; drawerBonus: number }) => {
			const feedback = [{ id: window.crypto.randomUUID(), playerId: payload.playerId, points: payload.points, drawerBonus: 0 }];
			if (payload.drawerId && payload.drawerBonus > 0) {
				feedback.push({ id: window.crypto.randomUUID(), playerId: payload.drawerId, points: 0, drawerBonus: payload.drawerBonus });
			}
			setScoreFeedback((current) => [...current, ...feedback]);
			const feedbackIds = new Set<string>(feedback.map((entry) => entry.id));
			window.setTimeout(() => setScoreFeedback((current) => current.filter((entry) => !feedbackIds.has(entry.id))), 1800);
		};
		const onDrawStart = (payload: { stroke: Stroke }) => {
			setStrokes((current) => current.some((stroke) => stroke.id === payload.stroke.id) ? current : [...current, payload.stroke]);
		};
		const onDrawMove = (payload: { strokeId: string; points: Stroke['points'] }) => {
			setStrokes((current) => current.map((stroke) => stroke.id === payload.strokeId
				? { ...stroke, points: [...stroke.points, ...payload.points] }
				: stroke));
		};
		const onDrawClear = () => setStrokes([]);
		const onDrawUndo = (payload: { strokeId: string | null }) => {
			if (!payload.strokeId) return;
			setStrokes((current) => current.filter((stroke) => stroke.id !== payload.strokeId));
			setCanRedo(true);
		};
		const onDrawRedo = (payload: { stroke: Stroke | null }) => {
			if (!payload.stroke) return;
			setStrokes((current) => current.some((stroke) => stroke.id === payload.stroke?.id) ? current : [...current, payload.stroke!]);
			setCanRedo(false);
		};
		const onError = (payload: { code: string; message: string }) => {
			setPending(null);
			if (!room && (payload.code === 'ROOM_NOT_FOUND' || payload.code === 'RECONNECT_NOT_FOUND')) storeRoomCode(null);
			setError(humanizeError(payload.code, payload.message));
		};

		socket.on('connect', onConnect);
		socket.on('disconnect', onDisconnect);
		socket.on('connect_error', onConnectError);
		socket.on('room:created', onMembership);
		socket.on('room:joined', onMembership);
		socket.on('room:reconnected', onMembership);
		socket.on('room:update', onRoomUpdate);
		socket.on('game:start', onGameStart);
		socket.on('word:options', onWordOptions);
		socket.on('round:chosen', onRoundChosen);
		socket.on('round:start', onRoundStart);
		socket.on('round:update', onRoundUpdate);
		socket.on('round:end', onRoundEnd);
		socket.on('game:end', onGameEnd);
		socket.on('chat:message', onChatMessage);
		socket.on('draw:start', onDrawStart);
		socket.on('draw:move', onDrawMove);
		socket.on('draw:clear', onDrawClear);
		socket.on('draw:undo', onDrawUndo);
		socket.on('draw:redo', onDrawRedo);
		socket.on('guess:correct', onGuessCorrect);
		socket.on('error', onError);
		socket.connect();

		return () => {
			socket.off('connect', onConnect);
			socket.off('disconnect', onDisconnect);
			socket.off('connect_error', onConnectError);
			socket.off('room:created', onMembership);
			socket.off('room:joined', onMembership);
			socket.off('room:reconnected', onMembership);
			socket.off('room:update', onRoomUpdate);
			socket.off('game:start', onGameStart);
			socket.off('word:options', onWordOptions);
			socket.off('round:chosen', onRoundChosen);
			socket.off('round:start', onRoundStart);
			socket.off('round:update', onRoundUpdate);
			socket.off('round:end', onRoundEnd);
			socket.off('game:end', onGameEnd);
			socket.off('chat:message', onChatMessage);
			socket.off('draw:start', onDrawStart);
			socket.off('draw:move', onDrawMove);
			socket.off('draw:clear', onDrawClear);
			socket.off('draw:undo', onDrawUndo);
			socket.off('draw:redo', onDrawRedo);
			socket.off('guess:correct', onGuessCorrect);
			socket.off('error', onError);
			socket.disconnect();
			socketRef.current = null;
		};
	}, [setScreen]);

	useEffect(() => {
		if (!deadline) return;
		const timer = window.setInterval(() => setTime(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 200);
		return () => window.clearInterval(timer);
	}, [deadline]);

	useEffect(() => {
		if (!choiceDeadline) {
			setChoiceTime(0);
			return;
		}
		const update = () => setChoiceTime(Math.max(0, Math.ceil((choiceDeadline - Date.now()) / 1000)));
		update();
		const timer = window.setInterval(update, 200);
		return () => window.clearInterval(timer);
	}, [choiceDeadline]);

	const players = room?.players
		.map((player) => ({ ...player, isDrawer: player.id === drawerId }))
		.sort((left, right) => Number(right.id === yourPlayerId) - Number(left.id === yourPlayerId)) ?? [];
	const settings = room?.settings ?? initialSettings;

	function emit(event: Parameters<GameSocket['emit']>[0], ...args: unknown[]) {
		const socket = socketRef.current;
		if (!socket?.connected) {
			setError('The game server is disconnected. Reconnecting now.');
			return false;
		}
		setError(null);
		const send = socket.emit.bind(socket) as unknown as (eventName: string, ...payload: unknown[]) => void;
		send(event as string, ...args);
		return true;
	}

	function createRoom(nextSettings: GameSettings, roomDetails: { name?: string; visibility?: RoomState['visibility'] } = {}) {
		if (emit('room:create', { name: name.trim(), profileId: getProfileId(), roomName: roomDetails.name, visibility: roomDetails.visibility, settings: nextSettings })) setPending('create');
	}

	function joinRoom(roomCode: string) {
		if (emit('room:join', { roomCode: roomCode.trim().toUpperCase(), name: name.trim(), profileId: getProfileId(), sessionId: getSessionId() })) setPending('join');
	}

	function leaveRoom() {
		socketRef.current?.emit('room:leave');
		storeRoomCode(null);
		setRoom(null);
		setYourPlayerId(null);
		playerIdRef.current = null;
		setDrawerId(null);
		setPhase('lobby');
		setScreen('home');
	}

	function updateSettings(nextSettings: GameSettings) {
		emit('room:update-settings', { settings: nextSettings });
	}

	function startGame() {
		if (emit('game:start')) setPending('start');
	}

	function requestRematch() {
		if (emit('game:rematch')) setPending('start');
	}

	function chooseWord(selectedWord: string) {
		emit('round:choose-word', { word: selectedWord });
	}

	function sendGuess(text: string) {
		emit('chat:send', { text });
	}

	function drawStroke(stroke: Stroke) {
		const socket = socketRef.current;
		const points = stroke.points.slice(0, 300);
		if (!socket?.connected || points.length < 2) return;
		setCanRedo(false);
		const strokeId = window.crypto.randomUUID();
		socket.emit('draw:start', { strokeId, point: points[0], color: stroke.color, size: stroke.size, tool: stroke.tool });
		for (let index = 1; index < points.length; index += 60) {
			socket.emit('draw:move', { strokeId, points: points.slice(index, index + 60) });
		}
		socket.emit('draw:end', { strokeId });
		setStrokes((current) => [...current, { ...stroke, id: strokeId, playerId: yourPlayerId ?? undefined, points }]);
	}

	function clearCanvas() {
		emit('draw:clear');
		setStrokes([]);
		setCanRedo(false);
	}

	function undoCanvas() {
		emit('draw:undo');
	}

	function redoCanvas() {
		emit('draw:redo');
	}

	function setReady(isReady: boolean) {
		emit('player:ready', { isReady });
	}

	function dismissError() {
		setError(null);
	}

	return {
		room,
		players,
		yourPlayerId,
		drawerId,
		settings,
		round,
		phase,
		word,
		options,
		time,
		choiceTime,
		messages,
		strokes,
		canRedo,
		roundSummary,
		scoreFeedback,
		isConnected,
		connectionStatus,
		pending,
		error,
		createRoom,
		joinRoom,
		leaveRoom,
		updateSettings,
		startGame,
		requestRematch,
		chooseWord,
		sendGuess,
		drawStroke,
		clearCanvas,
		undoCanvas,
		redoCanvas,
		setReady,
		dismissError,
	};
}

function humanizeError(code: string, fallback: string) {
	const messages: Record<string, string> = {
		ROOM_NOT_FOUND: 'That room code was not found.',
		ROOM_FULL: 'That room is full.',
		GAME_STARTED: 'This game has already started.',
		NOT_HOST: 'Only the host can change that.',
		NOT_DRAWER: 'Only the current drawer can do that.',
		INVALID_WORD: 'Choose one of the offered words.',
		INVALID_SETTINGS: 'Those game settings are not valid.',
		RATE_LIMITED: 'You are doing that too quickly. Try again in a moment.',
		RECONNECT_NOT_FOUND: 'Your previous room session could not be restored.',
	};
	return messages[code] ?? fallback;
}

function toClientPhase(phase: RoomState['phase']): Phase {
	const phases: Record<RoomState['phase'], Phase> = {
		LOBBY: 'lobby',
		WORD_CHOICE: 'word-choice',
		DRAWING: 'drawing',
		ROUND_END: 'round-end',
		FINISHED: 'finished',
	};
	return phases[phase];
}
