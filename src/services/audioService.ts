export type AudioCue = 'click' | 'round' | 'warning' | 'correct' | 'round-end' | 'winner';

const MUTE_KEY = 'scribble-arena:audio-muted';
let audioContext: AudioContext | null = null;

export function isAudioMuted() {
	return window.localStorage.getItem(MUTE_KEY) === 'true';
}

export function setAudioMuted(muted: boolean) {
	window.localStorage.setItem(MUTE_KEY, String(muted));
}

export function playAudioCue(cue: AudioCue) {
	if (isAudioMuted()) return;
	const AudioContextConstructor = window.AudioContext;
	if (!AudioContextConstructor) return;
	audioContext ??= new AudioContextConstructor();
	if (audioContext.state === 'suspended') void audioContext.resume();

	const patterns: Record<AudioCue, number[]> = {
		click: [520],
		round: [440, 660],
		warning: [700],
		correct: [660, 880, 1100],
		'round-end': [520, 390],
		winner: [523, 659, 784, 1046],
	};
	const now = audioContext.currentTime;
	patterns[cue].forEach((frequency, index) => {
		const oscillator = audioContext!.createOscillator();
		const gain = audioContext!.createGain();
		const startsAt = now + index * 0.09;
		oscillator.type = 'sine';
		oscillator.frequency.value = frequency;
		gain.gain.setValueAtTime(0.0001, startsAt);
		gain.gain.exponentialRampToValueAtTime(0.055, startsAt + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.13);
		oscillator.connect(gain);
		gain.connect(audioContext!.destination);
		oscillator.start(startsAt);
		oscillator.stop(startsAt + 0.14);
	});
}