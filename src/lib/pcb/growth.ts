/**
 * Growth of the traces and the boot state of the chips. Pure, no DOM, no timers: the runtime calls
 * `update(now, scrollY, viewportHeight)` on every scroll frame and while `animating`, and reads the
 * result.
 *
 * ```ts
 * const growth = new Growth(board);
 * // every frame:
 * const busy = growth.update(performance.now(), scrollY, innerHeight);
 * for (const t of board.traces) draw(t, growth.drawn(t.id));
 * for (const chip of chips()) chip.state = growth.chipState(chip.id);
 * canvas.dataset.spineFront = String(growth.front);
 * if (!busy && !scrolling) stopTheLoop();
 * ```
 *
 * The front sits at `scrollY + 0.6 * viewportHeight` (document px). Per kind:
 * - `spine`: drawn by position. Its drawn length is the part of it on or above the front
 *   (`lengthAbove`), a pure function of the front: it grows when the page scrolls down and
 *   shrinks when it scrolls back up. Time plays no part, so it never keeps the loop busy.
 * - `branch` and `decor`: latched. A trace starts once the front passes its `triggerY` (a
 *   branch's junction, the trace's own top otherwise) and grows at 140 px/s, decoration after a
 *   seeded stagger of 0 to 600 ms, branches at once. It never shrinks, also not on scroll-up.
 * - `socket`: by time from the first `update` (the page load), whatever the scroll position.
 *   Each trace waits a seeded 0 to 400 ms, then grows with an ease-out over 1.6 s, so every
 *   socket trace is full 2 s after the first `update`.
 *
 * Chips: a chip goes `booting` when its first branch arrives (is fully drawn), and `on` when all
 * its branches have arrived or 2.5 s after it started booting, whichever comes first. A chip
 * without branches goes `booting` when the front passes its top and `on` 2.5 s later. Chips stay
 * `on`, also when the page scrolls back up.
 *
 * The first `update` is the page load. When the page loads scrolled down (`scrollY > 0`), every
 * latched trace above the front snaps to full and the chips above it go `on` at once.
 * `snapToFull(ids)` draws traces completely (a spine trace stays full from then on); `snapAll()`
 * does every kind and makes the board static (reduced motion). `relayout(board)` swaps in a new
 * board and keeps progress by trace id: booted chips keep their branches full, latched traces
 * keep their start and drawn length (clamped), socket traces keep the load clock, the spine is
 * measured against the last front, and a static board stays static.
 *
 * Times are milliseconds on one clock (performance.now()), lengths CSS px.
 */

import { lengthAbove } from './geometry.js';
import type { Board, ChipWiring, Trace } from './layout.js';
import type { ChipState } from './registry.svelte.js';
import { createRng, deriveSeed } from './rng.js';

/** The front, as a fraction of the viewport height from its top. */
export const FRONT_RATIO = 0.6;
/** Growth speed of latched traces in CSS px per second. */
export const GROWTH_SPEED = 140;
/** Decoration waits a seeded 0 to this many ms after its trigger. */
export const MAX_STAGGER_MS = 600;
/** A booting chip goes on after this many ms, arrived or not. */
export const BOOT_FALLBACK_MS = 2500;
/** Every socket trace is full this many ms after the first update. */
export const SOCKET_MS = 2000;
/** A socket trace waits a seeded 0 to this many ms before it grows. */
export const SOCKET_STAGGER_MS = 400;

const SOCKET_GROW_MS = SOCKET_MS - SOCKET_STAGGER_MS;

type Mode = 'spine' | 'socket' | 'latch';

interface TraceEntry {
	trace: Trace;
	mode: Mode;
	stagger: number;
	/** When growth begins: trigger (or load) time plus stagger; null until then. */
	startAt: number | null;
	drawn: number;
	/** A spine trace snapped to full stays full. */
	pinned: boolean;
}

interface ChipEntry {
	wiring: ChipWiring;
	state: ChipState;
	triggeredAt: number | null;
	bootedAt: number | null;
}

function modeOf(trace: Trace): Mode {
	return trace.kind === 'spine' ? 'spine' : trace.kind === 'socket' ? 'socket' : 'latch';
}

function easeOut(t: number): number {
	return 1 - (1 - t) ** 3;
}

export class Growth {
	#traces = new Map<string, TraceEntry>();
	#chips = new Map<string, ChipEntry>();
	#chipTraces = new Map<string, string[]>();
	/** Time of the first update; null before it. */
	#loadedAt: number | null = null;
	#now = 0;
	#front = 0;
	#static = false;
	#animating = false;

	constructor(board: Board) {
		this.#load(board, new Map(), new Map());
	}

	/** True while a latched or socket trace still grows or a chip is booting. */
	get animating(): boolean {
		return this.#animating;
	}

	/** The front in document px as of the last `update`; 0 before the first. */
	get front(): number {
		return this.#front;
	}

	/** Drawn length of a trace in px; 0 for an unknown id. */
	drawn(traceId: string): number {
		return this.#traces.get(traceId)?.drawn ?? 0;
	}

	/** True once a trace is drawn completely. */
	isFull(traceId: string): boolean {
		const entry = this.#traces.get(traceId);
		return entry !== undefined && entry.drawn >= entry.trace.length;
	}

	/** The boot state of a chip; `off` for an unknown id. */
	chipState(chipId: string): ChipState {
		return this.#chips.get(chipId)?.state ?? 'off';
	}

	/**
	 * Advances to `now` with the current scroll position. Returns `animating`: false means nothing
	 * moves until the page scrolls (or the board changes), so the frame loop may stop.
	 */
	update(now: number, scrollY: number, viewportHeight: number): boolean {
		this.#now = now;
		const front = scrollY + viewportHeight * FRONT_RATIO;
		this.#front = front;
		if (this.#loadedAt === null) {
			this.#loadedAt = now;
			for (const entry of this.#traces.values()) {
				if (entry.mode === 'socket') entry.startAt ??= now + entry.stagger;
			}
			if (scrollY > 0) this.#snapAbove(front, now);
		}
		for (const entry of this.#chips.values()) {
			if (entry.triggeredAt === null && entry.wiring.top <= front) entry.triggeredAt = now;
		}
		for (const entry of this.#traces.values()) {
			if (entry.mode === 'spine') {
				entry.drawn = this.#spineDrawn(entry);
				continue;
			}
			if (entry.mode === 'latch' && entry.startAt === null && entry.trace.triggerY <= front) {
				entry.startAt = now + entry.stagger;
			}
			if (entry.startAt === null || entry.drawn >= entry.trace.length) continue;
			const length = entry.trace.length;
			const grown =
				entry.mode === 'socket'
					? length * easeOut(Math.min(1, Math.max(0, (now - entry.startAt) / SOCKET_GROW_MS)))
					: ((now - entry.startAt) * GROWTH_SPEED) / 1000;
			entry.drawn = Math.max(entry.drawn, Math.min(length, grown));
		}
		this.#advanceChips(now);
		return this.#refreshAnimating();
	}

	/** Draws the given traces completely, right away. A spine trace stays full from then on. */
	snapToFull(traceIds: Iterable<string>): void {
		for (const id of traceIds) {
			const entry = this.#traces.get(id);
			if (!entry) continue;
			entry.pinned = true;
			entry.startAt ??= this.#now;
			entry.drawn = entry.trace.length;
		}
		this.#advanceChips(this.#now);
		this.#refreshAnimating();
	}

	/** Every trace full, every chip on, and it stays that way: the static board for reduced motion. */
	snapAll(): void {
		this.#static = true;
		this.#loadedAt ??= this.#now;
		for (const entry of this.#traces.values()) {
			entry.startAt ??= this.#now;
			entry.drawn = entry.trace.length;
		}
		for (const entry of this.#chips.values()) {
			entry.triggeredAt ??= this.#now;
			entry.state = 'on';
		}
		this.#refreshAnimating();
	}

	/** Swaps in a relaid board and carries progress over by id (see the file header). */
	relayout(board: Board): void {
		const traces = this.#traces;
		const chips = this.#chips;
		this.#traces = new Map();
		this.#chips = new Map();
		this.#chipTraces = new Map();
		this.#load(board, traces, chips);
		if (this.#static) {
			this.snapAll();
			return;
		}
		for (const entry of this.#chips.values()) {
			if (entry.state !== 'off') this.snapToFull(this.#chipTraces.get(entry.wiring.id) ?? []);
		}
		for (const entry of this.#traces.values()) {
			if (entry.mode === 'spine') entry.drawn = this.#spineDrawn(entry);
		}
		this.#advanceChips(this.#now);
		this.#refreshAnimating();
	}

	#spineDrawn(entry: TraceEntry): number {
		const { trace } = entry;
		if (this.#static || entry.pinned) return trace.length;
		if (this.#loadedAt === null) return 0;
		return lengthAbove(trace.points, trace.lengths, this.#front);
	}

	#load(board: Board, oldTraces: Map<string, TraceEntry>, oldChips: Map<string, ChipEntry>): void {
		for (const trace of board.traces) {
			const old = oldTraces.get(trace.id);
			const mode = modeOf(trace);
			const full = old !== undefined && old.drawn >= old.trace.length;
			const random = createRng(deriveSeed(board.seed, trace.id)).next();
			const stagger =
				mode === 'socket'
					? random * SOCKET_STAGGER_MS
					: trace.kind === 'decor'
						? random * MAX_STAGGER_MS
						: 0;
			const loaded = mode === 'socket' && this.#loadedAt !== null;
			this.#traces.set(trace.id, {
				trace,
				mode,
				stagger,
				startAt: old?.startAt ?? (loaded ? (this.#loadedAt ?? 0) + stagger : null),
				drawn: old ? (full ? trace.length : Math.min(old.drawn, trace.length)) : 0,
				pinned: old?.pinned ?? false
			});
			if (trace.chipId !== null) {
				const list = this.#chipTraces.get(trace.chipId) ?? [];
				list.push(trace.id);
				this.#chipTraces.set(trace.chipId, list);
			}
		}
		for (const wiring of board.chips) {
			const old = oldChips.get(wiring.id);
			this.#chips.set(wiring.id, {
				wiring,
				state: old?.state ?? 'off',
				triggeredAt: old?.triggeredAt ?? null,
				bootedAt: old?.bootedAt ?? null
			});
		}
	}

	#snapAbove(front: number, now: number): void {
		for (const entry of this.#traces.values()) {
			if (entry.mode === 'latch' && entry.trace.triggerY <= front) {
				entry.startAt = now;
				entry.drawn = entry.trace.length;
			}
		}
		for (const entry of this.#chips.values()) {
			if (entry.wiring.top <= front) {
				entry.triggeredAt = now;
				entry.state = 'on';
			}
		}
	}

	#advanceChips(now: number): void {
		for (const entry of this.#chips.values()) {
			if (entry.state === 'on') continue;
			const feeders = entry.wiring.feeders;
			let arrived = 0;
			for (const id of feeders) if (this.isFull(id)) arrived++;
			if (entry.state === 'off') {
				const noFeeders = feeders.length === 0 && entry.triggeredAt !== null;
				if (arrived > 0 || noFeeders) {
					entry.state = 'booting';
					entry.bootedAt = now;
				}
			}
			if (entry.state === 'booting') {
				const allIn = feeders.length > 0 && arrived === feeders.length;
				if (allIn || now - (entry.bootedAt ?? now) >= BOOT_FALLBACK_MS) entry.state = 'on';
			}
		}
	}

	#refreshAnimating(): boolean {
		let busy = false;
		for (const entry of this.#traces.values()) {
			if (entry.mode !== 'spine' && entry.startAt !== null && entry.drawn < entry.trace.length) {
				busy = true;
				break;
			}
		}
		if (!busy) {
			for (const entry of this.#chips.values()) {
				if (entry.state === 'booting') {
					busy = true;
					break;
				}
			}
		}
		this.#animating = busy;
		return busy;
	}
}
