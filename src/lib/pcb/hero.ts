/**
 * The hero field: a full-window field of traces round the hero content. Pure, no DOM.
 *
 * ```ts
 * const ellipse = heroEllipse([socketRect, textRect], heroArea);
 * const board = layoutBoard({ ...input, hero: { rect: heroArea, ellipse } });
 * ```
 *
 * `heroEllipse` picks the clear ellipse round the content: centred on it, holding every content
 * rect with `HERO_CLEARANCE` to spare, and leaving a band of at least `HERO_BAND` px of field to
 * each edge of the hero where the window has room. Where it hasn't, the thinnest band is as thick
 * as it can be. The ellipse may then run off the window; the field fills what is left.
 *
 * `heroField` (called by `layoutBoard`) routes the field on the board's grid, in two passes:
 * - Rim buses: it walks round the ellipse and plugs buses of 3 to 5 traces, two cells apart, into
 *   its rim, with a gap of 4 to 6 cells between buses. Each trace leaves the rim straight along
 *   the heading nearest to the ellipse's outward normal and runs to the window edge that heading
 *   points at, shifted along that edge toward the nearest corner by a seeded share of the way, so
 *   buses bend at 45 degrees on their way into the corners. It runs from the edge to the rim and
 *   ends there in a via; one in five starts at a via on the board instead, part of the way in.
 * - Fill buses: from every window edge, buses of 2 to 4 traces run into the open board left
 *   between the rim buses, bend once or not at all, and end in vias.
 * Nothing enters the ellipse (it is blocked on the grid, 6 px wider than it is, so the glow stays
 * out too), no trace turns back on itself, and the field keeps to the hero's rows above the first
 * chip and out of anything blocked already (the hero's controls, the spine). The same input and
 * seed always give the same field.
 */

import { DX, DY, dirOf, simplify, turnSteps, type Dir, type Point, type Rect } from './geometry.js';
import { walkCells, type Cell, type Grid } from './grid.js';
import { createRng, deriveSeed, type Rng } from './rng.js';
import { route, type SearchWindow } from './router.js';

export interface Ellipse {
	cx: number;
	cy: number;
	/** Half the width. */
	rx: number;
	/** Half the height. */
	ry: number;
}

/** Px between the hero content and the ellipse round it. */
export const HERO_CLEARANCE = 12;
/** The band of field (px) the ellipse leaves to every edge of the hero, where the window has room. */
export const HERO_BAND = 96;
/** Traces per rim bus. */
export const HERO_BUS_MIN = 3;
export const HERO_BUS_MAX = 5;
/** Share of the rim traces that start at a via on the board instead of at the window edge. */
export const HERO_VIA_SHARE = 0.2;

/** The field keeps this many px off the ellipse, so the glow of a trace stays outside it. */
const KEEP_OFF = 6;
/** Cells between two rim buses along the rim. */
const GAP_MIN = 4;
const GAP_MAX = 6;
/** Cells between two traces of a bus. */
const SPACING = 2;
/** Turns cost more in the field than elsewhere: fewer, cleaner bends. */
const FIELD_TURN_COST = 1.5;
/** Extra cells round a route's start and goal that its search may use. */
const MARGIN = 4;
/** A field route gives up after this many expanded states. */
const MAX_EXPANSIONS = 3000;
/**
 * Rim traces longer than this many cells route without their bus lane: the lane weakens the
 * search's estimate, and on a long route that costs more states than the cap allows.
 */
const LANE_REACH = 16;
/** A rim trace that starts at a via keeps at least this many cells. */
const MIN_VIA_CELLS = 4;
/** Offsets along the edge to try when the goal of a rim trace is taken. */
const GOAL_SHIFTS = [0, 1, -1, 2, -2, 3, -3];
/** Traces per fill bus. */
const FILL_BUS_MIN = 2;
const FILL_BUS_MAX = 4;
/** A fill bus needs this many free cells in from the edge. */
const FILL_MIN_RUN = 6;
/** How far in from the edge a free run is measured, in cells. */
const FILL_MAX_RUN = 48;
/** Candidate heights tried when fitting the ellipse. */
const FIT_STEPS = 240;

/** 0 on the centre, 1 on the rim, above 1 outside. */
export function ellipseDistance(e: Ellipse, p: Point): number {
	const dx = (p.x - e.cx) / e.rx;
	const dy = (p.y - e.cy) / e.ry;
	return Math.sqrt(dx * dx + dy * dy);
}

/** The clear ellipse round the hero content in `area`, or null without content. See the header. */
export function heroEllipse(content: readonly Rect[], area: Rect): Ellipse | null {
	if (content.length === 0) return null;
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const r of content) {
		x0 = Math.min(x0, r.x);
		y0 = Math.min(y0, r.y);
		x1 = Math.max(x1, r.x + r.width);
		y1 = Math.max(y1, r.y + r.height);
	}
	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;
	// Every corner, grown by the clearance, as an offset from the centre.
	const offsets: [number, number][] = [];
	for (const r of content) {
		for (const x of [r.x - HERO_CLEARANCE, r.x + r.width + HERO_CLEARANCE]) {
			for (const y of [r.y - HERO_CLEARANCE, r.y + r.height + HERO_CLEARANCE]) {
				offsets.push([Math.abs(x - cx), Math.abs(y - cy)]);
			}
		}
	}
	const dyMax = Math.max(...offsets.map(([, dy]) => dy));
	const lo = dyMax * 1.01;
	const hi = Math.max(lo * 4, area.height);
	let fit: { rx: number; ry: number; size: number } | null = null;
	let best: { rx: number; ry: number; band: number } | null = null;
	for (let i = 0; i <= FIT_STEPS; i++) {
		const ry = lo + ((hi - lo) * i) / FIT_STEPS;
		let rx = 0;
		for (const [dx, dy] of offsets) rx = Math.max(rx, dx / Math.sqrt(1 - (dy / ry) ** 2));
		const band = Math.min(
			cy - ry - area.y,
			area.y + area.height - (cy + ry),
			cx - rx - area.x,
			area.x + area.width - (cx + rx)
		);
		if (band >= HERO_BAND && (!fit || rx * ry < fit.size)) fit = { rx, ry, size: rx * ry };
		if (!best || band > best.band) best = { rx, ry, band };
	}
	const pick = fit ?? best!;
	return { cx, cy, rx: pick.rx, ry: pick.ry };
}

export interface HeroFieldOptions {
	grid: Grid;
	/** The hero in document px, as wide as the board. */
	area: Rect;
	ellipse: Ellipse;
	/** The first row that belongs to the chips: the field stays above it. */
	rowLimit: number;
	/** Board width in px: where the right edge is. */
	width: number;
	seed: number;
	/** Hands out a fresh bus number for the lanes. */
	nextBus: () => number;
}

export interface HeroRoute {
	/** Unique in the field, e.g. "hero:4.2" (rim bus 4, trace 2) or "hero:f3.0" (fill bus 3). */
	id: string;
	bus: string;
	/** From the window edge (or the via it starts at) to its end on the rim or in a via. */
	points: Point[];
	startVia: boolean;
}

type Edge = 'left' | 'top' | 'right' | 'bottom';

const EDGES: readonly Edge[] = ['left', 'top', 'right', 'bottom'];

/** Headings a trace may leave the window by, per edge: straight out or at 45 degrees. */
const EXIT_DIRS: Record<Edge, Dir[]> = {
	left: [4, 3, 5],
	top: [6, 5, 7],
	right: [0, 1, 7],
	bottom: [2, 1, 3]
};

/** The heading straight in from each edge. */
const INWARD: Record<Edge, Dir> = { left: 0, top: 2, right: 4, bottom: 6 };

/** Everything a pass needs. */
interface Field {
	grid: Grid;
	window: SearchWindow;
	edges: Record<Edge, number>;
	nextBus: () => number;
	out: HeroRoute[];
}

/** The heading nearest to the ellipse's outward normal at parameter `phi`. */
function outwardDir(e: Ellipse, phi: number): Dir {
	const nx = Math.cos(phi) / e.rx;
	const ny = Math.sin(phi) / e.ry;
	const octant = Math.round(Math.atan2(ny, nx) / (Math.PI / 4));
	return (((octant % 8) + 8) % 8) as Dir;
}

/** Ramanujan's approximation of the perimeter. */
function perimeter(e: Ellipse): number {
	const { rx: a, ry: b } = e;
	return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

function chebyshev(a: Cell, b: Cell): number {
	return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function inWindow(w: SearchWindow, col: number, row: number): boolean {
	return col >= w.col0 && col <= w.col1 && row >= w.row0 && row <= w.row1;
}

/** The part of `field` round two cells, with `MARGIN` to spare. */
function around(field: SearchWindow, a: Cell, b: Cell): SearchWindow {
	return {
		col0: Math.max(field.col0, Math.min(a.col, b.col) - MARGIN),
		col1: Math.min(field.col1, Math.max(a.col, b.col) + MARGIN),
		row0: Math.max(field.row0, Math.min(a.row, b.row) - MARGIN),
		row1: Math.min(field.row1, Math.max(a.row, b.row) + MARGIN)
	};
}

/** True when no run of the corner path heads more than 90 degrees away from `dir`: no loops. */
function forward(corners: readonly Cell[], dir: Dir): boolean {
	for (let i = 1; i < corners.length; i++) {
		const d = dirOf(corners[i].col - corners[i - 1].col, corners[i].row - corners[i - 1].row);
		if (d !== -1 && turnSteps(dir, d) > 2) return false;
	}
	return true;
}

/** Routes the hero field on the grid and marks it. See the file header. */
export function heroField(options: HeroFieldOptions): HeroRoute[] {
	const { grid, area, ellipse: e } = options;
	const p = grid.pitch;
	const row0 = Math.max(0, Math.ceil(area.y / p));
	const row1 = Math.min(
		grid.rows - 1,
		options.rowLimit - 1,
		Math.floor((area.y + area.height) / p) - 1
	);
	const col1 = grid.cols - 1;
	if (row1 - row0 < 3 || col1 < 3 || !(e.rx > 0) || !(e.ry > 0)) return [];

	// The keep-out: every cell whose centre lies inside the ellipse, grown by KEEP_OFF.
	const keep: Ellipse = { ...e, rx: e.rx + KEEP_OFF, ry: e.ry + KEEP_OFF };
	for (let row = row0; row <= row1; row++) {
		const t = (row * p + p / 2 - keep.cy) / keep.ry;
		if (Math.abs(t) >= 1) continue;
		const half = keep.rx * Math.sqrt(1 - t * t);
		const c0 = Math.ceil((keep.cx - half - p / 2) / p);
		const c1 = Math.floor((keep.cx + half - p / 2) / p);
		if (c1 >= c0) grid.blockCells(c0, row, c1, row);
	}

	const field: Field = {
		grid,
		window: { col0: 0, col1, row0, row1 },
		edges: {
			top: area.y,
			bottom: Math.min(area.y + area.height, (row1 + 1) * p),
			left: 0,
			right: options.width
		},
		nextBus: options.nextBus,
		out: []
	};
	rimBuses(field, keep, createRng(deriveSeed(options.seed, 'hero')));
	fillBuses(field, createRng(deriveSeed(options.seed, 'hero:fill')));
	return field.out;
}

/** The first pass: buses from the window edges into the rim of the ellipse. */
function rimBuses(field: Field, keep: Ellipse, rng: Rng): void {
	const { grid, window: w } = field;
	const p = grid.pitch;
	const kept = (c: Cell) =>
		ellipseDistance(keep, { x: c.col * p + p / 2, y: c.row * p + p / 2 }) < 1;
	const steps = Math.max(64, Math.ceil(perimeter(keep) / 3));
	const phi0 = rng.range(0, 2 * Math.PI);
	const tried = new Set<number>();

	let bus = 0;
	let size = rng.int(HERO_BUS_MIN, HERO_BUS_MAX);
	let gap = rng.int(GAP_MIN, GAP_MAX);
	let inBus = 0;
	let lane = field.nextBus();
	let shift = busShift(rng);
	let first: Cell | null = null;
	let last: Cell | null = null;

	for (let i = 0; i < steps; i++) {
		const phi = phi0 + (2 * Math.PI * i) / steps;
		const dir = outwardDir(keep, phi);
		let cell = grid.cellAt({
			x: keep.cx + keep.rx * Math.cos(phi),
			y: keep.cy + keep.ry * Math.sin(phi)
		});
		for (let k = 0; k < 3 && kept(cell); k++) {
			cell = { col: cell.col + DX[dir], row: cell.row + DY[dir] };
		}
		if (!inWindow(w, cell.col, cell.row) || !grid.isFree(cell.col, cell.row)) continue;
		if (last && chebyshev(cell, last) < (inBus === 0 ? gap : SPACING)) continue;
		// Coming back round to where the walk began: keep a gap to the first bus.
		if (first && i > steps / 2 && chebyshev(cell, first) < GAP_MIN) continue;
		const key = grid.index(cell.col, cell.row);
		if (tried.has(key)) continue;
		tried.add(key);

		// The first step off the rim goes straight out, so every trace meets the rim square on.
		const next = { col: cell.col + DX[dir], row: cell.row + DY[dir] };
		if (!inWindow(w, next.col, next.row) || !grid.isFree(next.col, next.row)) continue;
		const path = routeOut(grid, next, dir, w, lane, shift);
		if (!path) continue;
		const cells = walkCells([cell, ...path]).reverse();
		const via = rng.next() < HERO_VIA_SHARE && cells.length > 2 * MIN_VIA_CELLS;
		const from = via ? Math.floor(rng.range(0.3, 0.7) * (cells.length - MIN_VIA_CELLS)) : 0;
		const track = cells.slice(from);
		grid.markPath(track, lane);
		const points = simplify(track.map((c) => grid.centre(c.col, c.row)));
		if (!via) toEdge(points, field.edges);
		field.out.push({ id: `hero:${bus}.${inBus}`, bus: `hero:${bus}`, points, startVia: via });

		first ??= cell;
		last = cell;
		inBus++;
		if (inBus >= size) {
			bus++;
			inBus = 0;
			size = rng.int(HERO_BUS_MIN, HERO_BUS_MAX);
			gap = rng.int(GAP_MIN, GAP_MAX);
			lane = field.nextBus();
			shift = busShift(rng);
		}
	}
}

/** How far a rim bus moves along its edge toward the nearest corner, as a share of its way out. */
function busShift(rng: Rng): number {
	return rng.next() < 0.35 ? 0 : rng.range(0.2, 0.7);
}

/**
 * Routes one rim trace from the cell off the rim out to the window edge its heading points at,
 * moved along that edge toward the nearest corner by `shift` of the way. Returns the corner cells
 * (rim end first), or null.
 */
function routeOut(
	grid: Grid,
	start: Cell,
	dir: Dir,
	field: SearchWindow,
	lane: number,
	shift: number
): Cell[] | null {
	// Straight out to the edge of the field.
	let end = start;
	let travelled = 0;
	while (inWindow(field, end.col + DX[dir], end.row + DY[dir])) {
		end = { col: end.col + DX[dir], row: end.row + DY[dir] };
		travelled++;
	}
	const edge: Edge =
		end.col === field.col0 && DX[dir] < 0
			? 'left'
			: end.col === field.col1 && DX[dir] > 0
				? 'right'
				: end.row === field.row0 && DY[dir] < 0
					? 'top'
					: 'bottom';
	const vertical = edge === 'left' || edge === 'right';
	const lo = vertical ? field.row0 : field.col0;
	const hi = vertical ? field.row1 : field.col1;
	const along = vertical ? end.row : end.col;
	const toward = along - lo < hi - along ? -1 : 1;
	const base = along + toward * Math.round(shift * travelled);
	for (const offset of GOAL_SHIFTS) {
		const at = Math.max(lo, Math.min(hi, base + offset));
		const goal = vertical ? { col: end.col, row: at } : { col: at, row: end.row };
		if (!grid.isFree(goal.col, goal.row)) continue;
		const path = route(grid, start, goal, {
			startDir: dir,
			endDir: EXIT_DIRS[edge],
			bus: travelled > LANE_REACH ? 0 : lane,
			window: around(field, start, goal),
			maxExpansions: MAX_EXPANSIONS,
			turnCost: FIELD_TURN_COST
		});
		return path && forward(path, dir) ? path : null;
	}
	return null;
}

/** The second pass: buses from every window edge into the open board, ending in vias. */
function fillBuses(field: Field, rng: Rng): void {
	const { grid, window: w } = field;
	let bus = 0;
	for (const edge of EDGES) {
		const inward = INWARD[edge];
		const vertical = edge === 'left' || edge === 'right';
		const lo = vertical ? w.row0 : w.col0;
		const hi = vertical ? w.row1 : w.col1;
		const at = (along: number): Cell =>
			edge === 'left'
				? { col: w.col0, row: along }
				: edge === 'right'
					? { col: w.col1, row: along }
					: edge === 'top'
						? { col: along, row: w.row0 }
						: { col: along, row: w.row1 };
		for (let a = lo + rng.int(1, 3); a <= hi;) {
			const n = rng.int(FILL_BUS_MIN, FILL_BUS_MAX);
			const run = freeRun(grid, w, at(a), inward);
			if (run < FILL_MIN_RUN) {
				a += 1;
				continue;
			}
			const reach = Math.max(4, Math.min(run - 2, Math.round(rng.range(0.4, 0.85) * run)));
			// Bend sideways by up to half the reach (a 45-degree run), or not at all.
			const bend = rng.next() < 0.4 ? 0 : rng.int(2, Math.max(2, Math.floor(reach / 2)));
			const side = rng.next() < 0.5 ? -1 : 1;
			const lane = field.nextBus();
			let made = 0;
			for (let i = 0; i < n; i++) {
				const start = at(a + SPACING * i);
				if (!inWindow(w, start.col, start.row) || !grid.isFree(start.col, start.row)) continue;
				const lateral = vertical ? { col: 0, row: side * bend } : { col: side * bend, row: 0 };
				const goal = {
					col: start.col + DX[inward] * reach + lateral.col,
					row: start.row + DY[inward] * reach + lateral.row
				};
				if (!inWindow(w, goal.col, goal.row) || !grid.isFree(goal.col, goal.row)) continue;
				const path = route(grid, start, goal, {
					startDir: inward,
					bus: lane,
					window: around(w, start, goal),
					maxExpansions: MAX_EXPANSIONS,
					turnCost: FIELD_TURN_COST
				});
				if (!path || path.length < 2 || !forward(path, inward)) continue;
				grid.markPath(path, lane);
				const points = simplify(path.map((c) => grid.centre(c.col, c.row)));
				toEdge(points, field.edges);
				field.out.push({
					id: `hero:f${bus}.${made}`,
					bus: `hero:f${bus}`,
					points,
					startVia: false
				});
				made++;
			}
			if (made > 0) bus++;
			a += SPACING * n + rng.int(2, 4);
		}
	}
}

/** Free cells in a row from `start` along `dir`, `start` included, up to `FILL_MAX_RUN`. */
function freeRun(grid: Grid, w: SearchWindow, start: Cell, dir: Dir): number {
	let n = 0;
	let cell = start;
	while (n < FILL_MAX_RUN && inWindow(w, cell.col, cell.row) && grid.isFree(cell.col, cell.row)) {
		n++;
		cell = { col: cell.col + DX[dir], row: cell.row + DY[dir] };
	}
	return n;
}

/** Moves the first point of a trace back along its first run onto the window edge it starts at. */
function toEdge(points: Point[], edges: Record<Edge, number>): void {
	if (points.length < 2) return;
	const [a, b] = points;
	const ux = Math.sign(b.x - a.x);
	const uy = Math.sign(b.y - a.y);
	// Distances back to each edge the run points away from; the nearest one is where it starts.
	const candidates: number[] = [];
	if (ux > 0) candidates.push(a.x - edges.left);
	if (ux < 0) candidates.push(edges.right - a.x);
	if (uy > 0) candidates.push(a.y - edges.top);
	if (uy < 0) candidates.push(edges.bottom - a.y);
	if (candidates.length === 0) return;
	const t = Math.min(...candidates);
	points[0] = { x: a.x - ux * t, y: a.y - uy * t };
}
