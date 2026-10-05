import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV !== 'development') {
	console.info('Skipping development seed outside NODE_ENV=development.');
	process.exit(0);
}

const prisma = new PrismaClient();

try {
	const user = await prisma.user.upsert({
		where: { id: '11111111-1111-4111-8111-111111111111' },
		update: {},
		create: {
			id: '11111111-1111-4111-8111-111111111111',
			profile: {
				create: { username: 'Demo Player', avatar: '🦊' },
			},
		},
	});
	console.info(`Development seed ready for ${user.id}.`);
} finally {
	await prisma.$disconnect();
}