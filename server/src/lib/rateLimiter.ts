export class RateLimiter {
	private readonly events = new Map<string, number[]>();

	allow(key: string, limit: number, windowMs = 1000) {
		const now = Date.now();
		const recent = (this.events.get(key) ?? []).filter((time) => now - time < windowMs);
		if (recent.length >= limit) {
			this.events.set(key, recent);
			return false;
		}
		recent.push(now);
		this.events.set(key, recent);
		return true;
	}

	delete(key: string) {
		this.events.delete(key);
	}
}