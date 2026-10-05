import { ArrowLeft, Check, Copy, Crown, Link2, Settings2, Share2, Users } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Players } from '../components/Players';
import type { GameSettings, Player, ScoreFeedback } from '../types/game';

interface LobbyProps {
	code: string;
	items: Player[];
	settings: GameSettings;
	setSettings: (settings: GameSettings) => void;
	start: () => void;
	onReady: (ready: boolean) => void;
	onLeave: () => void;
	isReady: boolean;
	pending: boolean;
	scoreFeedback: ScoreFeedback[];
}

export function Lobby({ code, items, settings, setSettings, start, onReady, onLeave, isReady, pending, scoreFeedback }: LobbyProps) {
	const [copied, setCopied] = useState(false);
	const currentPlayer = items[0];
	const host = items.find((player) => player.isHost);
	const isHost = Boolean(currentPlayer?.isHost);
	const connectedCount = items.filter((player) => player.isConnected !== false).length;
	const validSettings = [3, 5, 7].includes(settings.rounds)
		&& [45, 60, 80, 120].includes(settings.drawTime)
		&& [4, 6, 8, 10].includes(settings.maxPlayers)
		&& settings.maxPlayers >= items.length;
	const canStart = isHost && Boolean(host?.isConnected) && connectedCount >= 2 && validSettings && !pending;
	const emptySlots = Math.min(Math.max(0, settings.maxPlayers - items.length), 4);

	async function copyInvite() {
		const url = new URL(window.location.href);
		url.searchParams.set('room', code);
		try {
			await navigator.clipboard.writeText(url.toString());
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	}

	return (
		<div className="page">
			<header className="nav">
				<Logo />
				<div className="room-code"><small>ROOM</small><b>{code}</b><button aria-label="Copy invite link" onClick={copyInvite}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy link'}</button></div>
			</header>
			<main className="lobby">
				<section>
					<div className="title">
						<div><small className="eyebrow">PRIVATE ROOM</small><h1>Build your squad.</h1><p>Invite your friends, tune the rules, then start the chaos.</p></div>
						<span><Users size={16} /> {connectedCount}/{settings.maxPlayers} online</span>
					</div>
					<div className="card panel">
						<header><div><h3>Players</h3><small>{connectedCount < 2 ? 'Waiting for players...' : 'Your room is ready.'}</small></div><Crown size={19} /></header>
						<Players items={items} feedback={scoreFeedback} />
						{emptySlots > 0 && <div className="empty-slots" aria-label={`${emptySlots} open player slots`}>{Array.from({ length: emptySlots }, (_, index) => <div className="empty-player" key={index}><span>+</span><small>Open seat</small></div>)}</div>}
						<div className="invite"><Link2 size={17} /><div><b>Invite friends</b><p>Share room code <strong>{code}</strong> or copy an invite link.</p></div></div>
					</div>
				</section>
				<aside className="card settings">
					<header><div><h3>Game settings</h3><small>{isHost ? 'Host controls' : `Waiting for ${host?.name ?? 'the host'}`}</small></div><Settings2 size={18} /></header>
					<label>Rounds<select disabled={!isHost} value={settings.rounds} onChange={(event) => setSettings({ ...settings, rounds: Number(event.target.value) })}><option value="3">3 rounds</option><option value="5">5 rounds</option><option value="7">7 rounds</option></select></label>
					<label>Draw time<select disabled={!isHost} value={settings.drawTime} onChange={(event) => setSettings({ ...settings, drawTime: Number(event.target.value) })}><option value="45">45 seconds</option><option value="60">60 seconds</option><option value="80">80 seconds</option><option value="120">120 seconds</option></select></label>
					<label>Player limit<select disabled={!isHost} value={settings.maxPlayers} onChange={(event) => setSettings({ ...settings, maxPlayers: Number(event.target.value) })}><option value="4">4 players</option><option value="6">6 players</option><option value="8">8 players</option><option value="10">10 players</option></select></label>
					<label>Difficulty<select disabled={!isHost} value={settings.difficulty} onChange={(event) => setSettings({ ...settings, difficulty: event.target.value as GameSettings['difficulty'] })}><option value="easy">Easy</option><option value="mixed">Mixed</option><option value="hard">Hard</option></select></label>
					<label className="check">Progressive hints<input disabled={!isHost} type="checkbox" checked={settings.hints} onChange={(event) => setSettings({ ...settings, hints: event.target.checked })} /></label>
					{!isHost && <Button onClick={() => onReady(!isReady)}>{isReady ? 'Not ready' : 'Ready'}</Button>}
					{!canStart && <p className="lobby-status">{!isHost ? 'The host controls when the game starts.' : connectedCount < 2 ? 'Invite at least one more connected player to start.' : !host?.isConnected ? 'The host must reconnect before starting.' : 'Check the settings and try again.'}</p>}
					<div className="lobby-actions">
						{isHost && <Button variant="primary" className="full" disabled={!canStart} onClick={start}>{pending ? 'Starting...' : 'Start game'}</Button>}
						<Button variant="ghost" onClick={onLeave}><ArrowLeft size={15} /> Leave room</Button>
					</div>
				</aside>
			</main>
		</div>
	);
}
