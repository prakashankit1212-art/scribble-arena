import type { Difficulty } from '../types/game.js';

const WORD_BANK: Record<Difficulty, string[]> = {
	easy: ['apple', 'house', 'cat', 'sun', 'book', 'fish', 'tree', 'shoe', 'cake', 'moon', 'car', 'star'],
	mixed: ['rocket', 'pizza', 'guitar', 'castle', 'rainbow', 'dinosaur', 'coffee', 'volcano', 'camera', 'dragon', 'airplane', 'butterfly'],
	hard: ['metamorphosis', 'constellation', 'kaleidoscope', 'architecture', 'microscope', 'hummingbird', 'orchestra', 'labyrinth', 'thermometer', 'lighthouse', 'parachute', 'telescope'],
};

export function pickWordOptions(difficulty: Difficulty) {
	const words = [...WORD_BANK[difficulty]];
	for (let index = words.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		[words[index], words[swapIndex]] = [words[swapIndex], words[index]];
	}
	return words.slice(0, 3);
}

export function isWordOption(word: string, options: string[]) {
	return options.some((option) => option.toLocaleLowerCase() === word.trim().toLocaleLowerCase());
}

export function normalizeWord(word: string) {
	return word.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function createHintIndexes(word: string) {
	const indexes = [...word]
		.map((character, index) => /[a-z]/i.test(character) ? index : -1)
		.filter((index) => index >= 0);
	for (let index = indexes.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		[indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
	}
	return indexes;
}

export function maskWord(word: string, elapsedSeconds: number, hintsEnabled: boolean, hintIndexes: number[]) {
	const revealCount = !hintsEnabled || elapsedSeconds < 30 ? 0 : elapsedSeconds >= 50 ? 2 : 1;
	const revealed = new Set(hintIndexes.slice(0, revealCount));
	return [...word].map((character, index) => character === ' ' ? ' ' : revealed.has(index) ? character : '_').join(' ');
}