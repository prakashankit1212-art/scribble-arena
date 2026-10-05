import type { Player, ScoreFeedback } from '../types/game';

export function Players({ items, feedback = [] }: { items: Player[]; feedback?: ScoreFeedback[] }) {
	return (
		<div className="players" aria-label="Room players">
			{items.map((player) => {
				const recentFeedback = feedback.filter((entry) => entry.playerId === player.id);
				return (
					<div
						className={`player${player.isDrawer ? ' current-drawer' : ''}${player.isConnected === false ? ' disconnected' : ''}`}
						key={player.id}
						aria-label={`${player.name}, ${player.score} points${player.isConnected === false ? ', disconnected' : ''}`}
					>
						<div className="avatar" style={{ background: player.color }} aria-hidden="true">{player.avatar}</div>
						<div className="player-name">
							<b>{player.name}</b>
							{player.isHost && <small>HOST</small>}
							{player.isDrawer && <small className="drawing">DRAWING</small>}
							{player.isReady && <small className="ready-badge">READY</small>}
							{player.isConnected === false && <small className="status-badge">DISCONNECTED</small>}
						</div>
						<strong aria-label={`${player.score} points`}>{player.score}</strong>
						{recentFeedback.map((entry) => (
							<span className="score-pop" key={entry.id}>
								{entry.points > 0 && `+${entry.points}`}
								{entry.drawerBonus > 0 && ` +${entry.drawerBonus} drawer bonus`}
							</span>
						))}
					</div>
				);
			})}
		</div>
	);
}
