/**
 * Lays out the whole board: which traces exist and where they run. Pure, no DOM.
 *
 * ```ts
 * const board = layoutBoard({
 *   width: root.clientWidth, height: root.scrollHeight, viewportWidth: innerWidth,
 *   chips: chips().map((c) => ({ id: c.id, side: c.side, rect: docRect(c.el), pins: c.pins().map(docCentre) })),
 *   obstacles: obstacles().map(docRect)
 * });
 * ```
 *
 * Input is measured in document CSS px (a client rect plus the scroll offset). `pins` are the pin
 * centres in DOM order, so `end.pin` is the index `ChipHandle.flashPin` takes. A pin left of the
 * chip's centre line is a left pin.
 *
 * What it builds:
 * - Feeder buses: from the left edge to left pins and from the right edge to right pins, 2 to 5
 *   traces each, one bus per started 960 px of chip height (at most 3 per side). Each feeder ends
 *   exactly on its pin, coming in horizontally.
 * - Unroutable feeders: when a feeder can't reach its pin, the way towards it becomes an
 *   `unrouted` trace that ends in a via, and the chip gets `fallback: true` (it boots on the timer).
 *   A chip with no room for any feeder is flagged the same way.
 * - Decorative buses (`decor`): from the edge into the gutter, ending in vias. Their number grows
 *   with the gutter area.
 * - Narrow screens (gutter under 24 px): one short feeder per chip side where there is room, and
 *   decorative traces only through the gaps between sections.
 *
 * Traces never enter chips, obstacles or the content column (on narrow screens they cross it only
 * in the gaps between chips), keep 24 px apart, and bend at 45 degrees only. Left traces are
 * `side: 'left'` (cyan), right ones `side: 'right'` (green); every trace starts at its edge.
 * The same input and seed always give the same board.
 */

import {
	boundsOf,
	cumulativeLengths,
	EAST,
	simplify,
	WEST,
	type Dir,
	type Point,
	type Rect
} from './geometry.js';
import { Grid, walkCells, type Cell } from './grid.js';
import type { ChipSide } from './registry.svelte.js';
import { boardSeed, createRng, deriveSeed, type Rng } from './rng.js';
import { route, type SearchWindow } from './router.js';

/** A gutter narrower than this (CSS px) switches the board to narrow mode. */
export const NARROW_GUTTER = 24;
export const BUS_MIN = 2;
export const BUS_MAX = 5;
/** One feeder bus per started band of this much chip height (CSS px)... */
export const BUS_BAND = 960;
/** ...up to this many per side. */
export const MAX_BUSES_PER_SIDE = 3;
/** One decorative bus per this much gutter area (CSS px squared). */
export const DECOR_AREA = 40_000;

/** Extra rows around a route's start and goal that the search may use. */
const WINDOW_MARGIN = 6;
/** A bus drops or rises at most this many rows on its way to the pins. */
const MAX_BEND_ROWS = 16;
/** An unrouted feeder shorter than this many cells is dropped; the chip is still flagged. */
const MIN_PARTIAL_CELLS = 3;

export type Side = 'left' | 'right';

export interface ChipInput {
	id: string;
	/** Which sides get feeders, as registered. */
	side: ChipSide;
	/** The chip's border box in document px. */
	rect: Rect;
	/** Pin centres in document px, in DOM order. */
	pins: readonly Point[];
}

export interface LayoutInput {
	/** Document width in CSS px (the board's right edge). */
	width: number;
	/** Document height in CSS px. */
	height: number;
	/** Viewport width; picks the seed bucket. Default: `width`. */
	viewportWidth?: number;
	chips: readonly ChipInput[];
	/** Rects traces route around, such as the hero logo and photo. */
	obstacles?: readonly Rect[];
	/** Overrides the seed. Default: `boardSeed(viewportWidth)`. */
	seed?: number;
}

/**
 * `feeder`: ends on a chip pin. `unrouted`: a feeder that could not reach its pin and ends in a
 * via. `decor`: decoration, ends in a via.
 */
export type TraceKind = 'feeder' | 'unrouted' | 'decor';

export type TraceEnd = { kind: 'pin'; chipId: string; pin: number } | { kind: 'via' };

export interface Trace {
	/** Stable across relayouts with the same structure, e.g. "about:L0.1" or "decor:R3.0". */
	id: string;
	kind: TraceKind;
	/** The edge it starts from: left is cyan, right is green. */
	side: Side;
	/** Traces of one bus share this id. */
	bus: string;
	/** The polyline in document px, from the board edge to the pin or via. */
	points: Point[];
	/** Cumulative length at every point (see `geometry.ts`). */
	lengths: number[];
	/** Total length in px. */
	length: number;
	/** Bounds of `points`, for viewport culling. */
	bbox: Rect;
	end: TraceEnd;
	/** The chip a feeder or unrouted trace belongs to; null for decoration. */
	chipId: string | null;
	/** Document y that has to pass the trigger line before the trace grows: the chip top, or the trace's own top. */
	triggerY: number;
}

export interface ChipWiring {
	id: string;
	/** Document y of the chip top: its growth trigger. */
	top: number;
	/** Ids of the traces that end on this chip's pins. */
	feeders: string[];
	/** True when a feeder could not be routed or the chip has none: it boots on the timer. */
	fallback: boolean;
}

export interface Board {
	seed: number;
	width: number;
	height: number;
	narrow: boolean;
	traces: Trace[];
	/** One entry per input chip, top to bottom. */
	chips: ChipWiring[];
}

interface SidePin {
	index: number;
	point: Point;
	/** The free cell just outside the chip where the feeder's grid path ends. */
	cell: Cell;
}

interface Context {
	grid: Grid;
	width: number;
	seed: number;
	traces: Trace[];
	busCount: number;
}

function byTopThenId(a: ChipInput, b: ChipInput): number {
	return a.rect.y - b.rect.y || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Lays out the board. See the file header. */
export function layoutBoard(input: LayoutInput): Board {
	const width = Math.max(0, input.width);
	const height = Math.max(0, input.height);
	const seed = input.seed ?? boardSeed(input.viewportWidth ?? width);
	const grid = new Grid(width, height);
	const chips = [...input.chips].sort(byTopThenId);
	const obstacles = input.obstacles ?? [];

	// The content column spans the chips. Obstacles only define it when there are no chips: they
	// are blocked on their own, wherever they sit.
	let contentLeft = Infinity;
	let contentRight = -Infinity;
	for (const rect of chips.length > 0 ? chips.map((c) => c.rect) : obstacles) {
		contentLeft = Math.min(contentLeft, rect.x);
		contentRight = Math.max(contentRight, rect.x + rect.width);
	}
	const hasContent = contentLeft < contentRight;
	const gutters = {
		left: hasContent ? Math.max(0, contentLeft) : width / 2,
		right: hasContent ? Math.max(0, width - contentRight) : width / 2
	};
	const narrow = Math.min(gutters.left, gutters.right) < NARROW_GUTTER;

	// Obstacles keep a cell of clearance all round. On narrow screens chips only keep it top and
	// bottom, so the last column next to them stays open for a feeder.
	for (const rect of obstacles) grid.blockRect(rect, 1);
	for (const chip of chips) grid.blockRect(chip.rect, narrow ? 0 : 1, 1);
	const gaps = narrow ? gapsBetween(chips) : [];
	if (hasContent) blockContent(grid, contentLeft, contentRight, gaps);

	// Decide which pins have room before any trace takes it.
	const pinsBySide = chips.map((chip) => ({
		left: sidePins(grid, chip, 'left', narrow),
		right: sidePins(grid, chip, 'right', narrow)
	}));

	const ctx: Context = { grid, width, seed, traces: [], busCount: 0 };
	const wiring: ChipWiring[] = chips.map((chip, i) => wireChip(ctx, chip, pinsBySide[i], narrow));

	if (narrow) gapDecor(ctx, gaps);
	else gutterDecor(ctx, gutters, height);

	return { seed, width, height, narrow, traces: ctx.traces, chips: wiring };
}

/** Vertical gaps between chips, in px, top to bottom. */
function gapsBetween(chips: readonly ChipInput[]): { top: number; bottom: number }[] {
	const gaps: { top: number; bottom: number }[] = [];
	let bottom = -Infinity;
	for (const chip of chips) {
		if (bottom > -Infinity && chip.rect.y > bottom) gaps.push({ top: bottom, bottom: chip.rect.y });
		bottom = Math.max(bottom, chip.rect.y + chip.rect.height);
	}
	return gaps;
}

/** Blocks the content column, except rows that lie wholly inside one of the gaps. */
function blockContent(
	grid: Grid,
	left: number,
	right: number,
	gaps: readonly { top: number; bottom: number }[]
): void {
	const p = grid.pitch;
	const col0 = Math.floor(left / p);
	const col1 = Math.ceil(right / p) - 1;
	for (let row = 0; row < grid.rows; row++) {
		const top = row * p;
		if (gaps.some((gap) => top >= gap.top && top + p <= gap.bottom)) continue;
		grid.blockCells(col0, row, col1, row);
	}
}

/** The pins on one side of a chip that have a free approach cell, top to bottom. */
function sidePins(grid: Grid, chip: ChipInput, side: Side, narrow: boolean): SidePin[] {
	if (chip.side !== 'both' && chip.side !== side) return [];
	const p = grid.pitch;
	const inflate = narrow ? 0 : p;
	const middle = chip.rect.x + chip.rect.width / 2;
	const out: SidePin[] = [];
	chip.pins.forEach((point, index) => {
		if (point.x < middle !== (side === 'left')) return;
		const row = Math.floor(point.y / p);
		// The cell centre sits at least half a cell outside the pin, so the last leg stays horizontal.
		const col =
			side === 'left'
				? Math.min(Math.floor((chip.rect.x - inflate) / p) - 1, Math.floor((point.x - p) / p))
				: Math.max(
						Math.ceil((chip.rect.x + chip.rect.width + inflate) / p),
						Math.ceil(point.x / p)
					);
		if (grid.isFree(col, row)) out.push({ index, point, cell: { col, row } });
	});
	return out.sort((a, b) => a.point.y - b.point.y || a.index - b.index);
}

function edgeCol(grid: Grid, side: Side): number {
	return side === 'left' ? 0 : grid.cols - 1;
}

/** Columns between the edge and a cell. */
function localCol(grid: Grid, side: Side, col: number): number {
	return side === 'left' ? col : grid.cols - 1 - col;
}

function heading(side: Side): Dir {
	return side === 'left' ? EAST : WEST;
}

function wireChip(
	ctx: Context,
	chip: ChipInput,
	pins: Record<Side, SidePin[]>,
	narrow: boolean
): ChipWiring {
	const feeders: string[] = [];
	let fallback = false;
	for (const side of ['left', 'right'] as const) {
		const candidates = pins[side];
		if (candidates.length === 0) continue;
		const rng = createRng(deriveSeed(ctx.seed, `${chip.id}:${side}`));
		const buses = narrow ? [[candidates[0]]] : pickBuses(chip, candidates, rng);
		buses.forEach((busPins, k) => {
			const bus = ++ctx.busCount;
			const busId = `${chip.id}:${side === 'left' ? 'L' : 'R'}${k}`;
			const starts = narrow
				? busPins.map((pin) => pin.cell.row)
				: startRows(ctx.grid, side, busPins, rng);
			busPins.forEach((pin, i) => {
				const id = `${busId}.${i}`;
				const result = routeFeeder(ctx.grid, side, starts[i], pin.cell, bus);
				if (!result.reached) fallback = true;
				if (!result.corners) return;
				ctx.grid.markPath(result.corners, bus);
				const points = polyline(ctx, result.corners, side);
				if (result.reached) {
					alignEnd(points, pin.point);
					feeders.push(id);
				}
				ctx.traces.push(
					makeTrace({
						id,
						kind: result.reached ? 'feeder' : 'unrouted',
						side,
						bus: busId,
						points,
						end: result.reached
							? { kind: 'pin', chipId: chip.id, pin: pin.index }
							: { kind: 'via' },
						chipId: chip.id,
						triggerY: chip.rect.y
					})
				);
			});
		});
	}
	if (feeders.length === 0) fallback = true;
	return { id: chip.id, top: chip.rect.y, feeders, fallback };
}

/** Splits a side's pins into bands down the chip and picks a run of 2 to 5 pins per band. */
function pickBuses(chip: ChipInput, pins: readonly SidePin[], rng: Rng): SidePin[][] {
	const count = Math.min(MAX_BUSES_PER_SIDE, 1 + Math.floor(chip.rect.height / BUS_BAND));
	const band = chip.rect.height / count;
	const buses: SidePin[][] = [];
	for (let k = 0; k < count; k++) {
		const top = chip.rect.y + k * band;
		const inBand = pins.filter(
			(pin) => pin.point.y >= top && (pin.point.y < top + band || k === count - 1)
		);
		if (inBand.length === 0) continue;
		const size = Math.min(rng.int(BUS_MIN, BUS_MAX), inBand.length);
		// The first bus sits near the top of the chip: that is what the reader sees first.
		const first = rng.int(0, k === 0 ? Math.min(1, inBand.length - size) : inBand.length - size);
		buses.push(inBand.slice(first, first + size));
	}
	return buses;
}

/**
 * Edge rows for a bus: two rows apart, shifted up or down from the pins as far as the gutter has
 * columns for the 45-degree run.
 */
function startRows(grid: Grid, side: Side, pins: readonly SidePin[], rng: Rng): number[] {
	const n = pins.length;
	const q = pins.map((pin, i) => pin.cell.row - 2 * i);
	const qMin = Math.min(...q);
	const qMax = Math.max(...q);
	const columns = Math.min(...pins.map((pin) => localCol(grid, side, pin.cell.col)));
	const room = Math.max(0, columns - n);
	const lo = Math.max(qMax - room, q[0] - MAX_BEND_ROWS, 0);
	const hi = Math.min(qMin + room, q[0] + MAX_BEND_ROWS, grid.rows - 1 - 2 * (n - 1));
	const s0 = lo <= hi ? rng.int(lo, hi) : Math.round((qMin + qMax) / 2);
	return q.map((_, i) => s0 + 2 * i);
}

function routeFeeder(
	grid: Grid,
	side: Side,
	startRow: number,
	goal: Cell,
	bus: number
): { corners: Cell[] | null; reached: boolean } {
	const dir = heading(side);
	const col = edgeCol(grid, side);
	const window = (row: number): SearchWindow => ({
		col0: side === 'left' ? 0 : goal.col - 1,
		col1: side === 'left' ? goal.col + 1 : grid.cols - 1,
		row0: Math.min(row, goal.row) - WINDOW_MARGIN,
		row1: Math.max(row, goal.row) + WINDOW_MARGIN
	});
	const start = { col, row: startRow };
	const options = { startDir: dir, endDir: dir, bus };
	let path = route(grid, start, goal, { ...options, window: window(startRow) });
	if (!path && startRow !== goal.row) {
		// Fall back to a straight run at the pin's own row.
		path = route(grid, { col, row: goal.row }, goal, { ...options, window: window(goal.row) });
	}
	if (path) return { corners: path, reached: true };
	const partial = route(grid, start, goal, {
		startDir: dir,
		bus,
		window: window(startRow),
		partial: true
	});
	if (partial && walkCells(partial).length >= MIN_PARTIAL_CELLS) {
		return { corners: partial, reached: false };
	}
	return { corners: null, reached: false };
}

/** Cell corners to px, starting with a point on the board edge. */
function polyline(ctx: Context, corners: readonly Cell[], side: Side): Point[] {
	const centres = corners.map((cell) => ctx.grid.centre(cell.col, cell.row));
	const edge = { x: side === 'left' ? 0 : ctx.width, y: centres[0].y };
	return simplify([edge, ...centres]);
}

/**
 * Ends the line exactly on the pin. The last run is horizontal and lies at most half a cell off the
 * pin's y: move it to the pin's y and slide the corner before it along its 45-degree segment.
 */
function alignEnd(points: Point[], pin: Point): void {
	const last = points.length - 1;
	const dy = pin.y - points[last].y;
	points[last] = { x: pin.x, y: pin.y };
	if (last < 1 || dy === 0) return;
	const k = last - 1;
	if (k > 0) {
		const j = points[k - 1];
		const sx = Math.sign(points[k].x - j.x);
		const sy = Math.sign(points[k].y - j.y);
		if (sy !== 0) points[k] = { x: points[k].x + sx * dy * sy, y: points[k].y + dy };
		else points[k] = { x: points[k].x, y: points[k].y + dy };
	} else {
		points[k] = { x: points[k].x, y: points[k].y + dy };
	}
}

/** Completes a trace with its lengths and bounds. Handy for hand-built boards in tests. */
export function makeTrace(spec: Omit<Trace, 'lengths' | 'length' | 'bbox'>): Trace {
	const lengths = cumulativeLengths(spec.points);
	return {
		...spec,
		lengths,
		length: lengths[lengths.length - 1] ?? 0,
		bbox: boundsOf(spec.points)
	};
}

/** Routes one decorative trace and adds it when it fits. */
function addDecor(
	ctx: Context,
	side: Side,
	id: string,
	busId: string,
	bus: number,
	start: Cell,
	target: Cell,
	window: SearchWindow
): void {
	const { grid } = ctx;
	if (!grid.isFree(start.col, start.row) || !grid.isFree(target.col, target.row)) return;
	const path = route(grid, start, target, { startDir: heading(side), bus, window });
	if (!path) return;
	grid.markPath(path, bus);
	const points = polyline(ctx, path, side);
	const bbox = boundsOf(points);
	ctx.traces.push(
		makeTrace({
			id,
			kind: 'decor',
			side,
			bus: busId,
			points,
			end: { kind: 'via' },
			chipId: null,
			triggerY: bbox.y
		})
	);
}

/** Decorative buses in both gutters, one per band of `DECOR_AREA / gutter width` px. */
function gutterDecor(ctx: Context, gutters: Record<Side, number>, height: number): void {
	const { grid } = ctx;
	const p = grid.pitch;
	for (const side of ['left', 'right'] as const) {
		const gutter = gutters[side];
		// Stay a few columns away from the chips, so no via sits right next to a pin.
		const maxCol = Math.floor(gutter / p) - 4;
		if (maxCol < 2) continue;
		const band = Math.max(8 * p, DECOR_AREA / gutter);
		const bands = Math.floor(height / band);
		const edge = edgeCol(grid, side);
		for (let b = 0; b < bands; b++) {
			const rng = createRng(deriveSeed(ctx.seed, `decor:${side}:${b}`));
			const n = rng.int(BUS_MIN, Math.max(BUS_MIN, Math.min(4, Math.floor(maxCol / 2))));
			const s0 = Math.floor((b * band + rng.range(0, band)) / p);
			const reach = rng.int(Math.min(3, maxCol), maxCol);
			const maxDrop = Math.max(0, Math.min(MAX_BEND_ROWS, reach - n));
			const rawDrop = rng.int(-maxDrop, maxDrop);
			// A drop of a row or two reads as a kink, not a bend: run straight instead.
			const drop = Math.abs(rawDrop) < 3 ? 0 : rawDrop;
			const bus = ++ctx.busCount;
			const busId = `decor:${side === 'left' ? 'L' : 'R'}${b}`;
			const targetCol = side === 'left' ? reach : grid.cols - 1 - reach;
			for (let i = 0; i < n; i++) {
				const start = { col: edge, row: s0 + 2 * i };
				const target = { col: targetCol, row: s0 + 2 * i + drop };
				addDecor(ctx, side, `${busId}.${i}`, busId, bus, start, target, {
					col0: Math.min(edge, targetCol) - 1,
					col1: Math.max(edge, targetCol) + 1,
					row0: Math.min(start.row, target.row) - WINDOW_MARGIN,
					row1: Math.max(start.row, target.row) + WINDOW_MARGIN
				});
			}
		}
	}
}

/** Narrow screens: short decorative runs into each gap between chips, from both edges. */
function gapDecor(ctx: Context, gaps: readonly { top: number; bottom: number }[]): void {
	const { grid } = ctx;
	const p = grid.pitch;
	gaps.forEach((gap, g) => {
		// Chips keep one free row above and below them.
		const r0 = Math.ceil((gap.top + p) / p);
		const r1 = Math.floor((gap.bottom - p) / p) - 1;
		if (r1 < r0) return;
		const free = r1 - r0 + 1;
		for (const side of ['left', 'right'] as const) {
			const rng = createRng(deriveSeed(ctx.seed, `gap:${side}:${g}`));
			const n = free >= 3 ? rng.int(1, 2) : 1;
			const first = r0 + rng.int(0, Math.max(0, free - 1 - 2 * (n - 1)));
			const reach = rng.int(Math.floor(grid.cols * 0.15), Math.floor(grid.cols * 0.4));
			const drop = rng.int(-(free - 1), free - 1);
			const bus = ++ctx.busCount;
			const busId = `gap:${side === 'left' ? 'L' : 'R'}${g}`;
			const edge = edgeCol(grid, side);
			const targetCol = side === 'left' ? reach : grid.cols - 1 - reach;
			for (let i = 0; i < n; i++) {
				const row = first + 2 * i;
				const start = { col: edge, row };
				const target = { col: targetCol, row: Math.max(r0, Math.min(r1, row + drop)) };
				addDecor(ctx, side, `${busId}.${i}`, busId, bus, start, target, {
					col0: Math.min(edge, targetCol) - 1,
					col1: Math.max(edge, targetCol) + 1,
					row0: r0,
					row1: r1
				});
			}
		}
	});
}
