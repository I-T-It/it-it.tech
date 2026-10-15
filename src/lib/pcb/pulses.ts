/**
 * Signal pulses that run along the traces near the pointer. Pure, no DOM, no timers.
 *
 * ```ts
 * const pulses = new Pulses(board.traces, { reach: (id) => growth.drawn(id) });
 * onpointermove = (e) => pulses.spawn({ x: e.pageX, y: e.pageY }, performance.now());
 * // every frame:
 * for (const hit of pulses.advance(performance.now())) chipById(hit.chipId)?.flashPin(hit.pin);
 * for (const p of pulses.alive) drawPulse(p.point, p.trace.side);
 * ```
 *
 * Rules:
 * - `spawn` picks the trace closest to the pointer (document px) within 96 px, counting only the
 *   drawn part of each trace (`reach`, default: all of it). It starts the pulse at the closest point.
 * - A trace takes at most one new pulse per 500 ms; while the closest trace waits, the next closest
 *   one in range gets the pulse. At most 16 pulses live at once.
 * - Pulses run at 600 px/s toward the chip end of their trace. A pulse that reaches a pin of a fully
 *   drawn trace reports a `PinHit` from `advance`; at a via, or at the end of the drawn part of a
 *   trace that still grows, it just dies. With the 500 ms limit a pin flashes at most twice a second.
 */

import { nearestOnPolyline, pointAt, type Point } from './geometry.js';
import type { Trace } from './layout.js';

/** Pointer reach in CSS px. */
export const PULSE_RADIUS = 96;
/** Minimum time between two pulses on one trace, in ms. */
export const PULSE_INTERVAL_MS = 500;
/** Most pulses alive at once. */
export const MAX_PULSES = 16;
/** Pulse speed in CSS px per second. */
export const PULSE_SPEED = 600;

export interface Pulse {
	readonly id: number;
	readonly trace: Trace;
	readonly traceId: string;
	/** Px along the trace. */
	along: number;
	/** Current position in document px. */
	point: Point;
}

export interface PinHit {
	chipId: string;
	/** Pin index in DOM order, as `ChipHandle.flashPin` takes it. */
	pin: number;
	traceId: string;
}

export interface PulsesOptions {
	/** Drawn length of a trace in px. Default: the full length. */
	reach?: (traceId: string) => number;
}

interface Live {
	pulse: Pulse;
	last: number;
}

export class Pulses {
	#traces: readonly Trace[] = [];
	#reachOf: ((traceId: string) => number) | undefined;
	#live: Live[] = [];
	#lastSpawn = new Map<string, number>();
	#nextId = 1;

	constructor(traces: readonly Trace[], options: PulsesOptions = {}) {
		this.#reachOf = options.reach;
		this.setTraces(traces);
	}

	#reach(trace: Trace): number {
		return this.#reachOf ? Math.min(trace.length, this.#reachOf(trace.id)) : trace.length;
	}

	/** The live pulses, oldest first. */
	get alive(): readonly Pulse[] {
		return this.#live.map((live) => live.pulse);
	}

	get size(): number {
		return this.#live.length;
	}

	/** Swaps in the traces of a new board. Drops every pulse and every rate limit. */
	setTraces(traces: readonly Trace[]): void {
		this.#traces = traces;
		this.clear();
		this.#lastSpawn.clear();
	}

	/** Drops every pulse (hidden tab, reduced motion). */
	clear(): void {
		this.#live = [];
	}

	/** Spawns a pulse near `p` (document px). Returns it, or null when nothing qualifies. */
	spawn(p: Point, now: number): Pulse | null {
		if (this.#live.length >= MAX_PULSES) return null;
		const candidates: { trace: Trace; along: number; distance: number; point: Point }[] = [];
		for (const trace of this.#traces) {
			const box = trace.bbox;
			if (
				p.x < box.x - PULSE_RADIUS ||
				p.x > box.x + box.width + PULSE_RADIUS ||
				p.y < box.y - PULSE_RADIUS ||
				p.y > box.y + box.height + PULSE_RADIUS
			) {
				continue;
			}
			const reach = this.#reach(trace);
			if (!(reach > 0)) continue;
			const near = nearestOnPolyline(trace.points, trace.lengths, p, reach);
			if (near.distance <= PULSE_RADIUS) candidates.push({ trace, ...near });
		}
		candidates.sort((a, b) => a.distance - b.distance);
		for (const candidate of candidates) {
			const last = this.#lastSpawn.get(candidate.trace.id);
			if (last !== undefined && now - last < PULSE_INTERVAL_MS) continue;
			this.#lastSpawn.set(candidate.trace.id, now);
			const pulse: Pulse = {
				id: this.#nextId++,
				trace: candidate.trace,
				traceId: candidate.trace.id,
				along: candidate.along,
				point: candidate.point
			};
			this.#live.push({ pulse, last: now });
			return pulse;
		}
		return null;
	}

	/** Moves every pulse to `now`. Returns the pins hit since the last call. */
	advance(now: number): PinHit[] {
		const hits: PinHit[] = [];
		const keep: Live[] = [];
		for (const live of this.#live) {
			const { pulse } = live;
			const trace = pulse.trace;
			pulse.along += (Math.max(0, now - live.last) * PULSE_SPEED) / 1000;
			live.last = now;
			const reach = this.#reach(trace);
			if (pulse.along >= reach) {
				if (reach >= trace.length && trace.end.kind === 'pin') {
					hits.push({ chipId: trace.end.chipId, pin: trace.end.pin, traceId: trace.id });
				}
				continue;
			}
			pulse.point = pointAt(trace.points, trace.lengths, pulse.along);
			keep.push(live);
		}
		this.#live = keep;
		return hits;
	}
}
