import { Eraser, Paintbrush, Redo2, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point, Stroke } from '../types/game';
import { COLORS } from '../lib/data';

interface CanvasProps {
	strokes: Stroke[];
	onStroke: (stroke: Stroke) => void;
	onClear: () => void;
	onUndo: () => void;
	onRedo: () => void;
	canRedo: boolean;
	disabled?: boolean;
}

export function Canvas({ strokes, onStroke, onClear, onUndo, onRedo, canRedo, disabled = false }: CanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const cursorRef = useRef<HTMLSpanElement>(null);
	const livePoints = useRef<Point[]>([]);
	const lastPoint = useRef<Point | null>(null);
	const [color, setColor] = useState(COLORS[0]);
	const [size, setSize] = useState(8);
	const [tool, setTool] = useState<Stroke['tool']>('pen');

	const redraw = useCallback(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context) return;
		const { width, height } = canvas.getBoundingClientRect();
		context.clearRect(0, 0, width, height);
		context.fillStyle = '#fff';
		context.fillRect(0, 0, width, height);
		context.lineCap = 'round';
		context.lineJoin = 'round';
		for (const stroke of strokes) {
			context.beginPath();
			context.strokeStyle = stroke.tool === 'eraser' ? '#fff' : stroke.color;
			context.lineWidth = stroke.size;
			if (stroke.points.length === 1) {
				context.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
				context.fillStyle = context.strokeStyle;
				context.fill();
				continue;
			}
			context.moveTo(stroke.points[0].x, stroke.points[0].y);
			for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
			context.stroke();
		}
	}, [strokes]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const resize = () => {
			const bounds = canvas.getBoundingClientRect();
			const ratio = window.devicePixelRatio || 1;
			canvas.width = Math.round(bounds.width * ratio);
			canvas.height = Math.round(bounds.height * ratio);
			canvas.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
			redraw();
		};
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();
		return () => observer.disconnect();
	}, [redraw]);

	useEffect(redraw, [redraw]);

	const localPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
		const bounds = event.currentTarget.getBoundingClientRect();
		return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
	};

	const updateBrushCursor = (event: React.PointerEvent<HTMLCanvasElement>) => {
		const cursor = cursorRef.current;
		if (!cursor) return;
		const point = localPoint(event);
		cursor.style.display = disabled ? 'none' : 'block';
		cursor.style.width = `${size}px`;
		cursor.style.height = `${size}px`;
		cursor.style.borderColor = tool === 'eraser' ? '#73738a' : color;
		cursor.style.transform = `translate(${point.x}px, ${point.y}px)`;
	};

	const drawSegment = (from: Point, to: Point) => {
		const context = canvasRef.current?.getContext('2d');
		if (!context) return;
		context.beginPath();
		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.strokeStyle = tool === 'eraser' ? '#fff' : color;
		context.lineWidth = size;
		context.moveTo(from.x, from.y);
		context.lineTo(to.x, to.y);
		context.stroke();
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (disabled || livePoints.current.length < 2) {
			livePoints.current = [];
			lastPoint.current = null;
			return;
		}
		onStroke({ points: livePoints.current, color, size, tool });
		livePoints.current = [];
		lastPoint.current = null;
		event.currentTarget.releasePointerCapture(event.pointerId);
	};

	return (
		<div className="board">
			<div className="canvas-stage">
				<canvas
					ref={canvasRef}
					className={disabled ? 'disabled' : ''}
					aria-label={disabled ? 'Drawing canvas. Watch the current drawer.' : 'Drawing canvas. Use the tools below to draw.'}
					aria-disabled={disabled}
					onPointerDown={(event) => {
						if (disabled) return;
						event.currentTarget.setPointerCapture(event.pointerId);
						const point = localPoint(event);
						livePoints.current = [point];
						lastPoint.current = point;
					}}
					onPointerMove={(event) => {
						updateBrushCursor(event);
						if (disabled || !lastPoint.current) return;
						const point = localPoint(event);
						const deltaX = point.x - lastPoint.current.x;
						const deltaY = point.y - lastPoint.current.y;
						if (deltaX * deltaX + deltaY * deltaY < 4) return;
						drawSegment(lastPoint.current, point);
						livePoints.current.push(point);
						lastPoint.current = point;
					}}
					onPointerUp={handlePointerUp}
					onPointerCancel={() => { livePoints.current = []; lastPoint.current = null; }}
					onPointerLeave={() => { if (!lastPoint.current && cursorRef.current) cursorRef.current.style.display = 'none'; }}
				/>
				<span ref={cursorRef} className="brush-cursor" aria-hidden="true" />
			</div>
			{!disabled && <div className="tools" aria-label="Drawing tools">
				<div className="tool-group" role="group" aria-label="Tool">
					<button type="button" aria-label="Pen" title="Pen" aria-pressed={tool === 'pen'} className={tool === 'pen' ? 'active' : ''} disabled={disabled} onClick={() => setTool('pen')}><Paintbrush size={16} /></button>
					<button type="button" aria-label="Eraser" title="Eraser" aria-pressed={tool === 'eraser'} className={tool === 'eraser' ? 'active' : ''} disabled={disabled} onClick={() => setTool('eraser')}><Eraser size={16} /></button>
				</div>
				<div className="colors" role="group" aria-label="Color palette">
					{COLORS.slice(0, 9).map((swatch) => (
						<button key={swatch} type="button" aria-label={`Color ${swatch}`} aria-pressed={color === swatch && tool === 'pen'} className={color === swatch && tool === 'pen' ? 'selected' : ''} style={{ background: swatch }} disabled={disabled} onClick={() => { setColor(swatch); setTool('pen'); }} />
					))}
					<label className="custom-color" title="Custom color">
						<span aria-hidden="true">+</span>
						<input aria-label="Custom color" type="color" value={color} disabled={disabled} onChange={(event) => { setColor(event.target.value); setTool('pen'); }} />
					</label>
				</div>
				<label className="brush-control">Brush <output>{size}px</output><input aria-label="Brush size" type="range" min="2" max="36" value={size} disabled={disabled} onChange={(event) => setSize(Number(event.target.value))} /></label>
				<div className="tool-group" role="group" aria-label="History">
					<button type="button" aria-label="Undo" title="Undo" disabled={disabled || strokes.length === 0} onClick={onUndo}><Undo2 size={16} /></button>
					<button type="button" aria-label="Redo" title="Redo" disabled={disabled || !canRedo} onClick={onRedo}><Redo2 size={16} /></button>
				</div>
				<button type="button" aria-label="Clear canvas" title="Clear canvas" disabled={disabled || strokes.length === 0} onClick={onClear}><Trash2 size={16} /></button>
			</div>}
		</div>
	);
}
