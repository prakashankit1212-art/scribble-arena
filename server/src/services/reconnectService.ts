export class ReconnectService {
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

	schedule(key: string, delayMs: number, onExpire: () => void) {
		this.clear(key);
		const timer = setTimeout(() => {
			this.timers.delete(key);
			onExpire();
		}, delayMs);
		timer.unref();
		this.timers.set(key, timer);
		return timer;
	}

	clear(key: string) {
		const timer = this.timers.get(key);
		if (timer) clearTimeout(timer);
		this.timers.delete(key);
	}

	clearAll() {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
	}

	clearRoom(roomCode: string) {
		for (const key of this.timers.keys()) {
			if (key.startsWith(`${roomCode}:`)) this.clear(key);
		}
	}
}

export function reconnectTimerKey(roomCode: string, playerId: string) {
	return `${roomCode}:${playerId}`;
}