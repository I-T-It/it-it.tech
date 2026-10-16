/**
 * Draws the board on one canvas. No DOM of its own: the runtime hands it the canvas, its 2D
 * context and, per frame, the scroll position, the drawn length of every trace and the live pulses.
 *
 * ```ts
 * const renderer = new Renderer(canvas, canvas.getContext('2d')!);
 * renderer.resize(innerWidth, innerHeight, devicePixelRatio); // on resize only: it clears
 * renderer.setBoard(board);                                   // after every (re)layout
 * renderer.draw({ view: { scrollX, scrollY, width, height }, drawn: (id) => growth.drawn(id), pulses: pulses.alive });
 * ```
 *
 * The canvas is fixed to the viewport, so every frame clears it and draws the board translated by
 * the scroll offset, in CSS px scaled by the device pixel ratio (capped at 2). Only traces whose
 * bounds cross the viewport are drawn.
 *
 * Glow is two passes, never `shadowBlur`: a 7 px halo at 0.18 alpha, stroked as one path per
 * colour so crossings don't stack up, then a 2 px core per trace with a gradient from the trace
 * colour toward the pad colour. Per kind:
 * - `spine`: halo and core, plus a brighter head at its front while it is part drawn.
 * - `branch`: halo and core, a head at its tip while it grows, a pad on the pin once it arrives.
 * - `socket`: the full glow, an extra wide halo under the normal one; no pad on the port, the
 *   socket's own artwork carries the line on.
 * - `hero`: a slightly quieter halo and core, a head at its tip while it grows, a via at its end
 *   once it arrives, and a via at its start when it starts on the board.
 * - `decor`: a quieter halo and core, a via at its end.
 * Pads and vias are filled circles. Pulses are drawn last with `lighter` compositing.
 */

import { pointAt, slicePolyline, type Point } from './geometry.js';
import type { Board, Side, Trace } from './layout.js';

/** The backing store never uses more than this many device pixels per CSS px. */
export const MAX_DPR = 2;
export const HALO_WIDTH = 7;
export const HALO_ALPHA = 0.18;
export const CORE_WIDTH = 2;
/** The socket traces' extra halo, under the normal one. */
export const SOCKET_GLOW_WIDTH = 15;
export const SOCKET_GLOW_ALPHA = 0.08;
/** Decoration sits back: its halo and core are fainter. */
export const DECOR_HALO_ALPHA = 0.08;
export const DECOR_CORE_ALPHA = 0.5;
/** The hero field is dense: a little quieter than the spine and branches, louder than decoration. */
export const HERO_HALO_ALPHA = 0.12;
export const HERO_CORE_ALPHA = 0.8;
export const PAD_RADIUS = 3.5;
export const VIA_RADIUS = 3.5;
export const VIA_HOLE_RADIUS = 1.5;
/** The bright head at the tip of a growing trace: this many px of line, plus a glow dot. */
export const HEAD_LENGTH = 48;
export const HEAD_GLOW_RADIUS = 7;
export const HEAD_DOT_RADIUS = 2.5;
export const PULSE_GLOW_RADIUS = 8;
export const PULSE_DOT_RADIUS = 2.5;
/** Traces this close outside the viewport still get drawn: their halo and pads reach in. */
export const CULL_MARGIN = 24;

export interface SideColours {
	/** The trace colour: cyan on the left, green on the right. */
	trace: string;
	/** The pad colour the core fades toward, and the colour of pads and heads. */
	pad: string;
}

export interface Palette {
	left: SideColours;
	right: SideColours;
	/** The board colour, for the hole in a via. */
	board: string;
}

/** The brand colours, also the tokens in `app.css`. */
export const DEFAULT_PALETTE: Palette = {
	left: { trace: '#00e7ff', pad: '#d9fbff' },
	right: { trace: '#3fd83f', pad: '#c9f4c9' },
	board: '#001333'
};

/** Anything with a backing store size: the canvas, or a stand-in in tests. */
export interface Surface {
	width: number;
	height: number;
}

/** The viewport in document CSS px. */
export interface View {
	scrollX: number;
	scrollY: number;
	width: number;
	height: number;
}

export interface FramePulse {
	point: Point;
	trace: { side: Side };
}

export interface FrameInput {
	view: View;
	/** Drawn length of a trace in px. */
	drawn: (traceId: string) => number;
	pulses: readonly FramePulse[];
}

export interface DrawStats {
	/** How many traces crossed the viewport and had something drawn. */
	traces: number;
}

interface Item {
	trace: Trace;
	/** The drawn part, in document px. */
	points: Point[];
	drawn: number;
	full: boolean;
}

const SIDES: readonly Side[] = ['left', 'right'];

/** The device pixel ratio the canvas uses: at least 1, at most `MAX_DPR`. */
export function capDpr(dpr: number): number {
	if (!Number.isFinite(dpr) || dpr < 1) return 1;
	return Math.min(MAX_DPR, dpr);
}

function crosses(trace: Trace, x0: number, y0: number, x1: number, y1: number): boolean {
	const box = trace.bbox;
	return box.x <= x1 && box.x + box.width >= x0 && box.y <= y1 && box.y + box.height >= y0;
}

export class Renderer {
	#canvas: Surface;
	#ctx: CanvasRenderingContext2D;
	#palette: Palette;
	#board: Board | null = null;
	#dpr = 1;
	#cssWidth = 0;
	#cssHeight = 0;
	#gradients = new Map<string, CanvasGradient>();

	constructor(canvas: Surface, ctx: CanvasRenderingContext2D, palette: Palette = DEFAULT_PALETTE) {
		this.#canvas = canvas;
		this.#ctx = ctx;
		this.#palette = palette;
	}

	/** The device pixel ratio in use, after the cap. */
	get dpr(): number {
		return this.#dpr;
	}

	/**
	 * Sizes the backing store for a viewport of `cssWidth` x `cssHeight` CSS px. Returns true when
	 * the size changed (which also cleared the canvas), false when there was nothing to do.
	 */
	resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): boolean {
		const dpr = capDpr(devicePixelRatio);
		const width = Math.max(0, Math.round(cssWidth * dpr));
		const height = Math.max(0, Math.round(cssHeight * dpr));
		this.#cssWidth = cssWidth;
		this.#cssHeight = cssHeight;
		if (dpr === this.#dpr && width === this.#canvas.width && height === this.#canvas.height) {
			return false;
		}
		this.#dpr = dpr;
		this.#canvas.width = width;
		this.#canvas.height = height;
		return true;
	}

	/** Swaps in a new board, or none. */
	setBoard(board: Board | null): void {
		this.#board = board;
		this.#gradients.clear();
	}

	setPalette(palette: Palette): void {
		this.#palette = palette;
		this.#gradients.clear();
	}

	/** Clears the canvas and draws one frame. */
	draw(frame: FrameInput): DrawStats {
		const ctx = this.#ctx;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
		const board = this.#board;
		if (!board) return { traces: 0 };

		const { scrollX, scrollY } = frame.view;
		const width = frame.view.width || this.#cssWidth;
		const height = frame.view.height || this.#cssHeight;
		const dpr = this.#dpr;
		// `+ 0` turns -0 into 0.
		ctx.setTransform(dpr, 0, 0, dpr, -scrollX * dpr + 0, -scrollY * dpr + 0);
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		const x0 = scrollX - CULL_MARGIN;
		const y0 = scrollY - CULL_MARGIN;
		const x1 = scrollX + width + CULL_MARGIN;
		const y1 = scrollY + height + CULL_MARGIN;
		const items: Item[] = [];
		for (const trace of board.traces) {
			if (!crosses(trace, x0, y0, x1, y1)) continue;
			const drawn = Math.min(trace.length, frame.drawn(trace.id));
			if (!(drawn > 0)) continue;
			const points = slicePolyline(trace.points, trace.lengths, drawn);
			if (points.length < 2) continue;
			items.push({ trace, points, drawn, full: drawn >= trace.length });
		}

		this.#halos(items);
		this.#cores(items);
		this.#ends(items);
		this.#heads(items);
		this.#pulses(frame.pulses, x0, y0, x1, y1);
		return { traces: items.length };
	}

	/** Pass 1: one wide, faint stroke per colour and weight. */
	#halos(items: readonly Item[]): void {
		const ctx = this.#ctx;
		for (const side of SIDES) {
			const colour = this.#palette[side].trace;
			const ofSide = items.filter((i) => i.trace.side === side);
			const socket = ofSide.filter((i) => i.trace.kind === 'socket');
			const decor = ofSide.filter((i) => i.trace.kind === 'decor');
			const hero = ofSide.filter((i) => i.trace.kind === 'hero');
			const main = ofSide.filter((i) => i.trace.kind !== 'decor' && i.trace.kind !== 'hero');
			this.#strokeAll(socket, colour, SOCKET_GLOW_WIDTH, SOCKET_GLOW_ALPHA);
			this.#strokeAll(decor, colour, HALO_WIDTH, DECOR_HALO_ALPHA);
			this.#strokeAll(hero, colour, HALO_WIDTH, HERO_HALO_ALPHA);
			this.#strokeAll(main, colour, HALO_WIDTH, HALO_ALPHA);
		}
		ctx.globalAlpha = 1;
	}

	/** Pass 2: a thin core per trace, fading toward the pad colour. */
	#cores(items: readonly Item[]): void {
		const ctx = this.#ctx;
		ctx.lineWidth = CORE_WIDTH;
		for (const item of items) {
			const kind = item.trace.kind;
			ctx.globalAlpha = kind === 'decor' ? DECOR_CORE_ALPHA : kind === 'hero' ? HERO_CORE_ALPHA : 1;
			ctx.strokeStyle = this.#gradient(item.trace);
			ctx.beginPath();
			this.#polyline(item.points);
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
	}

	/**
	 * Pads on pins and vias at the ends of the traces that are complete, and a via at the start of
	 * a trace that starts on the board, as soon as it shows.
	 */
	#ends(items: readonly Item[]): void {
		for (const side of SIDES) {
			const colours = this.#palette[side];
			const pads: Point[] = [];
			const vias: Point[] = [];
			for (const item of items) {
				if (item.trace.side !== side) continue;
				if (item.trace.startVia) vias.push(item.trace.points[0]);
				if (!item.full) continue;
				const end = item.trace.points[item.trace.points.length - 1];
				if (item.trace.end.kind === 'pin') pads.push(end);
				else if (item.trace.end.kind === 'via') vias.push(end);
			}
			this.#fillCircles(pads, PAD_RADIUS, colours.pad, 1);
			this.#fillCircles(vias, VIA_RADIUS, colours.trace, 1);
			this.#fillCircles(vias, VIA_HOLE_RADIUS, this.#palette.board, 1);
		}
	}

	/** A brighter head at the tip of every part-drawn spine, branch and socket trace. */
	#heads(items: readonly Item[]): void {
		const ctx = this.#ctx;
		for (const side of SIDES) {
			const colours = this.#palette[side];
			const growing = items.filter(
				(i) => !i.full && i.trace.side === side && i.trace.kind !== 'decor'
			);
			if (growing.length === 0) continue;
			ctx.lineWidth = CORE_WIDTH;
			ctx.strokeStyle = colours.pad;
			ctx.globalAlpha = 1;
			ctx.beginPath();
			for (const item of growing) {
				this.#polyline(sliceBetween(item.trace, item.drawn - HEAD_LENGTH, item.drawn));
			}
			ctx.stroke();
			const tips = growing.map((i) => i.points[i.points.length - 1]);
			this.#fillCircles(tips, HEAD_GLOW_RADIUS, colours.trace, 0.3);
			this.#fillCircles(tips, HEAD_DOT_RADIUS, colours.pad, 1);
		}
		ctx.globalAlpha = 1;
	}

	#pulses(pulses: readonly FramePulse[], x0: number, y0: number, x1: number, y1: number): void {
		if (pulses.length === 0) return;
		const ctx = this.#ctx;
		ctx.globalCompositeOperation = 'lighter';
		for (const side of SIDES) {
			const points = pulses
				.filter((p) => p.trace.side === side)
				.map((p) => p.point)
				.filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1);
			this.#fillCircles(points, PULSE_GLOW_RADIUS, this.#palette[side].trace, 0.35);
			this.#fillCircles(points, PULSE_DOT_RADIUS, this.#palette[side].pad, 1);
		}
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = 1;
	}

	#strokeAll(items: readonly Item[], colour: string, width: number, alpha: number): void {
		if (items.length === 0) return;
		const ctx = this.#ctx;
		ctx.lineWidth = width;
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = colour;
		ctx.beginPath();
		for (const item of items) this.#polyline(item.points);
		ctx.stroke();
	}

	#fillCircles(points: readonly Point[], radius: number, colour: string, alpha: number): void {
		if (points.length === 0) return;
		const ctx = this.#ctx;
		ctx.globalAlpha = alpha;
		ctx.fillStyle = colour;
		ctx.beginPath();
		for (const p of points) {
			ctx.moveTo(p.x + radius, p.y);
			ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
		}
		ctx.fill();
	}

	#polyline(points: readonly Point[]): void {
		const ctx = this.#ctx;
		ctx.moveTo(points[0].x, points[0].y);
		for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
	}

	#gradient(trace: Trace): CanvasGradient | string {
		const colours = this.#palette[trace.side];
		const first = trace.points[0];
		const last = trace.points[trace.points.length - 1];
		if (!first || !last || (first.x === last.x && first.y === last.y)) return colours.trace;
		let gradient = this.#gradients.get(trace.id);
		if (!gradient) {
			gradient = this.#ctx.createLinearGradient(first.x, first.y, last.x, last.y);
			gradient.addColorStop(0, colours.trace);
			gradient.addColorStop(0.7, colours.trace);
			gradient.addColorStop(1, colours.pad);
			this.#gradients.set(trace.id, gradient);
		}
		return gradient;
	}
}

/** The part of a trace from `from` to `to` px along it, corners included. */
function sliceBetween(trace: Trace, from: number, to: number): Point[] {
	const start = Math.max(0, from);
	const out = [pointAt(trace.points, trace.lengths, start)];
	for (let i = 0; i < trace.points.length; i++) {
		if (trace.lengths[i] > start && trace.lengths[i] < to) out.push(trace.points[i]);
	}
	out.push(pointAt(trace.points, trace.lengths, to));
	return out;
}
