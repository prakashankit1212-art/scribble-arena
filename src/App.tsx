import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Game } from './pages/Game';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';
import { Results } from './pages/Results';
import { useGame } from './hooks/useGame';
import type { GameSettings, RoomVisibility, Screen } from './types/game';

const defaults: GameSettings = {
	rounds: 5,
	drawTime: 80,
	maxPlayers: 10,
	hints: true,
	difficulty: 'mixed',
};

export default function App() {
	const [screen, setScreen] = useState<Screen>('home');
	const [name, setName] = useState('Ankit');
	const [connectionRestored, setConnectionRestored] = useState(false);
	const previousConnection = useRef<'connected' | 'reconnecting' | 'disconnected'>('reconnecting');
	const game = useGame(name, defaults, setScreen);
	const settings = game.settings;
	const roomCode = game.room?.code ?? '';

	useEffect(() => {
		const wasConnected = previousConnection.current === 'connected';
		previousConnection.current = game.connectionStatus;
		if (game.connectionStatus === 'connected' && !wasConnected && game.room) {
			setConnectionRestored(true);
			const timeout = window.setTimeout(() => setConnectionRestored(false), 1800);
			return () => window.clearTimeout(timeout);
		}
	}, [game.connectionStatus, game.room]);

	function create(nextSettings: GameSettings, room: { name?: string; visibility?: RoomVisibility }) {
		game.createRoom(nextSettings, room);
	}

	function join(code: string) {
		game.joinRoom(code);
	}

	return (
		<>
			{game.error && <div className="server-error" role="alert"><span>{game.error}</span><button aria-label="Dismiss error" onClick={game.dismissError}><X size={15} /></button></div>}
			{game.room && game.connectionStatus !== 'connected' && <div className="connection-banner" role="status">{game.connectionStatus === 'reconnecting' ? 'Reconnecting to your room...' : 'Disconnected from the game server.'}</div>}
			{connectionRestored && <div className="connection-banner connected" role="status">Connection restored.</div>}
			{screen === 'home' && <Home name={name} setName={setName} create={create} join={join} pending={game.pending} connected={game.isConnected} />}
			{screen === 'lobby' && (
				<Lobby
					code={roomCode}
					items={game.players}
					settings={settings}
					setSettings={game.updateSettings}
					start={game.startGame}
					onReady={game.setReady}
					onLeave={game.leaveRoom}
					isReady={Boolean(game.players[0]?.isReady)}
					pending={Boolean(game.pending)}
					scoreFeedback={game.scoreFeedback}
				/>
			)}
			{screen === 'game' && (
				<Game
					code={roomCode}
					items={game.players}
					settings={settings}
					round={game.round}
					phase={game.phase}
					word={game.word}
					options={game.options}
					timeLeft={game.time}
					choiceTimeLeft={game.choiceTime}
					messages={game.messages}
					strokes={game.strokes}
					canRedo={game.canRedo}
					roundSummary={game.roundSummary}
					scoreFeedback={game.scoreFeedback}
					connectionStatus={game.connectionStatus}
					onChoose={game.chooseWord}
					onStroke={game.drawStroke}
					onClear={game.clearCanvas}
					onUndo={game.undoCanvas}
					onRedo={game.redoCanvas}
					onGuess={game.sendGuess}
				/>
			)}
			{screen === 'results' && <Results items={game.players} again={game.requestRematch} home={game.leaveRoom} />}
		</>
	);
}
