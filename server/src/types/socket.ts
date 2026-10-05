import type { GamePhase, GameSettings, Point, PublicPlayer, RoomSnapshot, RoomVisibility, Stroke, StrokeInput } from './game.js';

export interface SocketData {
	sessionId: string;
	roomCode?: string;
	playerId?: string;
}

export interface ClientToServerEvents {
	'room:create': (payload: { name: string; profileId?: string; roomName?: string; visibility?: RoomVisibility; settings: GameSettings }) => void;
	'room:join': (payload: { roomCode: string; name: string; profileId?: string; sessionId: string }) => void;
	'room:reconnect': (payload: { roomCode: string; sessionId: string }) => void;
	'room:leave': () => void;
	'room:update-settings': (payload: { settings: GameSettings }) => void;
	'player:ready': (payload: { isReady: boolean }) => void;
	'game:start': () => void;
	'game:rematch': () => void;
	'round:choose-word': (payload: { word: string }) => void;
	'draw:start': (payload: { strokeId: string; point: Point; color: string; size: number; tool: StrokeInput['tool'] }) => void;
	'draw:move': (payload: { strokeId: string; points: Point[] }) => void;
	'draw:end': (payload: { strokeId: string }) => void;
	'draw:clear': () => void;
	'draw:undo': () => void;
	'draw:redo': () => void;
	'chat:send': (payload: { text: string }) => void;
}

export interface ServerToClientEvents {
	'room:created': (payload: RoomMembershipPayload) => void;
	'room:joined': (payload: RoomMembershipPayload) => void;
	'room:reconnected': (payload: RoomMembershipPayload) => void;
	'room:update': (payload: RoomMembershipPayload) => void;
	'player:joined': (payload: { player: PublicPlayer }) => void;
	'player:left': (payload: { playerId: string }) => void;
	'host:changed': (payload: { hostId: string }) => void;
	'game:start': (payload: { round: number; phase: GamePhase; drawerId: string }) => void;
	'word:options': (payload: { options: string[]; selectionEndsAt: number | null }) => void;
	'round:chosen': (payload: { round: number; drawerId: string }) => void;
	'round:start': (payload: RoundStartPayload) => void;
	'round:update': (payload: RoundUpdatePayload) => void;
	'round:end': (payload: {
		round: number;
		reason: string;
		word: string;
		drawerId: string | null;
		drawerBonus: number;
		topGuesser: { playerId: string; playerName: string; points: number } | null;
		nextRoundAt: number;
	}) => void;
	'game:end': (payload: { players: PublicPlayer[] }) => void;
	'draw:start': (payload: { stroke: Stroke }) => void;
	'draw:move': (payload: { strokeId: string; points: Point[] }) => void;
	'draw:end': (payload: { strokeId: string }) => void;
	'draw:clear': () => void;
	'draw:undo': (payload: { strokeId: string | null }) => void;
	'draw:redo': (payload: { stroke: Stroke | null }) => void;
	'chat:message': (payload: ChatMessagePayload) => void;
	'guess:correct': (payload: { playerId: string; playerName: string; points: number; drawerId: string | null; drawerBonus: number }) => void;
	'error': (payload: { code: string; message: string }) => void;
}

export interface RoomMembershipPayload {
	room: RoomSnapshot;
	yourPlayerId: string;
}

export type RoundStartPayload = {
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

export interface RoundUpdatePayload {
	phase: GamePhase;
	round: number;
	drawerId: string | null;
	serverTime: number;
	roundEndsAt: number | null;
	wordChoiceEndsAt: number | null;
	maskedWord: string;
}

export interface ChatMessagePayload {
	id: string;
	playerId: string;
	playerName: string;
	text: string;
	type: 'guess' | 'correct' | 'system';
	createdAt: number;
}

export interface InterServerEvents {}