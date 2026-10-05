import { randomInt, randomUUID } from 'node:crypto';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function createId() {
	return randomUUID();
}

export function createRoomCode() {
	return Array.from({ length: 5 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
}