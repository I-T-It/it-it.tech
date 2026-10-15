/**
 * Scroll-driven growth of the traces and the boot state of the chips. Pure, no DOM, no timers:
 * the runtime calls `update(now, scrollY, viewportHeight)` from its frame loop and reads the result.
 *
 * ```ts
 * const growth = new Growth(board);
 * // every frame:
 * const busy = growth.update(performance.now(), scrollY, innerHeight);
 * for (const t of board.traces) draw(t, growth.drawn(t.id));
 * for (const chip of chips()) chip.state = growth.chipState(chip.id);
 * if (!busy) stopTheLoop();
 * ```
 *
 * Rules:
 * - The trigger line sits at `scrollY + 0.85 * viewportHeight`. A trace starts once its `triggerY`
 *   (the chip top for feeders, its own top otherwise) is on or above that line.
 * - After a per-trace stagger of 0 to 600 ms (seeded by the trace id), a trace grows at 140 px/s.
 *   Its drawn length never shrinks and never exceeds its length.
 * - A chip goes `booting` when its first feeder arrives (is fully drawn), and `on` when all its
 *   feeders have arrived or 2.5 s after it started booting, whichever comes first. A chip without
 *   feeders goes `booting` at its trigger and `on` 2.5 s later.
 * - The first `update` is the page load. When the page loads scrolled down (`scrollY > 0`),
 *   everything above the trigger line snaps to full and those chips go `on` at once.
 * - `snapToFull(ids)` draws traces completely; `snapAll()` does the whole board (reduced motion).
 * - `relayout(board)` swaps in a new board and keeps progress by trace id: booted chips keep all
 *   their traces full, other traces keep their start time and drawn length (clamped).
 *
 * Times are milliseconds on one clock (performance.now()), lengths CSS px.
 */

import type { Board, ChipWiring, Trace } from './layout.js';
import type { ChipState } from './registry.svelte.js';
import { createRng, deriveSeed } from './rng.js';

/** Growth speed in CSS px per second. */
export const GROWTH_SPEED = 140;
/** Each trace waits a seeded 0 to this many ms after its trigger. */
export const MAX_STAGGER_MS = 600;
/** The trigger line, as a fraction of the viewport height from its top. */
export const TRIGGER_RATIO = 0.85;
/** A booting chip goes on after this many ms, arrived or not. */
export const BOOT_FALLBACK_MS = 2500;

interface TraceEntry {
	trace: Trace;
	stagger: number;
	/** When growth begins (trigger time plus stagger); null until triggered. */
	startAt: number | null;
	drawn: number;
}

interface ChipEntry {
	wiring: ChipWiring;
	state: ChipState;
	triggeredAt: number | null;
	bootedAt: number | null;
}

export class Growth {
	#traces = new Map<string, TraceEntry>();
	#chips = new Map<string, ChipEntry>();
	#chipTraces = new Map<string, string[]>();
	#started = false;
	#now = 0;
	#animating = false;

	constructor(board: Board) {
		this.#load(board, new Map(), new Map());
	}

	/** True while a triggered trace still grows or a chip is booting. */
	get animating(): boolean {
		return this.#animating;
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
		const line = scrollY + viewportHeight * TRIGGER_RATIO;
		if (!this.#started) {
			this.#started = true;
			if (scrollY > 0) this.#snapAbove(line, now);
		}
		for (const entry of this.#chips.values()) {
			if (entry.triggeredAt === null && entry.wiring.top <= line) entry.triggeredAt = now;
		}
		for (const entry of this.#traces.values()) {
			if (entry.startAt === null && entry.trace.triggerY <= line) {
				entry.startAt = now + entry.stagger;
			}
			if (entry.startAt !== null && entry.drawn < entry.trace.length) {
				const grown = ((now - entry.startAt) * GROWTH_SPEED) / 1000;
				entry.drawn = Math.max(entry.drawn, Math.min(entry.trace.length, grown));
			}
		}
		this.#advanceChips(now);
		return this.#refreshAnimating();
	}

	/** Draws the given traces completely, right away. */
	snapToFull(traceIds: Iterable<string>): void {
		for (const id of traceIds) {
			const entry = this.#traces.get(id);
			if (!entry) continue;
			entry.startAt ??= this.#now;
			entry.drawn = entry.trace.length;
		}
		this.#advanceChips(this.#now);
		this.#refreshAnimating();
	}

	/** Every trace full, every chip on: the static board for reduced motion. */
	snapAll(): void {
		this.#started = true;
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
		for (const entry of this.#chips.values()) {
			if (entry.state !== 'off') this.snapToFull(this.#chipTraces.get(entry.wiring.id) ?? []);
		}
		this.#advanceChips(this.#now);
		this.#refreshAnimating();
	}

	#load(board: Board, oldTraces: Map<string, TraceEntry>, oldChips: Map<string, ChipEntry>): void {
		for (const trace of board.traces) {
			const old = oldTraces.get(trace.id);
			const full = old !== undefined && old.drawn >= old.trace.length;
			this.#traces.set(trace.id, {
				trace,
				stagger: createRng(deriveSeed(board.seed, trace.id)).next() * MAX_STAGGER_MS,
				startAt: old?.startAt ?? null,
				drawn: old ? (full ? trace.length : Math.min(old.drawn, trace.length)) : 0
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

	#snapAbove(line: number, now: number): void {
		for (const entry of this.#traces.values()) {
			if (entry.trace.triggerY <= line) {
				entry.startAt = now;
				entry.drawn = entry.trace.length;
			}
		}
		for (const entry of this.#chips.values()) {
			if (entry.wiring.top <= line) {
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
			if (entry.startAt !== null && entry.drawn < entry.trace.length) {
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
