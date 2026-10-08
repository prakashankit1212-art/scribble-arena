import { Check, Clock3, Copy, MessageCircle, Menu, Trophy, Users, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Canvas } from '../components/Canvas';
import { Chat } from '../components/Chat';
import { copyText } from '../lib/clipboard';
import { DrawerIndicator } from '../components/DrawerIndicator';
import { Logo } from '../components/Logo';
import { Players } from '../components/Players';
import { isAudioMuted, playAudioCue, setAudioMuted } from '../services/audioService';
import type { ChatMessage, GameSettings, Phase, Player, RoundSummary, ScoreFeedback, Stroke } from '../types/game';

const formatTime = (seconds: number) => {
	const remaining = Math.max(0, seconds);
	return `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
};

interface GameProps {
	code: string;
	items: Player[];
	settings: GameSettings;
	round: number;
	phase: Phase;
	word: string;
	options: string[];
	timeLeft: number;
	choiceTimeLeft: number;
	messages: ChatMessage[];
	strokes: Stroke[];
	canRedo: boolean;
	roundSummary: RoundSummary | null;
	scoreFeedback: ScoreFeedback[];
	connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
	onChoose: (word: string) => void;
	onStroke: (stroke: Stroke) => void;
	onClear: () => void;
	onUndo: () => void;
	onRedo: () => void;
	onGuess: (text: string) => void;
}

export function Game({
	code,
	items,
	settings,
	round,
	phase,
	word,
	options,
	timeLeft,
	choiceTimeLeft,
	messages,
	strokes,
	canRedo,
	roundSummary,
	scoreFeedback,
	connectionStatus,
	onChoose,
	onStroke,
	onClear,
	onUndo,
	onRedo,
	onGuess,
}: GameProps) {
	const [playersOpen, setPlayersOpen] = useState(false);
	const [chatOpen, setChatOpen] = useState(false);
	const [countdown, setCountdown] = useState<string | null>(null);
	const [transitionSeconds, setTransitionSeconds] = useState(0);
	const [muted, setMuted] = useState(isAudioMuted);
	const [copiedCode, setCopiedCode] = useState(false);
	const drawer = Boolean(items[0]?.isDrawer);
	const currentDrawer = items.find((player) => player.isDrawer);
	const timerClass = timeLeft <= 5 ? 'timer-critical' : timeLeft <= 15 ? 'timer-warning' : '';
	const drawerName = items.find((player) => player.id === items.find((candidate) => candidate.isDrawer)?.id)?.name;

	async function copyRoomCode() {
		if (await copyText(code)) {
			setCopiedCode(true);
			window.setTimeout(() => setCopiedCode(false), 1600);
		}
	}

	useEffect(() => {
		if (phase !== 'drawing') {
			setCountdown(null);
			return;
		}
		const sequence = ['3', '2', '1', 'GO!'];
		let current = 0;
		setCountdown(sequence[current]);
		playAudioCue('round');
		const timer = window.setInterval(() => {
			current += 1;
			setCountdown(sequence[current] ?? null);
			if (current >= sequence.length) window.clearInterval(timer);
		}, 600);
		return () => window.clearInterval(timer);
	}, [phase, round]);

	useEffect(() => {
		if (phase === 'round-end') playAudioCue('round-end');
	}, [phase, round]);

	useEffect(() => {
		if (scoreFeedback.length > 0) playAudioCue('correct');
	}, [scoreFeedback.length]);

	useEffect(() => {
		if (timeLeft === 15 || timeLeft === 5) playAudioCue('warning');
	}, [timeLeft]);

	useEffect(() => {
		if (phase !== 'round-end' || !roundSummary) {
			setTransitionSeconds(0);
			return;
		}
		const update = () => setTransitionSeconds(Math.max(0, Math.ceil((roundSummary.nextRoundAt - Date.now()) / 1000)));
		update();
		const timer = window.setInterval(update, 200);
		return () => window.clearInterval(timer);
	}, [phase, roundSummary]);

	return (
		<div className="game">
			<header className="game-nav">
				<Logo />
				<div className="round">ROUND <b>{round}</b> / {settings.rounds}<span className={timerClass}><Clock3 size={14} />{formatTime(timeLeft)}</span></div>
				<div className="game-right">
					<span className={`connection-status ${connectionStatus}`}>{connectionStatus === 'connected' ? 'CONNECTED' : connectionStatus === 'reconnecting' ? 'RECONNECTING' : 'DISCONNECTED'}</span>
					<button aria-label="Copy room code" onClick={copyRoomCode}>{copiedCode ? <Check size={14} /> : <Copy size={14} />}{copiedCode ? 'Copied' : code}</button>
					<button className="mobile-btn" aria-label="Show players" onClick={() => setPlayersOpen(!playersOpen)}><Menu size={16} /></button>
				</div>
			</header>
			<main className="game-layout">
				<aside className={`left card ${playersOpen ? 'open' : ''}`}>
					<header><div><h3>Players</h3></div><div className="chat-header-actions"><Trophy size={17} /><button className="mobile-sheet-close" aria-label="Close players" onClick={() => setPlayersOpen(false)}>×</button></div></header>
					<Players items={items} feedback={scoreFeedback} />
				</aside>
				<section className="center">
					<div className="word">
						<div>
							{currentDrawer && <DrawerIndicator player={currentDrawer} />}
							<small>{phase === 'word-choice' ? (drawer ? 'CHOOSE YOUR WORD' : `${drawerName ?? 'The drawer'} is choosing a word`) : phase === 'drawing' ? (drawer ? 'YOUR WORD' : 'GUESS THE WORD') : 'ROUND COMPLETE'}</small>
							<strong>{word || (phase === 'word-choice' && !drawer ? 'Waiting for the drawer...' : phase === 'word-choice' ? 'Select one to begin' : 'Get ready')}</strong>
						</div>
						{phase === 'word-choice' && drawer
							? <div className="word-choice-controls"><div className="choice-time" role="status"><span>Choose in</span><b>{choiceTimeLeft}s</b></div><div className="choice-progress"><span style={{ width: `${Math.max(0, Math.min(100, (choiceTimeLeft / 15) * 100))}%` }} /></div><div className="choices">{options.map((option, index) => <button className="word-choice-card" type="button" key={option} onClick={() => onChoose(option)}><small>OPTION {index + 1}</small><span>{option}</span></button>)}</div></div>
							: null}
					</div>
					<Canvas strokes={strokes} onStroke={onStroke} onClear={onClear} onUndo={onUndo} onRedo={onRedo} canRedo={canRedo} disabled={!drawer || phase !== 'drawing'} />
					<div className="under"><span><b>HINT</b> {settings.hints ? 'Letters may appear as time runs out.' : 'Hints disabled.'}</span><button aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={!muted} onClick={() => { const nextMuted = !muted; setMuted(nextMuted); setAudioMuted(nextMuted); if (!nextMuted) playAudioCue('click'); }}><Volume2 size={14} />{muted ? 'Sound off' : 'Sound on'}</button></div>
				</section>
				<Chat messages={messages} onSend={onGuess} disabled={drawer || phase !== 'drawing'} mobileOpen={chatOpen} onClose={() => setChatOpen(false)} />
			</main>
			<div className="mobile-game-controls"><button onClick={() => { setPlayersOpen(!playersOpen); setChatOpen(false); }}><Users size={16} /> Players</button><button onClick={() => { setChatOpen(!chatOpen); setPlayersOpen(false); }}><MessageCircle size={16} /> Chat</button></div>
			{countdown && phase === 'drawing' && <div className="countdown-overlay" aria-live="assertive"><span className="countdown-number">{countdown}</span></div>}
			{phase === 'round-end' && roundSummary && <div className="round-end-overlay" role="status"><section className="round-end-panel"><small className="eyebrow">ROUND {roundSummary.round} COMPLETE</small><h2>Nice round.</h2><span className="answer">{roundSummary.word}</span>{roundSummary.topGuesser ? <p>Top guesser: <b>{roundSummary.topGuesser.playerName} +{roundSummary.topGuesser.points}</b></p> : <p>No correct guesses this round.</p>}{roundSummary.drawerBonus > 0 && <p>{drawerName ?? 'Drawer'} earned <b>+{roundSummary.drawerBonus} drawer bonus</b></p>}<p>Next round in {transitionSeconds}...</p></section></div>}
		</div>
	);
}
