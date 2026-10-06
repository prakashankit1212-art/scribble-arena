import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './lib/config.js';
import { checkDatabase, disconnectDatabase } from './db/client.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createApiRouter } from './routes/apiRoutes.js';
import { GameService } from './services/gameService.js';
import { PersistenceService } from './services/persistenceService.js';
import { ReconnectService } from './services/reconnectService.js';
import { RoomService } from './services/roomService.js';
import { ScoreService } from './services/scoreService.js';
import { registerSocketHandlers } from './sockets/registerSocketHandlers.js';
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from './types/socket.js';

const rooms = new RoomService();
const reconnects = new ReconnectService();
const persistence = new PersistenceService();
const app = express();
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(express.json({ limit: '32kb' }));

app.get('/health', async (_request, response) => {
	const database = await checkDatabase();
	response.status(200).json({
		ok: true,
		service: 'scribble-arena-server',
		database,
	});
});

app.use('/api', createApiRouter(persistence, rooms));

app.use(errorHandler);

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
	cors: { origin: config.clientOrigins, credentials: true },
	maxHttpBufferSize: 64 * 1024,
});
const game = new GameService(io, rooms, new ScoreService(), persistence);

registerSocketHandlers(io, rooms, game, reconnects, persistence);

void persistence.initialize().catch((error) => console.error('Database initialization failed; server will start in memory-only mode.', error)).finally(() => {
	httpServer.listen(config.port, '0.0.0.0', () => {
		console.info(`Scribble Arena server listening on http://localhost:${config.port}`);
	});
});

function shutdown() {
	reconnects.clearAll();
	rooms.dispose();
	io.close(() => { void disconnectDatabase().finally(() => process.exit(0)); });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
