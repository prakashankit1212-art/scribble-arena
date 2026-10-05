import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Server as SocketServer } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { GameService } from './services/gameService.js';
import { ReconnectService } from './services/reconnectService.js';
import { RoomService } from './services/roomService.js';
import { ScoreService } from './services/scoreService.js';
import { registerSocketHandlers } from './sockets/registerSocketHandlers.js';
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from './types/socket.js';

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;
type TestServer = SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const settings = {
	rounds: 3,
	drawTime: 45,
	maxPlayers: 10,
	hints: true,
	difficulty: 'mixed' as const,
};

function waitFor<T>(socket: TestSocket, event: string, predicate: (payload: T) => boolean = () => true) {
	return new Promise<T>((resolve, reject) => {
		const emitter = socket as unknown as {
			on: (eventName: string, listener: (payload: T) => void) => void;
			off: (eventName: string, listener: (payload: T) => void) => void;
		};
		const timeout = setTimeout(() => {
			emitter.off(event, listener);
			reject(new Error(`Timed out waiting for ${event}.`));
		}, 5000);
		const listener = (payload: T) => {
			if (!predicate(payload)) return;
			clearTimeout(timeout);
			emitter.off(event, listener);
			resolve(payload);
		};
		emitter.on(event, listener);
	});
}

async function connectClient(url: string, sessionId: string) {
	const socket = createClient(url, { autoConnect: false, auth: { sessionId } }) as unknown as TestSocket;
	const connected = waitFor(socket, 'connect');
	socket.connect();
	await connected;
	return socket;
}

test('two clients create, join, draw, reconnect, and guess without leaking the word', async (context) => {
	const httpServer = createServer();
	const io = new SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer);
	const rooms = new RoomService();
	const reconnects = new ReconnectService();
	const game = new GameService(io, rooms, new ScoreService());
	const clients: TestSocket[] = [];
	registerSocketHandlers(io, rooms, game, reconnects);
	await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
	const address = httpServer.address();
	assert.ok(address && typeof address !== 'string');
	const url = `http://127.0.0.1:${address.port}`;

	context.after(async () => {
		for (const client of clients) client.disconnect();
		reconnects.clearAll();
		rooms.dispose();
		await new Promise<void>((resolve) => io.close(() => resolve()));
	});

	const hostSession = randomUUID();
	const guestSession = randomUUID();
	const host = await connectClient(url, hostSession);
	clients.push(host);
	const createdPromise = waitFor<{ room: { code: string }; yourPlayerId: string }>(host, 'room:created');
	host.emit('room:create', { name: 'Host', settings });
	const created = await createdPromise;

	const guest = await connectClient(url, guestSession);
	clients.push(guest);
	const joinedPromise = waitFor<{ room: { code: string }; yourPlayerId: string }>(guest, 'room:joined');
	const synchronizedPromise = waitFor<{ room: { players: unknown[] } }>(host, 'room:update', (payload) => payload.room.players.length === 2);
	const joinedNoticePromise = waitFor<{ text: string; createdAt: number; type: string }>(host, 'chat:message', (payload) => payload.type === 'system' && payload.text.includes('Guest joined'));
	guest.emit('room:join', { roomCode: created.room.code, name: 'Guest', sessionId: guestSession });
	const joined = await joinedPromise;
	await synchronizedPromise;
	const joinedNotice = await joinedNoticePromise;
	assert.ok(joinedNotice.createdAt > 0);
	const readyUpdate = waitFor<{ room: { players: { id: string; isReady: boolean }[] } }>(
		host,
		'room:update',
		(payload) => payload.room.players.some((player) => player.id === joined.yourPlayerId && player.isReady),
	);
	guest.emit('player:ready', { isReady: true });
	assert.ok((await readyUpdate).room.players.find((player) => player.id === joined.yourPlayerId)?.isReady);

	const notHostPromise = waitFor<{ code: string }>(guest, 'error', (payload) => payload.code === 'NOT_HOST');
	guest.emit('game:start');
	await notHostPromise;

	const optionsPromise = waitFor<{ options: string[]; selectionEndsAt: number }>(host, 'word:options');
	host.emit('game:start');
	const { options, selectionEndsAt } = await optionsPromise;
	assert.equal(options.length, 3);
	assert.ok(selectionEndsAt > Date.now());
	const invalidWordPromise = waitFor<{ code: string }>(host, 'error', (payload) => payload.code === 'INVALID_WORD');
	host.emit('round:choose-word', { word: 'not-a-server-option' });
	await invalidWordPromise;

	const hostRoundPromise = waitFor<{ role: string; word?: string }>(host, 'round:start');
	const guestRoundPromise = waitFor<{ role: string; word?: string; maskedWord?: string }>(guest, 'round:start');
	host.emit('round:choose-word', { word: options[0] });
	const [hostRound, guestRound] = await Promise.all([hostRoundPromise, guestRoundPromise]);
	assert.equal(hostRound.role, 'drawer');
	assert.equal(hostRound.word, options[0]);
	assert.equal(guestRound.role, 'guesser');
	assert.equal('word' in guestRound, false);
	assert.equal(JSON.stringify(guestRound).includes(options[0]), false);

	const strokeId = randomUUID();
	const remoteStrokePromise = waitFor<{ stroke: { playerId: string } }>(guest, 'draw:start');
	host.emit('draw:start', { strokeId, point: { x: 10, y: 10 }, color: '#ff4d67', size: 8, tool: 'pen' });
	assert.equal((await remoteStrokePromise).stroke.playerId, created.yourPlayerId);
	const remoteMovePromise = waitFor<{ strokeId: string; points: { x: number; y: number }[] }>(guest, 'draw:move');
	host.emit('draw:move', { strokeId, points: [{ x: 20, y: 20 }, { x: 30, y: 40 }] });
	assert.equal((await remoteMovePromise).points.length, 2);
	const remoteEndPromise = waitFor<{ strokeId: string }>(guest, 'draw:end');
	host.emit('draw:end', { strokeId });
	assert.equal((await remoteEndPromise).strokeId, strokeId);
	const deniedDrawPromise = waitFor<{ code: string }>(guest, 'error', (payload) => payload.code === 'NOT_DRAWER');
	guest.emit('draw:start', { strokeId: randomUUID(), point: { x: 1, y: 1 }, color: '#15151f', size: 8, tool: 'pen' });
	await deniedDrawPromise;
	const undoPromise = waitFor<{ strokeId: string | null }>(guest, 'draw:undo');
	host.emit('draw:undo');
	assert.equal((await undoPromise).strokeId, strokeId);
	const redoPromise = waitFor<{ stroke: { id: string } | null }>(guest, 'draw:redo');
	host.emit('draw:redo');
	assert.equal((await redoPromise).stroke?.id, strokeId);

	const offlineUpdate = waitFor<{ room: { players: { id: string; isConnected: boolean }[] } }>(
		host,
		'room:update',
		(payload) => payload.room.players.some((player) => player.id === joined.yourPlayerId && !player.isConnected),
	);
	guest.disconnect();
	await offlineUpdate;

	const resumed = await connectClient(url, guestSession);
	clients.push(resumed);
	const reconnectPromise = waitFor<{ room: { round: number; strokes: { id: string; points: { x: number; y: number }[] }[] }; yourPlayerId: string }>(resumed, 'room:reconnected');
	const resumedRoundPromise = waitFor<{ role: string; word?: string }>(resumed, 'round:start');
	resumed.emit('room:reconnect', { roomCode: created.room.code, sessionId: guestSession });
	const [reconnected, resumedRound] = await Promise.all([reconnectPromise, resumedRoundPromise]);
	assert.equal(reconnected.room.round, 1);
	assert.ok(reconnected.room.strokes.some((stroke) => stroke.id === strokeId && stroke.points.length === 3));
	assert.equal(resumedRound.role, 'guesser');
	assert.equal('word' in resumedRound, false);

	rooms.getRoom(created.room.code).round = settings.rounds;
	const correctPromise = waitFor<{ playerId: string; points: number; drawerId: string | null; drawerBonus: number }>(resumed, 'guess:correct');
	const roundEndPromise = waitFor<{ word: string; drawerBonus: number; topGuesser: { playerId: string; points: number } | null }>(resumed, 'round:end');
	const gameEndPromise = waitFor<{ players: { id: string; correctGuesses: number; roundsWon: number; fastestGuessMs: number | null }[] }>(host, 'game:end');
	resumed.emit('chat:send', { text: options[0] });
	const correctGuess = await correctPromise;
	assert.equal(correctGuess.playerId, joined.yourPlayerId);
	assert.equal(correctGuess.drawerId, created.yourPlayerId);
	assert.ok(correctGuess.points >= 100 && correctGuess.points <= 700);
	assert.equal(correctGuess.drawerBonus, 50);
	const roundSummary = await roundEndPromise;
	assert.equal(roundSummary.word, options[0]);
	assert.equal(roundSummary.drawerBonus, 50);
	assert.equal(roundSummary.topGuesser?.playerId, joined.yourPlayerId);
	const finalGame = await gameEndPromise;
	const finalGuest = finalGame.players.find((player) => player.id === joined.yourPlayerId);
	assert.equal(finalGuest?.correctGuesses, 1);
	assert.equal(finalGuest?.roundsWon, 1);
	assert.ok(finalGuest?.fastestGuessMs !== null);

	const rematchLobby = waitFor<{ room: { phase: string; round: number } }>(host, 'room:update', (payload) => payload.room.phase === 'LOBBY');
	host.emit('game:rematch');
	const rematch = await rematchLobby;
	assert.equal(rematch.room.round, 0);
});