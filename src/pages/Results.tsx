import { ArrowLeft, Crown, RotateCcw, Share2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { copyText } from '../lib/clipboard';
import { Logo } from '../components/Logo';
import { playAudioCue } from '../services/audioService';
import type { Player } from '../types/game';

interface ResultsProps {
	items: Player[];
	again: () => void;
	home: () => void;
}

export function Results({ items, again, home }: ResultsProps) {
	const ranked = [...items].sort((left, right) => right.score - left.score);
	const isHost = Boolean(items[0]?.isHost);
	const [shareMessage, setShareMessage] = useState('');
	const winnerCuePlayed = useRef(false);
	useEffect(() => {
		if (!winnerCuePlayed.current && ranked.length > 0) {
			winnerCuePlayed.current = true;
			playAudioCue('winner');
		}
	}, [ranked.length]);

	async function shareResults() {
		const url = window.location.href;
		const summary = ranked.map((player, index) => `${index + 1}. ${player.name}: ${player.score}`).join('\n');
		try {
			if (navigator.share) await navigator.share({ title: 'Scribble Arena results', text: summary, url });
			else if (!await copyText(`${summary}\n${url}`)) throw new Error('Clipboard unavailable');
			setShareMessage('Results shared.');
		} catch {
			setShareMessage('Sharing was cancelled.');
		}
	}

	return (
		<div className="results">
			<header className="nav"><Logo /><button className="back" onClick={home}><ArrowLeft size={15} /> Leave room</button></header>
			<main>
				<div className="results-head"><small className="eyebrow">GAME COMPLETE</small><Sparkles size={24} /><h1>That was <em>legendary.</em></h1><p>The room has spoken. Here are the final scores.</p></div>
				<div className="podium">{ranked.slice(0, 3).map((player, index) => (
					<div className={`pod p${index}`} key={player.id}>
						<span className="medal">{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</span>
						<div>{player.avatar}</div><small>{index === 0 ? '1ST' : index === 1 ? '2ND' : '3RD'}</small>
						<h3>{player.name}</h3><strong>{player.score}</strong><span>points</span>{index === 0 && <Crown className="crown" />}
					</div>
				))}</div>
				<section className="full-leaderboard" aria-label="Final leaderboard">
					<h2>Final leaderboard</h2>
					{ranked.map((player, index) => (
						<div className="result-row" key={player.id}>
							<span>{index + 1}</span><span>{player.avatar}</span><b>{player.name}</b><strong>{player.score} pts</strong>
							<div className="result-stats">
								<div className="result-stat"><b>{player.correctGuesses ?? 0}</b><span>Correct guesses</span></div>
								<div className="result-stat"><b>{player.roundsWon ?? 0}</b><span>Rounds won</span></div>
								<div className="result-stat"><b>{player.fastestGuessMs === null || player.fastestGuessMs === undefined ? '—' : `${(player.fastestGuessMs / 1000).toFixed(1)}s`}</b><span>Fastest guess</span></div>
							</div>
						</div>
					))}
				</section>
				<div className="result-actions">
					{isHost ? <Button variant="primary" onClick={again}><RotateCcw size={15} />Play again</Button> : <span>Waiting for the host to start a rematch.</span>}
					<Button onClick={shareResults}><Share2 size={15} />Share</Button>
				</div>
				{shareMessage && <p role="status">{shareMessage}</p>}
			</main>
		</div>
	);
}
