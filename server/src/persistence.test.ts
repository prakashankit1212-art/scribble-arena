import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { GameRepository } from './repositories/gameRepository.js';
import { PersistenceService } from './services/persistenceService.js';
import { RoomService } from './services/roomService.js';

function makeRoom() {
	const settings = { rounds: 3 as const, drawTime: 45 as const, maxPlayers: 4 as const, hints: true, difficulty: 'easy' as const };
	return new RoomService().create({ name: 'Host', sessionId: crypto.randomUUID(), socketId: 'socket', settings }).room;
}

test('completed-game repository buffers active state and writes only a finished match', async () => {
	const room = makeRoom();
	room.phase = 'DRAWING';
	room.drawerId = room.players[0].id;
	room.round = 1;
	room.secretWord = 'Secret Word';
	room.roundStartedAt = Date.now() - 2_000;
	room.roundScores.set(room.players[0].id, 120);
	let created: any = null;
	let createCount = 0;
	const fakePrisma = {
		game: { create: async (args: unknown) => { createCount += 1; created = args; return { id: 'game' }; } },
		$transaction: async (callback: (transaction: any) => Promise<unknown>) => callback({ game: { create: async (args: unknown) => { createCount += 1; created = args; return { id: 'game' }; } }, gamePlayer: { updateMany: async () => undefined }, profile: { findUnique: async () => null, update: async () => undefined } }),
	} as unknown as PrismaClient;
	const repository = new GameRepository(fakePrisma);
	const gameId = await repository.start(room);
	assert.ok(gameId);
	await repository.saveRound(room, gameId);
	assert.equal(createCount, 0);
	await repository.finish(room, gameId);
	assert.equal(createCount, 1);
	assert.equal(created.data.status, 'FINISHED');
	assert.equal(created.data.id, gameId);
	assert.equal(created.data.roundsData.create.length, 1);
	assert.notEqual(created.data.roundsData.create[0].selectedWordHash, room.secretWord);
	assert.equal(JSON.stringify(created).includes(room.secretWord), false);
	assert.equal(JSON.stringify(created).includes('"points"'), false);
});

test('persistence safely falls back when Prisma is unavailable', async () => {
	const room = makeRoom();
	const repository = new GameRepository(null);
	assert.equal(await repository.start(room), null);
	await assert.doesNotReject(() => repository.saveRound(room, 'missing-game'));
	await assert.doesNotReject(() => repository.finish(room, 'missing-game'));
	const persistence = new PersistenceService();
	assert.equal(await persistence.gameHistory('00000000-0000-0000-0000-000000000000'), null);
});
