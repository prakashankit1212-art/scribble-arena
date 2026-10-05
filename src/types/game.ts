export type Screen = 'home' | 'lobby' | 'game' | 'results';
export type Phase = 'lobby' | 'word-choice' | 'drawing' | 'round-end' | 'finished';
export type ServerPhase = 'LOBBY' | 'WORD_CHOICE' | 'DRAWING' | 'ROUND_END' | 'FINISHED';

export interface GameSettings {
	rounds: number;
	drawTime: number;
	maxPlayers: number;
	hints: boolean;
	difficulty: 'easy' | 'mixed' | 'hard';
}

export interface Player {
	id: string;
	name: string;
	avatar: string;
	color: string;
	score: number;
	isHost?: boolean;
	isReady?: boolean;
	isDrawer?: boolean;
	isConnected?: boolean;
	joinedAt?: number;
	correctGuesses?: number;
	roundsWon?: number;
	fastestGuessMs?: number | null;
}

export interface ChatMessage {
	id: string;
	playerId: string;
	playerName: string;
	text: string;
	type: 'guess' | 'system' | 'correct';
	points?: number;
	createdAt?: number;
}

export interface RoundSummary {
	round: number;
	reason: string;
	word: string;
	drawerId: string | null;
	drawerBonus: number;
	topGuesser: { playerId: string; playerName: string; points: number } | null;
	nextRoundAt: number;
}

export interface ScoreFeedback {
	id: string;
	playerId: string;
	points: number;
	drawerBonus: number;
}

export interface Point {
	x: number;
	y: number;
}

export interface Stroke {
	id?: string;
	playerId?: string;
	points: Point[];
	color: string;
	size: number;
	tool: 'pen' | 'eraser';
}

export interface RoomState {
	code: string;
	hostId: string;
	players: Player[];
	settings: GameSettings;
	phase: ServerPhase;
	round: number;
	drawerId: string | null;
	wordChoiceEndsAt: number | null;
	roundEndsAt: number | null;
	strokes: Stroke[];
}
