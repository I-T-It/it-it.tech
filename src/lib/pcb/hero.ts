/**
 * The hero field: a full-window field of traces round the hero content. Pure, no DOM.
 *
 * ```ts
 * const ellipse = heroEllipse([socketRect, textRect], heroArea);
 * const board = layoutBoard({ ...input, hero: { rect: heroArea, ellipse } });
 * ```
 *
 * `heroEllipse` picks the clear ellipse round the content: centred on it, holding every content
 * rect with `HERO_CLEARANCE` to spare. It is 80% of the window wide and as tall as the content
 * needs. On a window too narrow for that (a phone), it is the ellipse round the content that leaves
 * the thickest band of field to the edges of the hero, at least `HERO_BAND` px where it can (and
 * then no bigger than that needs). The ellipse may run off the window; the field fills what is
 * left. Pass the content block by block (the socket, each line of text), not as one box: a wide
 * name over narrow lines needs a much flatter ellipse than their box would.
 *
 * `heroField` (called by `layoutBoard`) routes the field on the board's grid, in three passes:
 * - Rim buses: it walks round the ellipse and plugs buses of 3 to 5 traces, two cells apart, into
 *   its rim, with a gap of 6 to 9 cells between buses. Each trace leaves the rim straight along
 *   the heading nearest to the ellipse's outward normal and runs to the window edge that heading
 *   points at, shifted along that edge toward the nearest corner by a seeded share of the way, so
 *   buses bend at 45 degrees on their way into the corners. It runs from the edge to the rim and
 *   ends there in a via; one in five starts at a via on the board instead, part of the way in.
 * - Fill buses: from every window edge, buses of 2 to 4 traces run into the open board left
 *   between the rim buses, bend once or not at all, and end in vias.
 * - Filler buses: buses of 2 to 4 parallel traces from a via to a via, of every length, running
 *   the way the field round them runs, some with a mirrored twin, fill what open board is left.
 * Every route runs inward: its points start at the end farthest from the ellipse's centre, so the
 * growth draws it toward the content, never out toward the window edge.
 * Nothing enters the ellipse (it is blocked on the grid, 6 px wider than it is, so the glow stays
 * out too), no trace turns back on itself, and the field keeps to the hero's rows above the first
 * chip and out of anything blocked already (the hero's controls, the spine). The same input and
 * seed always give the same field.
 */

import { DX, DY, dirOf, simplify, turnSteps, type Dir, type Point, type Rect } from './geometry.js';
import { CLEARANCE, FREE, walkCells, type Cell, type Grid } from './grid.js';
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
export const HERO_CLEARANCE = 32;
/** The ellipse is this share of the window wide, when that holds the content. */
export const HERO_WIDTH = 0.8;
/** On a window too narrow for that: the band of field (px) the ellipse tries to leave all round. */
export const HERO_BAND = 96;
/** The 80% ellipse is used when it is this much wider than the content needs. */
const WIDE_ROOM = 1.05;
/** Traces per rim bus. */
export const HERO_BUS_MIN = 3;
export const HERO_BUS_MAX = 5;
/** Share of the rim traces that start at a via on the board instead of at the window edge. */
export const HERO_VIA_SHARE = 0.2;

/** The field keeps this many px off the ellipse, so the glow of a trace stays outside it. */
const KEEP_OFF = 6;
/** Cells between two rim buses along the rim. */
const GAP_MIN = 6;
const GAP_MAX = 9;
/** Cells between two traces of a bus. */
const SPACING = 2;
/** Turns cost more in the field than elsewhere: fewer, cleaner bends. */
const FIELD_TURN_COST = 1.5;
/** Extra cells round a route's start and goal that its search may use. */
const MARGIN = 4;
/** A field route gives up after this many expanded states. */
const MAX_EXPANSIONS = 1200;
/** A rim bus closes after this many failed routes in a row. */
const MAX_FAILURES = 2;
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
/** How many ways into the rim a spine link tries. */
const LINK_TRIES = 8;
/** The field runs on at most this many rows below the hero, toward the first chip. */
const BELOW_MAX_ROWS = 24;
/** One try at a filler bus per this many cells of field. */
const FILLER_TRY_CELLS = 3;
/** Traces per filler bus. */
const FILLER_BUS_MIN = 2;
const FILLER_BUS_MAX = 4;
/** Share of the filler buses that run across the field instead of out from the ellipse. */
const FILLER_ACROSS_SHARE = 0.2;
/** Share of the filler buses that bend once. */
const FILLER_BEND_SHARE = 0.6;
/** Share of the bent filler buses that get a mirrored twin. */
const FILLER_TWIN_SHARE = 0.45;
/**
 * Filler runs in cells, laid in this order: mirrored pairs, then long, middling and short buses.
 * The third value marks the mirrored pairs.
 */
const FILLER_LENGTHS: readonly (readonly [number, number, boolean])[] = [
	[7, 14, true],
	[11, 18, false],
	[6, 10, false],
	[3, 5, false]
];
/** A filler bus runs along the nearest trace within this many cells. */
const FLOW_REACH = 8;
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
	// 80% of the window wide, and as tall as the content needs, when that holds the content.
	const dxMax = Math.max(...offsets.map(([dx]) => dx));
	const wide = (HERO_WIDTH * area.width) / 2;
	if (wide >= dxMax * WIDE_ROOM) {
		let ry = 0;
		for (const [dx, dy] of offsets) ry = Math.max(ry, dy / Math.sqrt(1 - (dx / wide) ** 2));
		return { cx, cy, rx: wide, ry };
	}

	// Too narrow a window (a phone): the ellipse that leaves the thickest band of field.
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
	/** The top of every spine trace: the field runs a trace on from each, up to the rim. */
	spineTops?: readonly Point[];
}

export interface HeroRoute {
	/** Unique in the field, e.g. "hero:4.2" (rim bus 4, trace 2) or "hero:f3.0" (fill bus 3). */
	id: string;
	bus: string;
	/**
	 * From the window edge (or the via it starts at) to its end on the rim or in a via, the end
	 * nearer the centre of the ellipse last.
	 */
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
const NORTH: Dir = 6;

/** Everything a pass needs. */
interface Field {
	grid: Grid;
	/** The clear ellipse itself, not the keep-out round it: the centre the traces grow toward. */
	ellipse: Ellipse;
	window: SearchWindow;
	/** The first row below the hero: rows from here down lie on the page under it. */
	below: number;
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
	// The field runs on below the hero, down to the first chip, so the traces from the bottom end
	// on the page instead of on the hero's bottom edge.
	const below = Math.floor((area.y + area.height) / p);
	const row1 = Math.min(grid.rows - 1, options.rowLimit - 1, below - 1 + BELOW_MAX_ROWS);
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
		ellipse: e,
		window: { col0: 0, col1, row0, row1 },
		below,
		edges: { top: area.y, bottom: (row1 + 1) * p, left: 0, right: options.width },
		nextBus: options.nextBus,
		out: []
	};
	spineLinks(field, keep, options.spineTops ?? []);
	rimBuses(field, keep, createRng(deriveSeed(options.seed, 'hero')));
	fillerBuses(field, keep, createRng(deriveSeed(options.seed, 'hero:filler')));
	fillBuses(field, createRng(deriveSeed(options.seed, 'hero:fill')));
	return field.out;
}

/**
 * The cell just outside the keep-out at parameter `phi` and the heading out of it, or null when
 * that cell is outside the field or taken.
 */
function rimCell(field: Field, keep: Ellipse, phi: number): { cell: Cell; dir: Dir } | null {
	const { grid, window: w } = field;
	const p = grid.pitch;
	const dir = outwardDir(keep, phi);
	let cell = grid.cellAt({
		x: keep.cx + keep.rx * Math.cos(phi),
		y: keep.cy + keep.ry * Math.sin(phi)
	});
	for (
		let k = 0;
		k < 3 && ellipseDistance(keep, { x: cell.col * p + p / 2, y: cell.row * p + p / 2 }) < 1;
		k++
	) {
		cell = { col: cell.col + DX[dir], row: cell.row + DY[dir] };
	}
	if (!inWindow(w, cell.col, cell.row) || !grid.isFree(cell.col, cell.row)) return null;
	return { cell, dir };
}

/**
 * Before anything else: a trace from the top of each spine trace straight up out of it and on to
 * the nearest free point of the rim, so the spine grows out of the field.
 */
function spineLinks(field: Field, keep: Ellipse, tops: readonly Point[]): void {
	const { grid, window: w } = field;
	const steps = Math.max(64, Math.ceil(perimeter(keep) / 6));
	tops.forEach((top, i) => {
		const spine = grid.cellAt(top);
		const start = { col: spine.col, row: spine.row - 1 };
		if (!inWindow(w, start.col, start.row)) return;
		// The ways into the rim, one cell out from it, nearest first.
		const ways: { cell: Cell; next: Cell; dir: Dir; d: number }[] = [];
		for (let k = 0; k < steps; k++) {
			const rim = rimCell(field, keep, (2 * Math.PI * k) / steps);
			if (!rim) continue;
			const next = { col: rim.cell.col + DX[rim.dir], row: rim.cell.row + DY[rim.dir] };
			if (!inWindow(w, next.col, next.row) || !grid.isFree(next.col, next.row)) continue;
			ways.push({ ...rim, next, d: chebyshev(next, start) + Math.abs(next.col - start.col) / 2 });
		}
		ways.sort((a, b) => a.d - b.d);
		// The cell above the spine lies in its clearance: let the route in.
		const index = grid.index(start.col, start.row);
		const state = grid.cells[index];
		if (state !== FREE && state !== CLEARANCE) return;
		grid.cells[index] = FREE;
		let found: { path: Cell[]; cell: Cell } | null = null;
		// The nearest ones may lie behind a link already made: try a few, a few cells apart.
		let tried = 0;
		let lastTried: Cell | null = null;
		for (const way of ways) {
			if (tried >= LINK_TRIES) break;
			if (lastTried && chebyshev(way.cell, lastTried) < 3) continue;
			tried++;
			lastTried = way.cell;
			const inward = ((way.dir + 4) & 7) as Dir;
			const path = route(grid, start, way.next, {
				startDir: NORTH,
				endDir: [inward, ((inward + 1) & 7) as Dir, ((inward + 7) & 7) as Dir],
				window: around(w, start, way.next),
				maxExpansions: MAX_EXPANSIONS,
				turnCost: FIELD_TURN_COST
			});
			if (path && forward(path, NORTH)) {
				found = { path, cell: way.cell };
				break;
			}
		}
		if (!found) {
			grid.cells[index] = state;
			return;
		}
		const corners = [...found.path, found.cell];
		const lane = field.nextBus();
		grid.markPath(corners, lane);
		const points = simplify([
			{ ...top },
			...walkCells(corners).map((c) => grid.centre(c.col, c.row))
		]);
		field.out.push({ id: `hero:s${i}`, bus: `hero:s${i}`, points, startVia: false });
	});
}

/** The first pass: buses from the window edges into the rim of the ellipse. */
function rimBuses(field: Field, keep: Ellipse, rng: Rng): void {
	const { grid, window: w } = field;
	const steps = Math.max(64, Math.ceil(perimeter(keep) / 3));
	const phi0 = rng.range(0, 2 * Math.PI);
	const tried = new Set<number>();

	let bus = 0;
	let size = rng.int(HERO_BUS_MIN, HERO_BUS_MAX);
	let gap = rng.int(GAP_MIN, GAP_MAX);
	let inBus = 0;
	let lane = field.nextBus();
	let shift = busShift(rng);
	// The row below the hero where a bus that leaves by the bottom starts, on vias.
	const shallowest = Math.min(field.below + 1, w.row1);
	let depth = rng.int(shallowest, w.row1);
	let first: Cell | null = null;
	let last: Cell | null = null;
	let failures = 0;

	for (let i = 0; i < steps; i++) {
		const rim = rimCell(field, keep, phi0 + (2 * Math.PI * i) / steps);
		if (!rim) continue;
		const { cell, dir } = rim;
		if (last && chebyshev(cell, last) < (inBus === 0 ? gap : SPACING)) continue;
		// Coming back round to where the walk began: keep a gap to the first bus.
		if (first && i > steps / 2 && chebyshev(cell, first) < GAP_MIN) continue;
		const key = grid.index(cell.col, cell.row);
		if (tried.has(key)) continue;
		tried.add(key);

		// The first step off the rim goes straight out, so every trace meets the rim square on.
		const next = { col: cell.col + DX[dir], row: cell.row + DY[dir] };
		if (!inWindow(w, next.col, next.row) || !grid.isFree(next.col, next.row)) continue;
		const out = routeOut(grid, next, dir, w, lane, shift, depth);
		if (!out) {
			// A bus that keeps failing has run into a crowded corner: close it, try another shape.
			if (++failures >= MAX_FAILURES) {
				failures = 0;
				if (inBus > 0) bus++;
				inBus = 0;
				size = rng.int(HERO_BUS_MIN, HERO_BUS_MAX);
				lane = field.nextBus();
				shift = busShift(rng);
				depth = rng.int(shallowest, w.row1);
				// Move on past the crowded spot before the next try.
				last = cell;
			}
			continue;
		}
		failures = 0;
		const cells = walkCells([cell, ...out.path]).reverse();
		// Out of the bottom: it starts on a via on the page below the hero.
		const bottom = out.edge === 'bottom';
		const cut = !bottom && rng.next() < HERO_VIA_SHARE && cells.length > 2 * MIN_VIA_CELLS;
		const from = cut ? Math.floor(rng.range(0.3, 0.7) * (cells.length - MIN_VIA_CELLS)) : 0;
		const track = cells.slice(from);
		grid.markPath(track, lane);
		const points = simplify(track.map((c) => grid.centre(c.col, c.row)));
		const via = cut || bottom;
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
			depth = rng.int(shallowest, w.row1);
		}
	}
}

/** How far a rim bus moves along its edge toward the nearest corner, as a share of its way out. */
function busShift(rng: Rng): number {
	return rng.next() < 0.35 ? 0 : rng.range(0.2, 0.7);
}

/**
 * Routes one rim trace from the cell off the rim out to the window edge its heading points at,
 * moved along that edge toward the nearest corner by `shift` of the way. One that heads out of
 * the bottom stops at row `depth` instead, below the hero. Returns the corner cells (rim end
 * first) and the edge, or null.
 */
function routeOut(
	grid: Grid,
	start: Cell,
	dir: Dir,
	field: SearchWindow,
	lane: number,
	shift: number,
	depth: number
): { path: Cell[]; edge: Edge } | null {
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
	const row = edge === 'bottom' ? Math.max(start.row, Math.min(end.row, depth)) : end.row;
	for (const offset of GOAL_SHIFTS) {
		const at = Math.max(lo, Math.min(hi, base + offset));
		const goal = vertical ? { col: end.col, row: at } : { col: at, row };
		if (!grid.isFree(goal.col, goal.row)) continue;
		const path = route(grid, start, goal, {
			startDir: dir,
			endDir: EXIT_DIRS[edge],
			bus: travelled > LANE_REACH ? 0 : lane,
			window: around(field, start, goal),
			maxExpansions: MAX_EXPANSIONS,
			turnCost: FIELD_TURN_COST
		});
		return path && forward(path, dir) ? { path, edge } : null;
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
					bus: reach > LANE_REACH ? 0 : lane,
					window: around(w, start, goal),
					maxExpansions: MAX_EXPANSIONS,
					turnCost: FIELD_TURN_COST
				});
				if (!path || path.length < 2 || !forward(path, inward)) continue;
				grid.markPath(path, lane);
				const points = simplify(path.map((c) => grid.centre(c.col, c.row)));
				// From the bottom they start on vias on the page below the hero.
				const via = edge === 'bottom';
				if (!via) toEdge(points, field.edges);
				field.out.push({
					id: `hero:f${bus}.${made}`,
					bus: `hero:f${bus}`,
					points,
					startVia: via
				});
				made++;
			}
			if (made > 0) bus++;
			a += SPACING * n + rng.int(2, 4);
		}
	}
}

/** One run of a filler bus: corners of each of its traces, in cells. */
type BusShape = Cell[][];

/**
 * The corners of a bus of `n` traces, two cells apart, that run `first` cells along `dir` and,
 * when `turn` is not 0, `second` more after a 45-degree turn. Trace i starts `2 i` cells to the
 * clockwise side of `start`. On a straight heading the traces on the inside of the turn turn
 * earlier, so the bus keeps its spacing round the bend.
 */
function busShape(
	start: Cell,
	dir: Dir,
	n: number,
	first: number,
	turn: number,
	second: number
): BusShape {
	const side = ((dir + 2) & 7) as Dir;
	const bent = ((dir + turn + 8) & 7) as Dir;
	// Clockwise turns bend toward the higher traces: those are inside and turn first.
	const step = turn === 0 || dir & 1 ? 0 : turn > 0 ? -2 : 2;
	const out: BusShape = [];
	for (let i = 0; i < n; i++) {
		const from = { col: start.col + DX[side] * 2 * i, row: start.row + DY[side] * 2 * i };
		const run = first + step * i;
		const corner = { col: from.col + DX[dir] * run, row: from.row + DY[dir] * run };
		if (turn === 0) {
			out.push([from, corner]);
			continue;
		}
		// The inside traces turn sooner, so they run on that much longer after the turn.
		const after = second - step * i;
		out.push([
			from,
			corner,
			{ col: corner.col + DX[bent] * after, row: corner.row + DY[bent] * after }
		]);
	}
	return out;
}

/**
 * The third pass: filler buses, from a via to a via, over the open board that is left. A bus is
 * 2 to 4 traces, two cells apart, running the way the field round it runs (out from the ellipse,
 * now and then across), short, middling or long, straight or with one 45-degree bend. A bent bus
 * sometimes gets a mirrored twin beside it that bends the other way. No search: a bus that does
 * not fit where it lands is dropped, a twin that does not fit is left out. A bus has no window
 * edge it comes in from, so it is laid either way round and drawn the way that heads in: all its
 * traces from the end farther from the ellipse's centre (a twin on its own, it may head the
 * other way).
 */
function fillerBuses(field: Field, keep: Ellipse, rng: Rng): void {
	const { grid, window: w } = field;
	const p = grid.pitch;
	const cells = (w.col1 - w.col0 + 1) * (w.row1 - w.row0 + 1);
	// The runs of the field so far, to lay filler parallel to.
	const runs: { a: Point; b: Point; dir: Dir }[] = [];
	for (const route of field.out) {
		for (let i = 1; i < route.points.length; i++) {
			const a = route.points[i - 1];
			const b = route.points[i];
			const d = dirOf(b.x - a.x, b.y - a.y);
			if (d !== -1) runs.push({ a, b, dir: d });
		}
	}
	/** The heading of the run nearest to `q`; out from the ellipse when there is none close by. */
	const flowAt = (q: Point): Dir => {
		let best = FLOW_REACH * p;
		let dir: Dir | null = null;
		for (const run of runs) {
			const dx = run.b.x - run.a.x;
			const dy = run.b.y - run.a.y;
			const span = dx * dx + dy * dy;
			const t =
				span > 0
					? Math.max(0, Math.min(1, ((q.x - run.a.x) * dx + (q.y - run.a.y) * dy) / span))
					: 0;
			const d = Math.hypot(q.x - (run.a.x + t * dx), q.y - (run.a.y + t * dy));
			if (d < best) {
				best = d;
				dir = run.dir;
			}
		}
		return (
			dir ?? outwardDir(keep, Math.atan2((q.y - keep.cy) / keep.ry, (q.x - keep.cx) / keep.rx))
		);
	};
	const tries = Math.round(cells / FILLER_TRY_CELLS);
	// Away from the window edges, where the other traces come in.
	const inside = (c: Cell) => c.col > w.col0 && c.col < w.col1 && c.row > w.row0 && c.row < w.row1;
	/** True when every trace fits on free board and keeps two cells from the others. */
	const fits = (shape: BusShape) => {
		const near = new Set<number>();
		for (const corners of shape) {
			const walked = walkCells(corners);
			for (const c of walked) {
				if (!inside(c) || !grid.isFree(c.col, c.row) || near.has(grid.index(c.col, c.row))) {
					return false;
				}
			}
			for (const c of walked) {
				for (let dr = -1; dr <= 1; dr++) {
					for (let dc = -1; dc <= 1; dc++) near.add(grid.index(c.col + dc, c.row + dr));
				}
			}
		}
		return true;
	};
	let made = 0;
	/**
	 * True when the traces of a bus, taken together, would be drawn out from the ellipse's centre
	 * as laid: the whole bus goes the same way, the way most of it points.
	 */
	const outward = (shape: BusShape): boolean => {
		let balance = 0;
		for (const corners of shape) {
			const a = corners[0];
			const b = corners[corners.length - 1];
			balance +=
				ellipseDistance(field.ellipse, grid.centre(a.col, a.row)) -
				ellipseDistance(field.ellipse, grid.centre(b.col, b.row));
		}
		return balance < 0;
	};
	/** Lays a bus, its traces drawn toward the ellipse (`reverse`: from the end they were laid at). */
	const add = (shape: BusShape, bus: string, reverse: boolean) => {
		const lane = field.nextBus();
		shape.forEach((corners, i) => {
			grid.markPath(corners, lane);
			const ordered = reverse ? [...corners].reverse() : corners;
			field.out.push({
				id: `${bus}.${i}`,
				bus,
				points: simplify(ordered.map((c) => grid.centre(c.col, c.row))),
				startVia: true
			});
		});
	};
	// Mirrored pairs first, they need the most room; then long buses, so they get the long
	// stretches of open board; then middling, then short.
	for (const [shortest, longest, pairs] of FILLER_LENGTHS) {
		for (let k = 0; k < tries / FILLER_LENGTHS.length; k++) {
			const start = { col: rng.int(w.col0 + 1, w.col1 - 1), row: rng.int(w.row0 + 1, w.row1 - 1) };
			// The way the field runs here: along the nearest trace, now and then across it.
			const across = rng.next() < FILLER_ACROSS_SHARE ? 2 : 0;
			const reverse = rng.next() < 0.5 ? 4 : 0;
			const n = pairs ? FILLER_BUS_MIN : rng.int(FILLER_BUS_MIN, FILLER_BUS_MAX);
			const bendRoll = rng.next();
			const turnRoll = rng.next();
			const split = rng.range(0.4, 0.65);
			const twin = rng.next() < FILLER_TWIN_SHARE;
			const pick = rng.next();
			if (!grid.isFree(start.col, start.row)) continue;
			const dir = ((flowAt(grid.centre(start.col, start.row)) + across + reverse) & 7) as Dir;
			// No longer than the free board ahead of every trace of the bus allows.
			const side = ((dir + 2) & 7) as Dir;
			let room = longest;
			for (let i = 0; i < n && room >= shortest; i++) {
				const from = { col: start.col + DX[side] * 2 * i, row: start.row + DY[side] * 2 * i };
				room = Math.min(room, freeRun(grid, w, from, dir) - 1);
			}
			if (room < shortest) continue;
			const cells = shortest + Math.floor(pick * (room - shortest + 1));
			const bend = pairs || bendRoll < FILLER_BEND_SHARE;
			placeFiller(start, dir, n, cells, bend, turnRoll, split, pairs || twin, pairs);
		}
	}

	/**
	 * Lays one filler bus, bent if asked and it fits, else straight; with `twin`, a bent one gets a
	 * mirror image beside it when both fit. With `pairOnly`, only a mirrored pair will do.
	 */
	function placeFiller(
		start: Cell,
		dir: Dir,
		n: number,
		cells: number,
		bend: boolean,
		turnRoll: number,
		split: number,
		twin: boolean,
		pairOnly: boolean
	): void {
		for (const bends of pairOnly ? [true] : bend ? [true, false] : [false]) {
			const turn = bends ? (turnRoll < 0.5 ? -1 : 1) : 0;
			const step = turn === 0 || dir & 1 ? 0 : turn > 0 ? -2 : 2;
			// Every trace of a bent bus keeps at least two cells either side of its turn.
			const firstMin = step < 0 ? 2 * n : 2;
			const secondMin = step > 0 ? 2 * n : 2;
			const first = bends ? Math.max(firstMin, Math.round(cells * split)) : cells;
			const second = bends ? Math.max(secondMin, cells - first) : 0;
			if (bends && first + second > cells + 2) continue;
			const shape = busShape(start, dir, n, first, turn, second);
			const bus = `hero:d${made}`;
			if (twin && bends) {
				// A mirror image beside it, on the side it bends away from, bending the other way:
				// the two traces nearest each other turn at the same point.
				const side = ((dir + 2) & 7) as Dir;
				const offset = turn > 0 ? -2 * n : 2 * n;
				const from = { col: start.col + DX[side] * offset, row: start.row + DY[side] * offset };
				const shift = step * (n - 1);
				const mirrored = busShape(from, dir, n, first + shift, -turn, second - shift);
				if (fits([...shape, ...mirrored])) {
					made++;
					add(shape, bus, outward(shape));
					add(mirrored, `${bus}m`, outward(mirrored));
					return;
				}
			}
			if (pairOnly) continue;
			if (fits(shape)) {
				made++;
				add(shape, bus, outward(shape));
				return;
			}
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
