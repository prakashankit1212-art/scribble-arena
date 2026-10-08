import { ArrowLeft, BarChart3, Check, Clock3, Copy, Crown, Layers3, Link2, Pencil, Settings2, Share2, Users } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { Players } from '../components/Players';
import { copyText } from '../lib/clipboard';
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
	const [copied, setCopied] = useState<'code' | 'link' | null>(null);
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

	function showCopied(kind: 'code' | 'link') {
		setCopied(kind);
		window.setTimeout(() => setCopied(null), 1600);
	}

	async function copyCode() {
		if (await copyText(code)) showCopied('code');
	}

	async function copyInvite() {
		const url = new URL(window.location.href);
		url.searchParams.set('room', code);
		if (await copyText(url.toString())) showCopied('link');
	}

	return (
		<div className="page lobby-page">
			<header className="nav">
				<Logo />
				<div className="room-code"><small>ROOM</small><button className="room-code-value" aria-label="Copy room code" onClick={copyCode}>{code}</button><button aria-label="Copy invite link" onClick={copyInvite}>{copied === 'link' ? <Check size={13} /> : <Link2 size={13} />}{copied === 'link' ? 'Copied link' : 'Copy link'}</button>{copied === 'code' && <small role="status">Code copied</small>}</div>
			</header>
			<div className="lobby-doodle lobby-doodle-left">↘</div><div className="lobby-doodle lobby-doodle-right">✧</div><main className="lobby">
				<section>
					<div className="title">
						<div><small className="eyebrow">PRIVATE ROOM</small><h1>Build your squad.</h1><p>Invite your friends, tune the rules, then start the chaos.</p></div>
						<span><Users size={16} /> {connectedCount}/{settings.maxPlayers} online</span>
					</div>
					<div className="card panel">
						<header><div><h3>Players</h3><small>{connectedCount < 2 ? 'Waiting for players...' : 'Your room is ready.'}</small></div><Crown size={19} /></header>
						<Players items={items} feedback={scoreFeedback} />
						{emptySlots > 0 && <div className="empty-slots" aria-label={`${emptySlots} open player slots`}>{Array.from({ length: emptySlots }, (_, index) => <div className="empty-player" key={index}><span>+</span><small>Open seat</small></div>)}</div>}
						<div className="invite"><Link2 size={17} /><div><b>Invite friends</b><p>Share room code <strong>{code}</strong> or copy an invite link.</p></div><button type="button" className="invite-copy" onClick={copyInvite}>{copied === 'link' ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy link</>}</button></div>
					</div>
				</section>
				<aside className="card settings lobby-settings">
					<header><div><h3>Game settings</h3><small>{isHost ? 'Host controls' : `Waiting for ${host?.name ?? 'the host'}`}</small></div><Settings2 size={18} /></header>
					<label className="lobby-setting-row"><span className="settings-icon violet"><Layers3 size={18} /></span><span>Rounds</span><select disabled={!isHost} value={settings.rounds} onChange={(event) => setSettings({ ...settings, rounds: Number(event.target.value) })}><option value="3">3 rounds</option><option value="5">5 rounds</option><option value="7">7 rounds</option></select></label>
					<label className="lobby-setting-row"><span className="settings-icon pink"><Pencil size={18} /></span><span>Draw time</span><select disabled={!isHost} value={settings.drawTime} onChange={(event) => setSettings({ ...settings, drawTime: Number(event.target.value) })}><option value="45">45 seconds</option><option value="60">60 seconds</option><option value="80">80 seconds</option><option value="120">120 seconds</option></select></label>
					<label className="lobby-setting-row"><span className="settings-icon green"><Users size={18} /></span><span>Player limit</span><select disabled={!isHost} value={settings.maxPlayers} onChange={(event) => setSettings({ ...settings, maxPlayers: Number(event.target.value) })}><option value="4">4 players</option><option value="6">6 players</option><option value="8">8 players</option><option value="10">10 players</option></select></label>
					<label className="lobby-setting-row"><span className="settings-icon orange"><BarChart3 size={18} /></span><span>Difficulty</span><select disabled={!isHost} value={settings.difficulty} onChange={(event) => setSettings({ ...settings, difficulty: event.target.value as GameSettings['difficulty'] })}><option value="easy">Easy</option><option value="mixed">Mixed</option><option value="hard">Hard</option></select></label>
					<label className="lobby-setting-row lobby-check"><span className="settings-icon pink"><Clock3 size={18} /></span><span>Progressive hints</span><input disabled={!isHost} type="checkbox" checked={settings.hints} onChange={(event) => setSettings({ ...settings, hints: event.target.checked })} /></label>
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
