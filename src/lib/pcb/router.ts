/**
 * Octilinear A* over the occupancy grid. Pure, no DOM.
 *
 * `route(grid, from, to, options)` returns the corner cells of the cheapest path (both ends
 * included), or `null` when the goal can't be reached. Turn the corners into cells with
 * `walkCells` and into px with `grid.centre`; mark the result with `grid.markPath` so later traces
 * keep clear of it.
 *
 * The search state is (cell, heading):
 * - every step goes to one of the 8 neighbours, turning at most 45 degrees (no U-turns, no 90s);
 * - a straight step costs 1, a diagonal one sqrt(2), and every turn adds `TURN_COST`;
 * - a step onto a lane cell of the same bus (`options.bus`, see `Grid.lane`) costs `LANE_FACTOR`
 *   of that, so the traces of a bus run in parallel;
 * - only `FREE` cells can be entered.
 *
 * The heuristic is the octile distance (scaled by `LANE_FACTOR` when a bus is set, so it stays
 * admissible). Ties go to the state closest to the goal, then to the oldest, so the result is
 * deterministic. Scratch buffers are reused between calls; `route` is not re-entrant.
 */

import { DX, DY, type Dir } from './geometry.js';
import { FREE, type Cell, type Grid } from './grid.js';

/** Extra cost of a 45-degree turn, in cell lengths. */
export const TURN_COST = 0.5;
/** Cost factor of a step along a lane of the trace's own bus. */
export const LANE_FACTOR = 0.6;
/** Safety cap on expanded states per route. */
export const MAX_EXPANSIONS = 250_000;

/** Inclusive cell range the search stays in. */
export interface SearchWindow {
	col0: number;
	row0: number;
	col1: number;
	row1: number;
}

export interface RouteOptions {
	/** Heading the trace has when it enters `from`. The first step turns at most 45 degrees from it. Default: any. */
	startDir?: Dir;
	/** Allowed heading(s) of the last step into `to`. Default: any. */
	endDir?: Dir | readonly Dir[];
	/** Bus number (> 0) whose lane cells are cheaper. Default: none. */
	bus?: number;
	/** Only search these cells. Default: the whole grid. */
	window?: SearchWindow;
	/** When `to` can't be reached, return the path to the reached cell closest to it instead of null. */
	partial?: boolean;
	/** Give up after this many expanded states. */
	maxExpansions?: number;
}

const SQRT2 = Math.SQRT2;

// Scratch buffers, indexed by window-local state: ((row - row0) * width + (col - col0)) * 8 + dir.
let gScore = new Float64Array(0);
let parent = new Int32Array(0);
let seenGen = new Uint32Array(0);
let closedGen = new Uint32Array(0);
let generation = 0;

function ensureCapacity(states: number): void {
	if (gScore.length >= states && generation < 0xfffffff0) return;
	let size = Math.max(1024, gScore.length);
	while (size < states) size *= 2;
	gScore = new Float64Array(size);
	parent = new Int32Array(size);
	seenGen = new Uint32Array(size);
	closedGen = new Uint32Array(size);
	generation = 0;
}

/** Binary min-heap of states, ordered by f, then h, then insertion order. */
class Heap {
	states = new Int32Array(1024);
	f = new Float64Array(1024);
	h = new Float64Array(1024);
	seq = new Float64Array(1024);
	size = 0;
	#counter = 0;

	clear(): void {
		this.size = 0;
		this.#counter = 0;
	}

	#less(a: number, b: number): boolean {
		if (this.f[a] !== this.f[b]) return this.f[a] < this.f[b];
		if (this.h[a] !== this.h[b]) return this.h[a] < this.h[b];
		return this.seq[a] < this.seq[b];
	}

	#swap(a: number, b: number): void {
		const s = this.states[a];
		this.states[a] = this.states[b];
		this.states[b] = s;
		const f = this.f[a];
		this.f[a] = this.f[b];
		this.f[b] = f;
		const h = this.h[a];
		this.h[a] = this.h[b];
		this.h[b] = h;
		const q = this.seq[a];
		this.seq[a] = this.seq[b];
		this.seq[b] = q;
	}

	#grow(): void {
		const size = this.states.length * 2;
		const states = new Int32Array(size);
		const f = new Float64Array(size);
		const h = new Float64Array(size);
		const seq = new Float64Array(size);
		states.set(this.states);
		f.set(this.f);
		h.set(this.h);
		seq.set(this.seq);
		this.states = states;
		this.f = f;
		this.h = h;
		this.seq = seq;
	}

	push(state: number, f: number, h: number): void {
		if (this.size === this.states.length) this.#grow();
		let i = this.size++;
		this.states[i] = state;
		this.f[i] = f;
		this.h[i] = h;
		this.seq[i] = this.#counter++;
		while (i > 0) {
			const up = (i - 1) >> 1;
			if (!this.#less(i, up)) break;
			this.#swap(i, up);
			i = up;
		}
	}

	pop(): number {
		const top = this.states[0];
		const last = --this.size;
		if (last > 0) {
			this.#swap(0, last);
			let i = 0;
			for (;;) {
				const l = 2 * i + 1;
				const r = l + 1;
				let m = i;
				if (l < last && this.#less(l, m)) m = l;
				if (r < last && this.#less(r, m)) m = r;
				if (m === i) break;
				this.#swap(i, m);
				i = m;
			}
		}
		return top;
	}
}

const heap = new Heap();

function octile(dc: number, dr: number): number {
	const a = Math.abs(dc);
	const b = Math.abs(dr);
	return a > b ? a + (SQRT2 - 1) * b : b + (SQRT2 - 1) * a;
}

/** The cheapest octilinear path from `from` to `to` as corner cells, or null. See the file header. */
export function route(grid: Grid, from: Cell, to: Cell, options: RouteOptions = {}): Cell[] | null {
	const partial = options.partial === true;
	if (!grid.isFree(from.col, from.row)) return null;
	if (!partial && !grid.isFree(to.col, to.row)) return null;

	const w = options.window;
	const col0 = Math.max(0, w ? w.col0 : 0);
	const row0 = Math.max(0, w ? w.row0 : 0);
	const col1 = Math.min(grid.cols - 1, w ? w.col1 : grid.cols - 1);
	const row1 = Math.min(grid.rows - 1, w ? w.row1 : grid.rows - 1);
	if (from.col < col0 || from.col > col1 || from.row < row0 || from.row > row1) return null;

	const endDirs = options.endDir;
	let endMask = 0xff;
	if (endDirs !== undefined) {
		endMask = 0;
		for (const d of typeof endDirs === 'number' ? [endDirs] : endDirs) endMask |= 1 << d;
	}
	const startDir = options.startDir;

	if (from.col === to.col && from.row === to.row) {
		if (startDir === undefined || endMask & (1 << startDir)) return [{ ...from }];
		return partial ? [{ ...from }] : null;
	}

	const width = col1 - col0 + 1;
	const height = row1 - row0 + 1;
	ensureCapacity(width * height * 8);
	const gen = ++generation;
	heap.clear();

	const bus = options.bus ?? 0;
	const hScale = bus > 0 ? LANE_FACTOR : 1;
	const maxExpansions = options.maxExpansions ?? MAX_EXPANSIONS;
	const cells = grid.cells;
	const lane = grid.lane;
	const cols = grid.cols;

	const startCell = (from.row - row0) * width + (from.col - col0);
	const startH = octile(to.col - from.col, to.row - from.row);
	for (let d = 0; d < 8; d++) {
		if (startDir !== undefined && d !== startDir) continue;
		const s = (startCell << 3) | d;
		seenGen[s] = gen;
		gScore[s] = 0;
		parent[s] = -1;
		heap.push(s, startH * hScale, startH);
	}

	let best = -1;
	let bestH = Infinity;
	let expansions = 0;

	while (heap.size > 0) {
		const s = heap.pop();
		if (closedGen[s] === gen) continue;
		closedGen[s] = gen;
		if (++expansions > maxExpansions) break;

		const local = s >> 3;
		const d = s & 7;
		const col = (local % width) + col0;
		const row = ((local / width) | 0) + row0;

		if (col === to.col && row === to.row && endMask & (1 << d)) {
			return corners(s, width, col0, row0);
		}
		if (partial) {
			const h = octile(to.col - col, to.row - row);
			if (h < bestH) {
				bestH = h;
				best = s;
			}
		}

		const g = gScore[s];
		for (let k = -1; k <= 1; k++) {
			const nd = (d + k + 8) & 7;
			const nc = col + DX[nd];
			const nr = row + DY[nd];
			if (nc < col0 || nc > col1 || nr < row0 || nr > row1) continue;
			const gi = nr * cols + nc;
			if (cells[gi] !== FREE) continue;
			const ns = ((((nr - row0) * width + (nc - col0)) << 3) | nd) >>> 0;
			if (closedGen[ns] === gen) continue;
			let step = nd & 1 ? SQRT2 : 1;
			if (bus > 0 && lane[gi] === bus) step *= LANE_FACTOR;
			const cost = g + step + (k === 0 ? 0 : TURN_COST);
			if (seenGen[ns] !== gen || cost < gScore[ns]) {
				seenGen[ns] = gen;
				gScore[ns] = cost;
				parent[ns] = s;
				const h = octile(to.col - nc, to.row - nr);
				heap.push(ns, cost + h * hScale, h);
			}
		}
	}

	return partial && best !== -1 ? corners(best, width, col0, row0) : null;
}

/** Walks the parents back from `end` and keeps the cells where the heading changes. */
function corners(end: number, width: number, col0: number, row0: number): Cell[] {
	const chain: number[] = [];
	for (let s = end; s !== -1; s = parent[s]) chain.push(s);
	chain.reverse();
	const cellOf = (s: number): Cell => {
		const local = s >> 3;
		return { col: (local % width) + col0, row: ((local / width) | 0) + row0 };
	};
	const out: Cell[] = [cellOf(chain[0])];
	for (let i = 1; i < chain.length - 1; i++) {
		// The heading of step i is the direction stored in state i.
		if ((chain[i] & 7) !== (chain[i + 1] & 7)) out.push(cellOf(chain[i]));
	}
	if (chain.length > 1) out.push(cellOf(chain[chain.length - 1]));
	return out;
}
