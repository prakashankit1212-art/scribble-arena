import { PrismaClient } from '@prisma/client';
import '../lib/config.js';

export const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
export const prisma = databaseConfigured ? new PrismaClient() : null;

export type DatabaseHealth = 'connected' | 'disconnected' | 'not_configured';

export async function checkDatabase(): Promise<DatabaseHealth> {
	if (!prisma) return 'not_configured';
	try {
		await prisma.$queryRaw`SELECT 1`;
		return 'connected';
	} catch (error) {
		console.error('Database health check failed.', error);
		return 'disconnected';
	}
}

export async function disconnectDatabase() {
	if (prisma) await prisma.$disconnect();
}