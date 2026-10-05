export type GamePhase = 'LOBBY' | 'WORD_CHOICE' | 'DRAWING' | 'ROUND_END' | 'FINISHED';
export type Difficulty = 'easy' | 'mixed' | 'hard';
export type DrawingTool = 'pen' | 'eraser';
export type RoomVisibility = 'PRIVATE' | 'PUBLIC';

export interface GameSettings {
	rounds: number;
	drawTime: number;
	maxPlayers: number;
	hints: boolean;
	difficulty: Difficulty;
}

export interface Point {
	x: number;
	y: number;
}

export interface Stroke {
	id: string;
	points: Point[];
	color: string;
	size: number;
	tool: DrawingTool;
	playerId: string;
}

export interface Player {
	id: string;
	sessionId: string;
	profileId: string;
	name: string;
	avatar: string;
	color: string;
	score: number;
	isHost: boolean;
	isReady: boolean;
	isConnected: boolean;
	correctGuesses: number;
	roundsWon: number;
	fastestGuessMs: number | null;
	joinedAt: number;
	socketId: string | null;
}

export interface PublicPlayer extends Omit<Player, 'sessionId' | 'socketId'> {}

export interface Room {
	code: string;
	name: string;
	visibility: RoomVisibility;
	hostId: string;
	players: Player[];
	settings: GameSettings;
	phase: GamePhase;
	round: number;
	drawerId: string | null;
	secretWord: string | null;
	wordOptions: string[];
	wordChoiceEndsAt: number | null;
	wordChoiceTimer: ReturnType<typeof setTimeout> | null;
	revealedHintIndexes: number[];
	roundStartedAt: number | null;
	roundEndsAt: number | null;
	strokes: Stroke[];
	activeStrokes: Map<string, Stroke>;
	redoStrokes: Stroke[];
	roundScores: Map<string, number>;
	correctGuessers: Set<string>;
	guessHistory: { playerId: string; correct: boolean; points: number; guessedAt: number }[];
	drawingCounts: Map<string, number>;
	createdAt: number;
	roundTimer: ReturnType<typeof setTimeout> | null;
	tickTimer: ReturnType<typeof setInterval> | null;
	transitionTimer: ReturnType<typeof setTimeout> | null;
	disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
}

export interface RoomSnapshot {
	code: string;
	name: string;
	visibility: RoomVisibility;
	hostId: string;
	players: PublicPlayer[];
	settings: GameSettings;
	phase: GamePhase;
	round: number;
	drawerId: string | null;
	wordChoiceEndsAt: number | null;
	roundEndsAt: number | null;
	strokes: Stroke[];
}

export interface StrokeInput {
	points: Point[];
	color: string;
	size: number;
	tool: DrawingTool;
}