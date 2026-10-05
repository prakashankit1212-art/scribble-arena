import { z } from 'zod';

export const roomCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{5}$/);
export const sessionIdSchema = z.string().uuid();
export const nameSchema = z.string().trim().min(1).max(18).regex(/^[^\u0000-\u001f<>]+$/);

export const settingsSchema = z.object({
	rounds: z.union([z.literal(3), z.literal(5), z.literal(7)]),
	drawTime: z.union([z.literal(45), z.literal(60), z.literal(80), z.literal(120)]),
	maxPlayers: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]),
	hints: z.boolean(),
	difficulty: z.enum(['easy', 'mixed', 'hard']),
}).strict();

export const pointSchema = z.object({
	x: z.number().finite().min(0).max(4096),
	y: z.number().finite().min(0).max(4096),
}).strict();

export const strokeInputSchema = z.object({
	points: z.array(pointSchema).min(1).max(300),
	color: z.string().regex(/^#[\da-fA-F]{6}$/),
	size: z.number().finite().min(1).max(48),
	tool: z.enum(['pen', 'eraser']),
}).strict();

export const chatTextSchema = z.string().trim().min(1).max(180);

export const createRoomSchema = z.object({
	name: nameSchema,
	profileId: sessionIdSchema.optional(),
	roomName: z.string().trim().min(1).max(40).optional(),
	visibility: z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE'),
	settings: settingsSchema,
}).strict();

export const joinRoomSchema = z.object({
	roomCode: roomCodeSchema,
	name: nameSchema,
	profileId: sessionIdSchema.optional(),
	sessionId: sessionIdSchema,
}).strict();

export const reconnectRoomSchema = z.object({
	roomCode: roomCodeSchema,
	sessionId: sessionIdSchema,
}).strict();

export const updateSettingsSchema = z.object({
	settings: settingsSchema,
}).strict();

export const chooseWordSchema = z.object({ word: z.string().trim().min(1).max(32) }).strict();

export const drawStrokeSchema = strokeInputSchema.extend({ strokeId: z.string().uuid() }).strict();

export const drawStartSchema = z.object({
	strokeId: z.string().uuid(),
	point: pointSchema,
	color: z.string().regex(/^#[\da-fA-F]{6}$/),
	size: z.number().finite().min(1).max(48),
	tool: z.enum(['pen', 'eraser']),
}).strict();

export const drawMoveSchema = z.object({
	strokeId: z.string().uuid(),
	points: z.array(pointSchema).min(1).max(60),
}).strict();

export const drawEndSchema = z.object({ strokeId: z.string().uuid() }).strict();

export type ValidGameSettings = z.infer<typeof settingsSchema>;
export type ValidStrokeInput = z.infer<typeof strokeInputSchema>;