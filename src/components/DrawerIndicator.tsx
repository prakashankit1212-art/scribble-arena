import type { Player } from '../types/game';

export function DrawerIndicator({ player }: { player: Player }) {
	return (
		<div className="drawer-indicator" role="status" aria-label={`${player.name} is drawing`}>
			<div className="drawer-indicator-avatar" style={{ background: player.color }} aria-hidden="true">{player.avatar}</div>
			<div>
				<small>CURRENT DRAWER</small>
				<strong>{player.name}</strong>
			</div>
			<span className="drawer-indicator-pulse" aria-hidden="true" />
		</div>
	);
}
