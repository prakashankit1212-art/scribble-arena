import { ArrowRight, Check, Gamepad2, RotateCcw, ShieldCheck, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import type { GameSettings, RoomVisibility } from '../types/game';

const DEFAULT_SETTINGS: GameSettings = { rounds: 5, drawTime: 80, maxPlayers: 10, hints: true, difficulty: 'mixed' };
const ROOM_CODE_PATTERN = /^[A-Z2-9]{5}$/;

interface HomeProps {
	name: string;
	setName: (name: string) => void;
	create: (settings: GameSettings, room: { name?: string; visibility?: RoomVisibility }) => void;
	join: (code: string) => void;
	pending?: 'create' | 'join' | 'start' | null;
	connected?: boolean;
}

export function Home({ name, setName, create, join, pending = null, connected = true }: HomeProps) {
	const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '');
	const [settings, setSettings] = useState(DEFAULT_SETTINGS);
	const [roomName, setRoomName] = useState('');
	const [visibility, setVisibility] = useState<RoomVisibility>('PRIVATE');
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [formError, setFormError] = useState('');
	const validName = name.trim().length > 0 && name.trim().length <= 18 && !/[<>\u0000-\u001f]/.test(name);
	const validCode = ROOM_CODE_PATTERN.test(code);

	useEffect(() => {
		if (!settingsOpen) return;
		const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSettingsOpen(false); };
		window.addEventListener('keydown', closeOnEscape);
		return () => window.removeEventListener('keydown', closeOnEscape);
	}, [settingsOpen]);

	function openCreateSettings() {
		if (!validName) {
			setFormError('Enter a nickname before creating a room.');
			return;
		}
		if (!connected) {
			setFormError('The game server is reconnecting. Try again shortly.');
			return;
		}
		setFormError('');
		setSettingsOpen(true);
	}

	function submitJoin(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!validName) {
			setFormError('Enter a nickname before joining a room.');
			return;
		}
		if (!validCode) {
			setFormError('Enter a valid five-character room code.');
			return;
		}
		setFormError('');
		join(code);
	}

	function submitCreate(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!validName) {
			setFormError('Enter a valid nickname before creating a room.');
			return;
		}
		setSettingsOpen(false);
		create(settings, { name: roomName.trim() || undefined, visibility });
	}

	return (
		<div className="home">
			<header className="nav"><Logo /><span className="online"><i />Multiplayer drawing game</span></header>
			<main className="hero">
				<div className="hero-copy">
					<small className="eyebrow">DRAW · GUESS · DOMINATE</small>
					<h1>Where your <em>doodles</em> become legends.</h1>
					<p>A drawing party game for friends, classmates, and anyone brave enough to draw a potato.</p>
					<div className="hero-actions">
						<label>Nickname<input value={name} maxLength={18} onChange={(event) => { setName(event.target.value); setFormError(''); }} placeholder="Enter nickname" aria-invalid={!validName} /></label>
						<Button variant="primary" disabled={!connected || Boolean(pending)} onClick={openCreateSettings}>{pending === 'create' ? 'Creating...' : 'Create room'} <ArrowRight size={17} /></Button>
					</div>
					<form className="join" onSubmit={submitJoin}>
						<div><small>Have an invite?</small><b>Join a room</b></div>
						<label className="visually-hidden" htmlFor="room-code-input">Five-character room code</label>
						<input id="room-code-input" value={code} maxLength={5} onChange={(event) => { setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setFormError(''); }} placeholder="ABCDE" aria-invalid={code.length > 0 && !validCode} />
						<Button type="submit" disabled={!connected || Boolean(pending) || !validCode}>{pending === 'join' ? 'Joining...' : 'Join'}</Button>
					</form>
					{formError && <p className="form-error" role="alert">{formError}</p>}
					<div className="trust"><span><Users size={15} /> Up to 10 players</span><span><ShieldCheck size={15} /> Private rooms</span><span><Gamepad2 size={15} /> Real-time play</span></div>
				</div>
				<div className="art" aria-label="A preview of a drawing round">
					<div className="paper"><div className="art-head"><span>✦ scribble arena</span><b>_ _ _ _ _</b></div><div className="scene"><div className="sun" /><div className="mtn a" /><div className="mtn b" /><div className="house"><i /><b /><span /></div></div><div className="art-foot"><span>🎨</span><b>Someone is drawing...</b><span>⏱ 47s</span></div></div>
					<div className="float score">🐸 <b>Player</b><span>got it!</span><strong>+420</strong></div><div className="float timer">ROUND 02 <b>42s</b></div>
				</div>
			</main>
			<section className="features" aria-label="How to play">
				<div><Users /><b>1. Invite your crew</b><span>Create a private room and share its code.</span></div>
				<div><ShieldCheck /><b>2. Draw the prompt</b><span>Take turns sketching while everyone guesses.</span></div>
				<div><Gamepad2 /><b>3. Guess to score</b><span>Quick correct guesses earn more points.</span></div>
			</section>
			{settingsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
				<form className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onSubmit={submitCreate}>
					<header><div><small className="eyebrow">NEW ROOM</small><h2 id="settings-title">Set the rules</h2></div><button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={18} /></button></header>
					<p>Choose the pace. You can fine-tune it again in the lobby.</p>
					<label>Rounds<select value={settings.rounds} onChange={(event) => setSettings({ ...settings, rounds: Number(event.target.value) })}><option value="3">3 rounds</option><option value="5">5 rounds</option><option value="7">7 rounds</option></select></label>
					<label>Room name<input value={roomName} maxLength={40} onChange={(event) => setRoomName(event.target.value)} placeholder={`${name.trim() || 'Your'}'s room`} /></label>
					<label>Visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value as RoomVisibility)}><option value="PRIVATE">Private — invite only</option><option value="PUBLIC">Public — listed in the arena</option></select></label>
					<label>Draw time<select value={settings.drawTime} onChange={(event) => setSettings({ ...settings, drawTime: Number(event.target.value) })}><option value="45">45 seconds</option><option value="60">60 seconds</option><option value="80">80 seconds</option><option value="120">120 seconds</option></select></label>
					<label>Player limit<select value={settings.maxPlayers} onChange={(event) => setSettings({ ...settings, maxPlayers: Number(event.target.value) })}><option value="4">4 players</option><option value="6">6 players</option><option value="8">8 players</option><option value="10">10 players</option></select></label>
					<label>Difficulty<select value={settings.difficulty} onChange={(event) => setSettings({ ...settings, difficulty: event.target.value as GameSettings['difficulty'] })}><option value="easy">Easy</option><option value="mixed">Mixed</option><option value="hard">Hard</option></select></label>
					<label className="check">Progressive hints<input type="checkbox" checked={settings.hints} onChange={(event) => setSettings({ ...settings, hints: event.target.checked })} /></label>
					<div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setSettings(DEFAULT_SETTINGS)}><RotateCcw size={15} />Reset defaults</Button><Button type="button" onClick={() => setSettingsOpen(false)}>Cancel</Button><Button variant="primary" type="submit" disabled={Boolean(pending)}>{pending === 'create' ? 'Creating...' : <><Check size={15} />Create room</>}</Button></div>
				</form>
			</div>}
		</div>
	);
}
