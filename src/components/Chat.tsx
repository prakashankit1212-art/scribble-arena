import { Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types/game';

export function Chat({ messages, onSend, disabled = false, mobileOpen = false, onClose }: {
	messages: ChatMessage[];
	onSend: (text: string) => void;
	disabled?: boolean;
	 mobileOpen?: boolean;
	onClose?: () => void;
}) {
	const [value, setValue] = useState('');
	const [notice, setNotice] = useState('');
	const listRef = useRef<HTMLDivElement>(null);
	const lastSentAt = useRef(0);

	useEffect(() => {
		listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
	}, [messages]);

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const text = value.trim();
		if (!text || disabled) return;
		if (Date.now() - lastSentAt.current < 500) {
			setNotice('Slow down for a moment.');
			return;
		}
		lastSentAt.current = Date.now();
		setNotice('');
		onSend(text);
		setValue('');
	}

	return (
		<aside className={`card chat${mobileOpen ? ' mobile-open' : ''}`} aria-label="Live guesses">
			<header>
				<div><small>LIVE</small><h3>Guesses</h3></div>
				<div className="chat-header-actions"><i aria-label="Live connection" />{onClose && <button className="mobile-sheet-close" aria-label="Close chat" onClick={onClose}><X size={16} /></button>}</div>
			</header>
			<div className="chat-list" ref={listRef} aria-live="polite" aria-relevant="additions">
				{messages.map((message) => (
					<div key={message.id} className={`message ${message.type}`}>
						{message.type === 'system'
							? <span>{message.text}</span>
							: <><b>{message.playerName}</b><span>{message.text}</span></>}
						{message.createdAt && <time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}
					</div>
				))}
			</div>
			{notice && <small className="chat-notice" role="status">{notice}</small>}
			<form onSubmit={submit}>
				<input aria-label="Your guess" value={value} maxLength={180} onChange={(event) => setValue(event.target.value)} placeholder={disabled ? 'Guessing is unavailable' : 'Type your guess...'} disabled={disabled} />
				<button aria-label="Send guess" disabled={disabled || !value.trim()}><Send size={16} /></button>
			</form>
		</aside>
	);
}
