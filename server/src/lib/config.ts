import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

function getPort(value: string | undefined) {
	const port = Number(value ?? 3000);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('PORT must be a valid TCP port.');
	}
	return port;
}

export const config = {
	port: getPort(process.env.PORT ?? process.env.HTTP_PORT),
	clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5174')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean),
	reconnectGraceMs: 30_000,
	maxStrokePoints: 300,
	maxDrawingEventsPerSecond: 30,
	maxChatMessagesPerSecond: 5,
} as const;
