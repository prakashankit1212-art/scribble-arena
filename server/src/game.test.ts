import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { drawMoveSchema } from './lib/validation.js';
import { GameService, type GameServer } from './services/gameService.js';
import { RoomService } from './services/roomService.js';
import { ScoreService } from './services/scoreService.js';
import { pickWordOptions } from './services/wordService.js';

const settings = {
	rounds: 3,
	drawTime: 80,
	maxPlayers: 10,
	hints: true,
	difficulty: 'mixed' as const,
};

function createRoomWithTwoPlayers() {
	const rooms = new RoomService();
	const host = rooms.create({ name: 'Host', sessionId: randomUUID(), socketId: 'host-socket', settings });
	const guest = rooms.join({ code: host.room.code, name: 'Guest', sessionId: randomUUID(), socketId: 'guest-socket' });
	return { rooms, host, guest };
}

test('room snapshots keep session and socket credentials private and transfer host', () => {
	const { rooms, host, guest } = createRoomWithTwoPlayers();
	const snapshot = rooms.snapshot(host.room);
	assert.equal(snapshot.code.length, 5);
	assert.equal('sessionId' in snapshot.players[0], false);
	assert.equal('socketId' in snapshot.players[0], false);

	const disconnected = rooms.disconnect('host-socket');
	assert.equal(disconnected?.hostChanged?.id, guest.player.id);
	assert.equal(rooms.snapshot(host.room).hostId, guest.player.id);
	rooms.dispose();
});

test('only the drawer receives the secret word in round-start payloads', () => {
	const { rooms, host, guest } = createRoomWithTwoPlayers();
	host.room.phase = 'DRAWING';
	host.room.drawerId = host.player.id;
	host.room.secretWord = 'rocket';
	host.room.roundEndsAt = Date.now() + 80_000;
	const game = new GameService({} as GameServer, rooms, new ScoreService());

	const drawerPayload = game.getRoundStartPayload(host.room, host.player);
	const guesserPayload = game.getRoundStartPayload(host.room, guest.player);
	assert.equal(drawerPayload?.role, 'drawer');
	assert.equal(drawerPayload && 'word' in drawerPayload ? drawerPayload.word : '', 'rocket');
	assert.equal(guesserPayload?.role, 'guesser');
	assert.equal(guesserPayload && 'word' in guesserPayload, false);
	assert.equal(JSON.stringify(guesserPayload).includes('rocket'), false);
	rooms.dispose();
});

test('correct guesses are server-scored once and grant a drawer bonus', () => {
	const { rooms, host, guest } = createRoomWithTwoPlayers();
	host.room.phase = 'DRAWING';
	host.room.drawerId = host.player.id;
	host.room.secretWord = 'rocket';
	host.room.roundEndsAt = Date.now() + settings.drawTime * 1000;
	const scores = new ScoreService();

	const firstGuess = scores.applyGuess(host.room, guest.player, 'ROCKET');
	assert.equal(firstGuess.kind, 'correct');
	if (firstGuess.kind !== 'correct') return;
	assert.ok(firstGuess.points >= 690 && firstGuess.points <= 700);
	assert.equal(firstGuess.drawerBonus, 50);
	assert.equal(guest.player.score, firstGuess.points);
	assert.equal(host.player.score, 50);
	assert.equal(scores.applyGuess(host.room, guest.player, 'rocket').kind, 'duplicate');
	assert.equal(guest.player.score, firstGuess.points);
	rooms.dispose();
});

test('word options contain exactly three distinct words and drawing batches are bounded', () => {
	const options = pickWordOptions('easy');
	assert.equal(options.length, 3);
	assert.equal(new Set(options).size, 3);
	assert.equal(drawMoveSchema.safeParse({ strokeId: randomUUID(), points: Array.from({ length: 61 }, () => ({ x: 1, y: 1 })) }).success, false);
});