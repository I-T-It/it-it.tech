/**
 * Runs the board on its canvas: measures the registered chips, obstacles and socket, lays out,
 * grows the traces as the page scrolls, runs pointer pulses and draws. Client-only; `PcbBoard`
 * starts it on mount and destroys it on unmount.
 *
 * ```ts
 * const runtime = new BoardRuntime(canvas);
 * runtime.start(); // lays out after document.fonts.ready, then draws the first frame
 * // later:
 * runtime.destroy();
 * ```
 *
 * The frame loop runs only while something moves: a scroll frame (passive `scroll` listener plus
 * one requestAnimationFrame), a latched or socket trace that still grows, a booting chip, or a
 * live pulse. Every frame calls `growth.update` with the scroll position, so the spine follows the
 * scroll both ways; when nothing is busy after that frame, the loop stops until the next event.
 * The socket traces grow from the first frame, so the load sequence runs once, right after the
 * first layout.
 *
 * Relayout: a ResizeObserver on `<html>` (window resize, orientation, font swap, a `<details>`
 * toggle) and registry changes, debounced by 200 ms. Booted chips keep their branches full.
 * Hidden tab: the loop pauses and the pulses go. Pointer: a mouse or pen move spawns pulses near
 * the pointer; on touch only a tap does. A pulse that reaches a pin flashes it.
 *
 * Reduced motion (a live media query): every trace full, every chip on, one draw, no pulses, and
 * `data-pcb-state="static"`. The canvas is fixed to the viewport, so a scroll still redraws to keep
 * the board in place, without any growth. No 2D context, or a layout that throws: the board stays
 * blank, `data-pcb-state="off"`, and every chip goes on so no content waits for the board.
 *
 * The hero: when one is registered, the board fills it edge to edge with the hero field (see
 * `hero.ts`). Its content is the socket and the children of the obstacles inside it, kept in a
 * clear ellipse; its links and buttons (the scroll indicator) are obstacles too. The two lead
 * traces grow in first; when they arrive (`growth.powered`), the socket gets `data-power="on"` and
 * the logo or photo frame draws itself from where they touch. The rest of the field builds up
 * after that, once. Reduced motion and the fallback power the socket at once.
 *
 * `data-pcb-state` on the canvas: `init` (waiting for fonts), `running` (a frame is queued),
 * `idle`, `static` or `off`. In test runs (`debug`, by default when the browser is automated) the
 * canvas also carries `data-spine-front` (the front in document px), `data-pulses` (live pulses),
 * `data-hero-traces` (how many hero traces) and `data-hero-ellipse` (`cx cy rx ry` in document px,
 * only with a hero).
 */

import type { Point, Rect } from './geometry.js';
import { Growth } from './growth.js';
import { heroEllipse } from './hero.js';
import { layoutBoard, type Board, type HeroInput, type LayoutInput } from './layout.js';
import { Pulses } from './pulses.js';
import {
	chips as registeredChips,
	hero as registeredHero,
	obstacles as registeredObstacles,
	onChange,
	socket as registeredSocket,
	type ChipHandle
} from './registry.svelte.js';
import { DEFAULT_PALETTE, Renderer, type Palette } from './renderer.js';

/** Relayouts wait for this many ms of quiet. */
export const RELAYOUT_DEBOUNCE_MS = 200;

export type BoardState = 'init' | 'running' | 'idle' | 'static' | 'off';

/** The part of a MediaQueryList the runtime uses. */
export interface MotionQuery {
	readonly matches: boolean;
	addEventListener(type: 'change', listener: () => void): void;
	removeEventListener(type: 'change', listener: () => void): void;
}

export interface RuntimeOptions {
	/** Sets `data-spine-front` and `data-pulses` on the canvas. Default: `navigator.webdriver`. */
	debug?: boolean;
	/** Default: `matchMedia('(prefers-reduced-motion: reduce)')`. */
	reducedMotion?: MotionQuery;
	/** The clock for growth and pulses, in ms. Default: `performance.now()`. */
	now?: () => number;
}

function docRect(el: Element, scrollX: number, scrollY: number): Rect {
	const r = el.getBoundingClientRect();
	return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
}

function docCentre(el: Element, scrollX: number, scrollY: number): Point {
	const r = el.getBoundingClientRect();
	return { x: r.left + r.width / 2 + scrollX, y: r.top + r.height / 2 + scrollY };
}

/** The canvas's 2D context, or null when there is none (or asking for it throws). */
function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
	try {
		return canvas.getContext('2d');
	} catch {
		return null;
	}
}

function rendered(rect: Rect): boolean {
	return rect.width > 0 || rect.height > 0;
}

/** The trace and pad colours from the tokens in app.css, with the brand colours as fallback. */
function readPalette(): Palette {
	const style = getComputedStyle(document.documentElement);
	const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
	return {
		left: {
			trace: token('--trace-cyan', DEFAULT_PALETTE.left.trace),
			pad: token('--pad-cyan', DEFAULT_PALETTE.left.pad)
		},
		right: {
			trace: token('--trace-green', DEFAULT_PALETTE.right.trace),
			pad: token('--pad-green', DEFAULT_PALETTE.right.pad)
		},
		board: token('--board-navy', DEFAULT_PALETTE.board)
	};
}

export class BoardRuntime {
	readonly canvas: HTMLCanvasElement;
	/** Mirrors `data-pcb-state`. */
	state = $state<BoardState>('init');

	/** The current board; null before the first layout. */
	board: Board | null = null;
	growth: Growth | null = null;
	/** Frames drawn so far. */
	frames = 0;
	/** Layouts done so far. */
	layouts = 0;
	/** How long measuring the registry took for the last layout, in ms. */
	lastMeasureMs = 0;
	/** How long the last `layoutBoard` took, in ms. */
	lastLayoutMs = 0;
	/** The slowest frame so far, in ms of main-thread work. */
	maxFrameMs = 0;

	#debug: boolean;
	#motion: MotionQuery | null;
	#now: () => number;
	#renderer: Renderer | null = null;
	#pulses: Pulses | null = null;
	#handles: ChipHandle[] = [];
	#static = false;
	#started = false;
	#destroyed = false;
	#raf = 0;
	#relayoutTimer: ReturnType<typeof setTimeout> | undefined;
	#laidOutSize = '';
	#observer: ResizeObserver | null = null;
	#cleanups: (() => void)[] = [];

	constructor(canvas: HTMLCanvasElement, options: RuntimeOptions = {}) {
		this.canvas = canvas;
		this.#debug = options.debug ?? navigator.webdriver === true;
		this.#motion =
			options.reducedMotion ??
			(typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null);
		this.#now = options.now ?? (() => performance.now());
		canvas.dataset.pcbState = 'init';
	}

	/** Live pulses. */
	get pulseCount(): number {
		return this.#pulses?.size ?? 0;
	}

	/**
	 * Waits for the fonts, lays out and draws the first frame. Resolves once that is done, or right
	 * away when the canvas has no 2D context. Never rejects.
	 */
	async start(): Promise<void> {
		if (this.#started || this.#destroyed) return;
		this.#started = true;
		const ctx = contextOf(this.canvas);
		if (!ctx) {
			this.#fallback();
			return;
		}
		this.#renderer = new Renderer(this.canvas, ctx, readPalette());

		try {
			await document.fonts?.ready;
		} catch {
			// Fonts that fail to load still leave a page to lay out.
		}
		if (this.#destroyed) return;

		this.#static = this.#motion?.matches ?? false;
		this.#resizeCanvas();
		if (!this.#layout()) return;
		this.#listen();
		this.#tick();
	}

	/** Stops everything. Safe to call more than once. */
	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		if (this.#raf) cancelAnimationFrame(this.#raf);
		this.#raf = 0;
		clearTimeout(this.#relayoutTimer);
		this.#observer?.disconnect();
		for (const cleanup of this.#cleanups) cleanup();
		this.#cleanups = [];
	}

	#listen(): void {
		const add = <K extends keyof WindowEventMap>(
			type: K,
			listener: (event: WindowEventMap[K]) => void
		) => {
			window.addEventListener(type, listener, { passive: true });
			this.#cleanups.push(() => window.removeEventListener(type, listener));
		};
		add('scroll', this.#request);
		add('resize', this.#onResize);
		add('pointermove', this.#onPointerMove);
		add('pointerdown', this.#onPointerDown);

		document.addEventListener('visibilitychange', this.#onVisibility);
		this.#cleanups.push(() => document.removeEventListener('visibilitychange', this.#onVisibility));

		if (this.#motion) {
			const motion = this.#motion;
			motion.addEventListener('change', this.#onMotion);
			this.#cleanups.push(() => motion.removeEventListener('change', this.#onMotion));
		}

		this.#cleanups.push(onChange(this.#scheduleRelayout));

		if (typeof ResizeObserver === 'function') {
			this.#observer = new ResizeObserver(() => {
				if (this.#documentSize() !== this.#laidOutSize) this.#scheduleRelayout();
			});
			this.#observer.observe(document.documentElement);
		}
	}

	/** Measures the registry and lays out. Returns false (and falls back) when that fails. */
	#layout(): boolean {
		let board: Board;
		try {
			const measuring = performance.now();
			const input = this.#measure();
			const laying = performance.now();
			board = layoutBoard(input);
			this.lastMeasureMs = laying - measuring;
			this.lastLayoutMs = performance.now() - laying;
		} catch (error) {
			// The board is decoration: the page goes on without it, chips lit.
			console.warn('PCB board layout failed', error);
			this.#fallback();
			return false;
		}
		this.layouts++;
		this.#laidOutSize = this.#documentSize();

		if (this.growth && this.#pulses) {
			this.growth.relayout(board);
			this.#pulses.setTraces(board.traces);
		} else {
			const growth = new Growth(board);
			this.growth = growth;
			this.#pulses = new Pulses(board.traces, { reach: (id) => growth.drawn(id) });
		}
		if (this.#static) this.growth.snapAll();
		this.board = board;
		this.#renderer?.setBoard(board);
		this.#handles = registeredChips();
		if (this.#debug) {
			const data = this.canvas.dataset;
			const e = board.hero?.ellipse;
			if (e) data.heroEllipse = [e.cx, e.cy, e.rx, e.ry].map((v) => v.toFixed(1)).join(' ');
			else delete data.heroEllipse;
			data.heroTraces = String(board.traces.filter((t) => t.kind === 'hero').length);
		}
		return true;
	}

	#measure(): LayoutInput {
		const sx = window.scrollX;
		const sy = window.scrollY;
		const root = document.documentElement;
		const chips = registeredChips()
			.filter((chip) => !chip.destroyed && chip.el.isConnected)
			.map((chip) => ({
				id: chip.id,
				side: chip.side,
				rect: docRect(chip.el, sx, sy),
				pins: chip.pins().map((pin) => docCentre(pin, sx, sy))
			}))
			.filter((chip) => rendered(chip.rect));
		const obstacleEls = registeredObstacles().filter((el) => el.isConnected);
		const obstacles = obstacleEls.map((el) => docRect(el, sx, sy)).filter(rendered);
		const port = registeredSocket();
		const socketRect = port?.el.isConnected ? docRect(port.el, sx, sy) : null;
		const portEls = port?.ports() ?? [];
		const socket =
			port && socketRect && rendered(socketRect)
				? {
						rect: socketRect,
						ports: portEls.map((el) => docCentre(el, sx, sy)),
						// The ports marked data-lead take the two lead traces of the hero.
						leads: portEls.flatMap((el, i) => (el.hasAttribute('data-lead') ? [i] : []))
					}
				: undefined;

		// The hero: as wide as the board, its content (the socket and the obstacles in it) inside a
		// clear ellipse, its links and buttons in the way of the field.
		let hero: HeroInput | undefined;
		const heroHandle = registeredHero();
		const heroRect = heroHandle?.el.isConnected ? docRect(heroHandle.el, sx, sy) : null;
		if (heroHandle && heroRect && rendered(heroRect)) {
			const area = { x: 0, y: heroRect.y, width: root.clientWidth, height: heroRect.height };
			// Block by block: a wide name over narrow lines fits a flatter ellipse than their box.
			const content = obstacleEls
				.filter((el) => heroHandle.el.contains(el))
				.flatMap((el) => (el.children.length > 0 ? [...el.children] : [el]))
				.map((el) => docRect(el, sx, sy));
			if (socket && port && heroHandle.el.contains(port.el)) content.push(socket.rect);
			const ellipse = heroEllipse(content.filter(rendered), area);
			if (ellipse) hero = { rect: area, ellipse };
			for (const el of heroHandle.controls()) {
				const rect = docRect(el, sx, sy);
				if (rendered(rect)) obstacles.push(rect);
			}
		}

		return {
			width: root.clientWidth,
			height: root.scrollHeight,
			viewportWidth: window.innerWidth,
			chips,
			obstacles,
			socket,
			hero
		};
	}

	#documentSize(): string {
		const root = document.documentElement;
		return `${root.clientWidth}x${root.scrollHeight}`;
	}

	#resizeCanvas(): void {
		const rect = this.canvas.getBoundingClientRect();
		const width = rect.width || window.innerWidth;
		const height = rect.height || window.innerHeight;
		this.#renderer?.resize(width, height, window.devicePixelRatio || 1);
	}

	/** One frame: advance growth and pulses (unless static), light the chips, draw. */
	#tick(): void {
		const growth = this.growth;
		const pulses = this.#pulses;
		const renderer = this.#renderer;
		if (!growth || !pulses || !renderer || this.#destroyed) return;
		const started = performance.now();
		let busy = false;
		if (!this.#static) {
			const now = this.#now();
			busy = growth.update(now, window.scrollY, window.innerHeight);
			for (const hit of pulses.advance(now)) {
				this.#handles.find((handle) => handle.id === hit.chipId)?.flashPin(hit.pin);
			}
			busy ||= pulses.size > 0;
		}
		for (const handle of this.#handles) {
			if (handle.destroyed) continue;
			const state = growth.chipState(handle.id);
			if (handle.state !== state) handle.state = state;
		}
		if (growth.powered) this.#power();
		renderer.draw({
			view: {
				scrollX: window.scrollX,
				scrollY: window.scrollY,
				width: window.innerWidth,
				height: window.innerHeight
			},
			drawn: (id) => growth.drawn(id),
			pulses: pulses.alive
		});
		this.frames++;
		if (this.#debug) {
			this.canvas.dataset.spineFront = String(Math.round(growth.front));
			this.canvas.dataset.pulses = String(pulses.size);
		}
		this.maxFrameMs = Math.max(this.maxFrameMs, performance.now() - started);
		if (busy) this.#request();
		else if (!this.#raf) this.#setState(this.#static ? 'static' : 'idle');
	}

	#request = (): void => {
		if (this.#raf || this.#destroyed || !this.growth) return;
		if (document.visibilityState === 'hidden') return;
		this.#raf = requestAnimationFrame(this.#onFrame);
		if (!this.#static) this.#setState('running');
	};

	#onFrame = (): void => {
		this.#raf = 0;
		this.#tick();
	};

	#onResize = (): void => {
		this.#resizeCanvas();
		this.#request();
	};

	#onPointerMove = (event: PointerEvent): void => {
		if (event.pointerType !== 'touch') this.#spawn(event);
	};

	/** On touch there is no hover: a tap spawns the pulses. */
	#onPointerDown = (event: PointerEvent): void => {
		if (event.pointerType === 'touch') this.#spawn(event);
	};

	#spawn(event: PointerEvent): void {
		const pulses = this.#pulses;
		if (this.#static || !pulses || document.visibilityState === 'hidden') return;
		const point = { x: event.clientX + window.scrollX, y: event.clientY + window.scrollY };
		if (!pulses.spawn(point, this.#now())) return;
		if (this.#debug) this.canvas.dataset.pulses = String(pulses.size);
		this.#request();
	}

	#onVisibility = (): void => {
		if (document.visibilityState === 'hidden') {
			if (this.#raf) cancelAnimationFrame(this.#raf);
			this.#raf = 0;
			this.#pulses?.clear();
			if (this.#debug) this.canvas.dataset.pulses = '0';
			this.#setState(this.#static ? 'static' : 'idle');
		} else {
			this.#request();
		}
	};

	#onMotion = (): void => {
		const reduced = this.#motion?.matches ?? false;
		if (reduced === this.#static) return;
		if (!reduced) {
			// Turned off: pulses come back. The board stays full, as nothing ungrows.
			this.#static = false;
			this.#setState('idle');
			return;
		}
		this.#static = true;
		if (this.#raf) cancelAnimationFrame(this.#raf);
		this.#raf = 0;
		this.growth?.snapAll();
		this.#pulses?.clear();
		this.#tick();
	};

	#scheduleRelayout = (): void => {
		if (this.#destroyed) return;
		clearTimeout(this.#relayoutTimer);
		this.#relayoutTimer = setTimeout(() => {
			if (this.#destroyed || !this.#layout()) return;
			this.#request();
		}, RELAYOUT_DEBOUNCE_MS);
	};

	/** The socket gets `data-power="on"`: the logo or photo frame draws itself (see Logo, Hero). */
	#power(): void {
		const el = registeredSocket()?.el;
		if (el && el.dataset.power !== 'on') el.dataset.power = 'on';
	}

	/** No board: every chip goes on and the socket powers up, now and when they register later. */
	#fallback(): void {
		if (this.#raf) cancelAnimationFrame(this.#raf);
		this.#raf = 0;
		for (const cleanup of this.#cleanups) cleanup();
		this.#cleanups = [];
		this.#observer?.disconnect();
		this.#renderer = null;
		this.growth = null;
		this.board = null;
		const lightAll = () => {
			for (const chip of registeredChips()) chip.state = 'on';
			this.#power();
		};
		lightAll();
		this.#cleanups.push(onChange(lightAll));
		this.#setState('off');
	}

	#setState(state: BoardState): void {
		if (this.state === state) return;
		this.state = state;
		this.canvas.dataset.pcbState = state;
	}
}
