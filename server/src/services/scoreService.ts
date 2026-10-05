import type { Player, Room } from '../types/game.js';
import { normalizeWord } from './wordService.js';

export type GuessResult =
	| { kind: 'ignored' }
	| { kind: 'incorrect' }
	| { kind: 'duplicate' }
	| { kind: 'correct'; points: number; drawerBonus: number };

export class ScoreService {
	applyGuess(room: Room, player: Player, guess: string): GuessResult {
		if (room.phase !== 'DRAWING' || player.id === room.drawerId || !room.secretWord || !room.roundEndsAt) {
			return { kind: 'ignored' };
		}
		if (normalizeWord(guess) !== normalizeWord(room.secretWord)) return { kind: 'incorrect' };
		if (room.correctGuessers.has(player.id)) return { kind: 'duplicate' };

		const startedAt = room.roundEndsAt - room.settings.drawTime * 1000;
		const elapsedMs = Math.max(0, Date.now() - startedAt);
		const elapsedSeconds = Math.floor(elapsedMs / 1000);
		const points = Math.max(100, 700 - elapsedSeconds * 10);
		player.score += points;
		player.correctGuesses += 1;
		player.fastestGuessMs = player.fastestGuessMs === null ? elapsedMs : Math.min(player.fastestGuessMs, elapsedMs);
		room.correctGuessers.add(player.id);
		room.roundScores.set(player.id, points);

		const drawer = room.players.find((candidate) => candidate.id === room.drawerId);
		const drawerBonus = drawer ? 50 : 0;
		if (drawer) drawer.score += drawerBonus;

		return { kind: 'correct', points, drawerBonus };
	}
}