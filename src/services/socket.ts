import { io, type Socket } from 'socket.io-client';
import type { GameSettings, Player, Point, RoomState, RoundSummary, Stroke } from '../types/game';

type ClientToServerEvents = {
	'room:create': (payload: { name: string; settings: GameSettings }) => void;
	'room:join': (payload: { roomCode: string; name: string; sessionId: string }) => void;
	'room:reconnect': (payload: { roomCode: string; sessionId: string }) => void;
	'room:leave': () => void;
	'room:update-settings': (payload: { settings: GameSettings }) => void;
	'player:ready': (payload: { isReady: boolean }) => void;
	'game:start': () => void;
	'game:rematch': () => void;
	'round:choose-word': (payload: { word: string }) => void;
	'draw:start': (payload: { strokeId: string; point: Point; color: string; size: number; tool: Stroke['tool'] }) => void;
	'draw:move': (payload: { strokeId: string; points: Point[] }) => void;
	'draw:end': (payload: { strokeId: string }) => void;
	'draw:clear': () => void;
	'draw:undo': () => void;
	'draw:redo': () => void;
	'chat:send': (payload: { text: string }) => void;
};

export type RoundStart = {
	round: number;
	drawerId: string;
	serverTime: number;
	roundEndsAt: number;
	role: 'drawer';
	word: string;
} | {
	round: number;
	drawerId: string;
	serverTime: number;
	roundEndsAt: number;
	role: 'guesser';
	maskedWord: string;
};

type ServerToClientEvents = {
	'room:created': (payload: { room: RoomState; yourPlayerId: string }) => void;
	'room:joined': (payload: { room: RoomState; yourPlayerId: string }) => void;
	'room:reconnected': (payload: { room: RoomState; yourPlayerId: string }) => void;
	'room:update': (payload: { room: RoomState; yourPlayerId: string }) => void;
	'player:joined': (payload: { player: Player }) => void;
	'player:left': (payload: { playerId: string }) => void;
	'host:changed': (payload: { hostId: string }) => void;
	'game:start': (payload: { round: number; phase: RoomState['phase']; drawerId: string }) => void;
	'word:options': (payload: { options: string[]; selectionEndsAt: number | null }) => void;
	'round:chosen': (payload: { round: number; drawerId: string }) => void;
	'round:start': (payload: RoundStart) => void;
	'round:update': (payload: { phase: RoomState['phase']; round: number; drawerId: string | null; serverTime: number; roundEndsAt: number | null; wordChoiceEndsAt: number | null; maskedWord: string }) => void;
	'round:end': (payload: RoundSummary) => void;
	'game:end': (payload: { players: Player[] }) => void;
	'draw:start': (payload: { stroke: Stroke }) => void;
	'draw:move': (payload: { strokeId: string; points: Point[] }) => void;
	'draw:end': (payload: { strokeId: string }) => void;
	'draw:clear': () => void;
	'draw:undo': (payload: { strokeId: string | null }) => void;
	'draw:redo': (payload: { stroke: Stroke | null }) => void;
	'chat:message': (payload: { id: string; playerId: string; playerName: string; text: string; type: ChatMessageType; createdAt: number }) => void;
	'guess:correct': (payload: { playerId: string; playerName: string; points: number; drawerId: string | null; drawerBonus: number }) => void;
	'error': (payload: { code: string; message: string }) => void;
};

type ChatMessageType = 'guess' | 'correct' | 'system';
export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SESSION_KEY = 'scribble-arena:session-id';
const TAB_KEY = 'scribble-arena:tab-id';
const ROOM_KEY = 'scribble-arena:room-code';
let socket: GameSocket | null = null;

export function getSessionId() {
	let tabId = window.sessionStorage.getItem(TAB_KEY);
	if (!tabId) {
		tabId = window.crypto.randomUUID();
		window.sessionStorage.setItem(TAB_KEY, tabId);
	}
	const tabSessionKey = `${SESSION_KEY}:${tabId}`;
	let sessionId = window.localStorage.getItem(tabSessionKey);
	const sessionAlreadyUsed = sessionId !== null && Object.entries(window.localStorage).some(([key, value]) =>
		key.startsWith(`${SESSION_KEY}:`) && key !== tabSessionKey && value === sessionId,
	);
	if (!sessionId || sessionAlreadyUsed) {
		sessionId = window.crypto.randomUUID();
		window.localStorage.setItem(tabSessionKey, sessionId);
	}
	window.localStorage.removeItem(SESSION_KEY);
	return sessionId;
}

export function getStoredRoomCode() {
	return window.sessionStorage.getItem(ROOM_KEY);
}

export function storeRoomCode(code: string | null) {
	if (code) window.sessionStorage.setItem(ROOM_KEY, code);
	else window.sessionStorage.removeItem(ROOM_KEY);
}

export function getGameSocket() {
	if (!socket) {
		const serverUrl = import.meta.env.VITE_SERVER_URL;
		if (!serverUrl) throw new Error('VITE_SERVER_URL is required to connect to the game server.');
		socket = io(serverUrl, { autoConnect: false }) as GameSocket;
	}
	socket.auth = { sessionId: getSessionId() };
	return socket;
}