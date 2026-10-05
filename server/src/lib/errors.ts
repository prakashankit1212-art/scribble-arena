export class GameError extends Error {
	constructor(message: string, readonly code = 'GAME_ERROR') {
		super(message);
		this.name = 'GameError';
	}
}