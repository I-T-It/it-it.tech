/**
 * Lays out the whole board: which traces exist and where they run. Pure, no DOM.
 *
 * ```ts
 * const port = socket();
 * const board = layoutBoard({
 *   width: root.clientWidth, height: root.scrollHeight, viewportWidth: innerWidth,
 *   chips: chips().map((c) => ({ id: c.id, side: c.side, rect: docRect(c.el), pins: c.pins().map(docCentre) })),
 *   obstacles: obstacles().map(docRect),
 *   socket: port ? { rect: docRect(port.el), ports: port.ports().map(docCentre) } : undefined,
 *   hero: { rect: heroArea, ellipse: heroEllipse([docRect(port.el), docRect(text)], heroArea) }
 * });
 * ```
 *
 * Input is measured in document CSS px (a client rect plus the scroll offset). `pins` are the pin
 * centres in DOM order, so `end.pin` is the index `ChipHandle.flashPin` takes. A pin left of the
 * chip's centre line is a left pin. `ports` are the socket's port centres, in DOM order.
 *
 * The hero is everything above the first chip. `board.heroBottom` is its bottom edge: the top of
 * the cell row the first chip keeps clear above itself.
 *
 * What it builds:
 * - Spine (`spine`): a bus of 2 to 3 traces down each gutter (left cyan, right green), from the
 *   hero bottom to the last chip. Each runs straight down, around obstacles where it must, and ends
 *   in a via. The growth draws it by scroll position (see `growth.ts`).
 * - Branches (`branch`): from the innermost spine trace to the chip pins, in buses of 2 to 5 per
 *   started 960 px of chip height (at most 3 buses per side). A branch leaves the spine at 45
 *   degrees at its junction (`points[0]`, on the spine; `parent` is the spine trace) and comes in
 *   horizontally to end exactly on its pin. A chip whose branch can't be built gets
 *   `fallback: true`, and so does a chip with no branch at all; those boot on the timer.
 * - Hero field (`hero`, only with `hero`): a field of traces filling the hero across the whole
 *   board, from the window edges (and some vias on the board) to the rim of the clear ellipse
 *   round the hero content, plus buses from the edges that end in vias. See `hero.ts`.
 * - Socket traces (`socket`, only with `socket` and without `hero`): from all four edges of the
 *   hero (left, top, right, and the hero bottom) into the socket, each ending exactly on a port. A
 *   port takes up to three traces, coming in straight or at 45 degrees through the side of the
 *   socket it is nearest to; only that last run lies inside the socket. Every edge gets 2 to 3
 *   traces as far as the ports allow (two ports give 6 traces), and ports are shared out evenly.
 * - Decoration (`decor`): short buses from the edge into the gutter outside the spine, ending in
 *   vias. Their number grows with the gutter area. With a socket or a hero, the hero has none.
 * - Narrow screens (a gutter under 24 px) and gutters too tight for a bus: a spine of one trace per
 *   side at the screen edge, with short horizontal branches into the pins, and no decoration.
 *
 * Traces never enter chips, obstacles or the content column (with a socket or a hero, the hero
 * rows are open so the socket traces or the field can reach in; register hero text as an obstacle
 * to keep them out from under it). They keep 24 px apart, except a branch at its junction and the socket traces that
 * share a port on their last run, and bend at 45 degrees only. Left traces are `side: 'left'`
 * (cyan), right ones `side: 'right'` (green); a socket trace from the top or bottom takes the side
 * of its port. The same input and seed always give the same board.
 */

import {
	boundsOf,
	cumulativeLengths,
	dirOf,
	DX,
	DY,
	EAST,
	simplify,
	WEST,
	type Dir,
	type Point,
	type Rect
} from './geometry.js';
import { BLOCKED, CLEARANCE, FREE, Grid, walkCells, type Cell } from './grid.js';
import { heroField, type Ellipse } from './hero.js';
import type { ChipSide } from './registry.svelte.js';
import { boardSeed, createRng, deriveSeed, type Rng } from './rng.js';
import { route, type SearchWindow } from './router.js';

/** A gutter narrower than this (CSS px) switches the board to narrow mode. */
export const NARROW_GUTTER = 24;
export const BUS_MIN = 2;
export const BUS_MAX = 5;
/** One branch bus per started band of this much chip height (CSS px)... */
export const BUS_BAND = 960;
/** ...up to this many per side. */
export const MAX_BUSES_PER_SIDE = 3;
/** One decorative bus per this much gutter area (CSS px squared). */
export const DECOR_AREA = 40_000;
/** Spine traces per gutter, when the gutter has room for them. */
export const SPINE_MIN = 2;
export const SPINE_MAX = 3;
/** Socket traces per hero edge, as far as the ports allow. */
export const SOCKET_BUS_MIN = 2;
export const SOCKET_BUS_MAX = 3;

const SOUTH_EAST: Dir = 1;
const SOUTH: Dir = 2;
const SOUTH_WEST: Dir = 3;
const NORTH: Dir = 6;

/** Extra rows around a route's start and goal that the search may use. */
const WINDOW_MARGIN = 6;
/** A decorative bus drops or rises at most this many rows. */
const MAX_BEND_ROWS = 16;
/** Pins of one bus closer than this many rows would crowd their branches; the lower one is skipped. */
const BRANCH_ROW_GAP = 3;
/** Columns between the innermost spine trace and the pins' approach column: at least... */
const BRANCH_REACH_MIN = 2;
/** ...and at most. */
const BRANCH_REACH_MAX = 4;
/** How many cells out from a port the search for a free approach cell goes. */
const MAX_APPROACH = 24;
/** Offsets along the edge to try when a socket trace's first choice of start is taken. */
const START_SHIFTS = [0, 1, -1, 2, -2, 3, -3, 4, -4];

export type Side = 'left' | 'right';

export interface ChipInput {
	id: string;
	/** Which sides get branches, as registered. */
	side: ChipSide;
	/** The chip's border box in document px. */
	rect: Rect;
	/** Pin centres in document px, in DOM order. */
	pins: readonly Point[];
}

export interface SocketInput {
	/** The socket's border box in document px. Traces only enter it on their last run. */
	rect: Rect;
	/** Port centres in document px, in DOM order. */
	ports: readonly Point[];
	/** With a hero: the indexes of the ports the two lead traces run into. */
	leads?: readonly number[];
}

export interface HeroInput {
	/** The hero in document px, as wide as the board: the field fills it. */
	rect: Rect;
	/** The clear ellipse round the hero content (see `heroEllipse`). No trace enters it. */
	ellipse: Ellipse;
}

export interface LayoutInput {
	/** Document width in CSS px (the board's right edge). */
	width: number;
	/** Document height in CSS px. */
	height: number;
	/** Viewport width; picks the seed bucket. Default: `width`. */
	viewportWidth?: number;
	chips: readonly ChipInput[];
	/** Rects traces route around, such as hero text. */
	obstacles?: readonly Rect[];
	/**
	 * The hero socket the socket traces plug into. Without it there are no socket traces, and with
	 * a `hero` neither: the ellipse round the hero content stays clear.
	 */
	socket?: SocketInput;
	/** The hero the field of `hero` traces fills. Without it there is no field. */
	hero?: HeroInput;
	/** Overrides the seed. Default: `boardSeed(viewportWidth)`. */
	seed?: number;
}

/**
 * `spine`: a gutter bus, drawn by scroll position. `branch`: from the spine to a chip pin.
 * `socket`: from a hero edge to a socket port. `hero`: the field round the hero content, from a
 * window edge (or a via) to the rim of the ellipse. `decor`: decoration, ends in a via.
 */
export type TraceKind = 'spine' | 'branch' | 'socket' | 'hero' | 'decor';

export type TraceEnd =
	{ kind: 'pin'; chipId: string; pin: number } | { kind: 'port'; port: number } | { kind: 'via' };

export interface Trace {
	/** Stable across relayouts with the same structure, e.g. "about:L0.1", "spine:R0" or "socket:T1". */
	id: string;
	kind: TraceKind;
	/** Colour: left is cyan, right is green. */
	side: Side;
	/** Traces of one bus share this id. */
	bus: string;
	/** The polyline in document px, from its start to the pin, port or via. */
	points: Point[];
	/** Cumulative length at every point (see `geometry.ts`). */
	lengths: number[];
	/** Total length in px. */
	length: number;
	/** Bounds of `points`, for viewport culling. */
	bbox: Rect;
	end: TraceEnd;
	/** The chip a branch belongs to; null for the other kinds. */
	chipId: string | null;
	/**
	 * Document y the growth front has to pass before the trace grows: a branch's junction, the
	 * trace's own top otherwise. The spine and socket traces don't latch (see `growth.ts`).
	 */
	triggerY: number;
	/** For a branch: the id of the spine trace it starts on. */
	parent?: string;
	/** True when the trace starts at a via on the board (a hero trace that starts part of the way in). */
	startVia?: boolean;
}

export interface ChipWiring {
	id: string;
	/** Document y of the chip top: the growth trigger of a chip without branches. */
	top: number;
	/** Ids of the branches that end on this chip's pins. */
	feeders: string[];
	/** True when a branch could not be built or the chip has none: it boots on the timer. */
	fallback: boolean;
}

export interface Board {
	seed: number;
	width: number;
	height: number;
	narrow: boolean;
	/** Document y of the hero's bottom edge, where the spine starts and the bottom socket traces too. */
	heroBottom: number;
	/** The hero input the field was built for; null without one. */
	hero: HeroInput | null;
	traces: Trace[];
	/** One entry per input chip, top to bottom. */
	chips: ChipWiring[];
}

interface SidePin {
	index: number;
	point: Point;
	/** The free cell just outside the chip where the branch's grid path ends. */
	cell: Cell;
}

interface Context {
	grid: Grid;
	width: number;
	seed: number;
	/** The first row of the first chip's clearance; the hero is the rows above it. */
	heroRow: number;
	heroBottom: number;
	traces: Trace[];
	busCount: number;
}

interface SideSetup {
	side: Side;
	/** Gutter width in px, from the board edge to the content column. */
	gutter: number;
	/** Grid columns in the gutter that stay free next to the chips, counted from the edge. */
	freeCols: number;
}

interface BranchPlan {
	/** Index into the sorted chips. */
	chip: number;
	bus: string;
	pins: SidePin[];
}

function byTopThenId(a: ChipInput, b: ChipInput): number {
	return a.rect.y - b.rect.y || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/** Lays out the board. See the file header. */
export function layoutBoard(input: LayoutInput): Board {
	const width = Math.max(0, input.width);
	const height = Math.max(0, input.height);
	const seed = input.seed ?? boardSeed(input.viewportWidth ?? width);
	const grid = new Grid(width, height);
	const p = grid.pitch;
	const chips = [...input.chips].sort(byTopThenId);
	const obstacles = input.obstacles ?? [];
	const socket = input.socket;
	const hero = input.hero;
	// The hero rows stay open for the socket traces or the hero field.
	const openHero = socket !== undefined || hero !== undefined;

	// The content column spans the chips. Without chips, the obstacles and the socket define it.
	let contentLeft = Infinity;
	let contentRight = -Infinity;
	const columnRects =
		chips.length > 0 ? chips.map((c) => c.rect) : [...obstacles, ...(socket ? [socket.rect] : [])];
	for (const rect of columnRects) {
		contentLeft = Math.min(contentLeft, rect.x);
		contentRight = Math.max(contentRight, rect.x + rect.width);
	}
	const hasContent = contentLeft < contentRight;
	const gutters = {
		left: hasContent ? Math.max(0, contentLeft) : width / 2,
		right: hasContent ? Math.max(0, width - contentRight) : width / 2
	};
	const narrow = Math.min(gutters.left, gutters.right) < NARROW_GUTTER;

	const heroRow =
		chips.length > 0 ? clamp(Math.floor((chips[0].rect.y - p) / p), 0, grid.rows) : grid.rows;
	const heroBottom = heroRow * p;

	// Obstacles and the socket keep a cell of clearance all round. On narrow screens chips only keep
	// it top and bottom, so the last column next to them stays open for the edge spine.
	for (const rect of obstacles) grid.blockRect(rect, 1);
	if (socket) grid.blockRect(socket.rect, 1);
	for (const chip of chips) grid.blockRect(chip.rect, narrow ? 0 : 1, 1);
	if (hasContent) blockContent(grid, contentLeft, contentRight, openHero ? heroRow : 0);

	// Decide which pins have room before any trace takes it.
	const pinsBySide = {
		left: chips.map((chip) => sidePins(grid, chip, 'left', narrow)),
		right: chips.map((chip) => sidePins(grid, chip, 'right', narrow))
	};

	const ctx: Context = { grid, width, seed, heroRow, heroBottom, traces: [], busCount: 0 };
	const wiring: ChipWiring[] = chips.map((chip) => ({
		id: chip.id,
		top: chip.rect.y,
		feeders: [],
		fallback: false
	}));
	const lastBottom = Math.max(...chips.map((c) => c.rect.y + c.rect.height));
	const endRow = clamp(Math.ceil(lastBottom / p) - 1, 0, grid.rows - 1);

	const setups: SideSetup[] = [
		{
			side: 'left',
			gutter: gutters.left,
			freeCols: Math.max(0, Math.floor((contentLeft - p) / p))
		},
		{
			side: 'right',
			gutter: gutters.right,
			freeCols: Math.max(0, grid.cols - Math.ceil((contentRight + p) / p))
		}
	];
	const decorLimit = setups.map((setup) =>
		wireSide(ctx, setup, chips, pinsBySide[setup.side], wiring, narrow, endRow)
	);
	for (const chip of wiring) if (chip.feeders.length === 0) chip.fallback = true;

	if (hero) {
		// The two leads first: they are the only traces that cross the ellipse.
		if (socket) leadTraces(ctx, socket);
		heroTraces(ctx, hero);
	} else if (socket && socket.ports.length > 0) {
		socketTraces(ctx, socket);
	}
	if (!narrow) {
		setups.forEach((setup, i) => {
			gutterDecor(ctx, setup, decorLimit[i], openHero ? heroRow : 0, height);
		});
	}

	return {
		seed,
		width,
		height,
		narrow,
		heroBottom,
		hero: hero ?? null,
		traces: ctx.traces,
		chips: wiring
	};
}

/** The hero field (see `hero.ts`), as `hero` traces. */
function heroTraces(ctx: Context, hero: HeroInput): void {
	const routes = heroField({
		grid: ctx.grid,
		area: hero.rect,
		ellipse: hero.ellipse,
		rowLimit: ctx.heroRow,
		width: ctx.width,
		seed: ctx.seed,
		nextBus: () => ++ctx.busCount,
		spineTops: ctx.traces.filter((t) => t.kind === 'spine').map((t) => t.points[0])
	});
	for (const r of routes) {
		ctx.traces.push(
			makeTrace({
				id: r.id,
				kind: 'hero',
				side: r.points[0].x < ctx.width / 2 ? 'left' : 'right',
				bus: r.bus,
				points: r.points,
				end: { kind: 'via' },
				chipId: null,
				triggerY: boundsOf(r.points).y,
				startVia: r.startVia || undefined
			})
		);
	}
}

/** Blocks the content column from `fromRow` down. */
function blockContent(grid: Grid, left: number, right: number, fromRow: number): void {
	const p = grid.pitch;
	grid.blockCells(Math.floor(left / p), fromRow, Math.ceil(right / p) - 1, grid.rows - 1);
}

/**
 * The pins on one side of a chip that have a free approach cell, top to bottom, at least
 * `BRANCH_ROW_GAP` rows apart.
 */
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
	out.sort((a, b) => a.point.y - b.point.y || a.index - b.index);
	const spaced: SidePin[] = [];
	for (const pin of out) {
		const last = spaced.at(-1);
		if (!last || pin.cell.row - last.cell.row >= BRANCH_ROW_GAP) spaced.push(pin);
	}
	return spaced;
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
 * Builds one side's spine and its branches. Returns the outermost local column decoration may use
 * (-1 for none).
 */
function wireSide(
	ctx: Context,
	setup: SideSetup,
	chips: readonly ChipInput[],
	pins: readonly SidePin[][],
	wiring: ChipWiring[],
	narrow: boolean,
	endRow: number
): number {
	const { grid } = ctx;
	const { side } = setup;
	const letter = side === 'left' ? 'L' : 'R';
	const plans: BranchPlan[] = [];
	chips.forEach((chip, i) => {
		if (pins[i].length === 0) return;
		const rng = createRng(deriveSeed(ctx.seed, `${chip.id}:${side}`));
		pickBuses(chip, pins[i], rng).forEach((busPins, k) => {
			plans.push({ chip: i, bus: `${chip.id}:${letter}${k}`, pins: busPins });
		});
	});
	if (plans.length === 0) return Math.floor(setup.gutter / grid.pitch) - 4;

	const reach = clamp(Math.floor(setup.freeCols / 4), BRANCH_REACH_MIN, BRANCH_REACH_MAX);
	const inner = setup.freeCols - 1 - reach;
	if (narrow || inner < 0) {
		edgeSpine(ctx, setup, plans, wiring, endRow);
		return -1;
	}

	const rng = createRng(deriveSeed(ctx.seed, `spine:${side}`));
	const count = Math.min(rng.int(SPINE_MIN, SPINE_MAX), Math.floor(inner / 2) + 1);

	// The spine starts at the hero bottom, or higher when a junction needs it.
	let rowStart = ctx.heroRow;
	let rowEnd = endRow;
	for (const plan of plans) {
		for (const pin of plan.pins) {
			const junction = pin.cell.row - branchDiagonal(grid, side, inner, pin);
			rowStart = Math.min(rowStart, junction - 1);
			rowEnd = Math.max(rowEnd, junction + 1);
		}
	}
	rowStart = clamp(rowStart, 0, grid.rows - 1);
	rowEnd = clamp(rowEnd, rowStart, grid.rows - 1);

	const window: SearchWindow = {
		col0: side === 'left' ? 0 : grid.cols - setup.freeCols,
		col1: side === 'left' ? setup.freeCols - 1 : grid.cols - 1,
		row0: rowStart,
		row1: rowEnd
	};
	const bus = ++ctx.busCount;
	let source: { id: string; colAt: Int32Array } | null = null;
	let outer = inner;
	for (let i = 0; i < count; i++) {
		const local = inner - 2 * i;
		const col = side === 'left' ? local : grid.cols - 1 - local;
		const from = { col, row: rowStart };
		const to = { col, row: rowEnd };
		// Blocked further down: the spine ends where it gets stuck.
		const path =
			route(grid, from, to, { startDir: SOUTH, endDir: SOUTH, window }) ??
			route(grid, from, to, { startDir: SOUTH, window, partial: true });
		if (!path || path.length < 2) continue;
		grid.markPath(path, bus);
		const id = `spine:${letter}${i}`;
		const points = simplify(path.map((c) => grid.centre(c.col, c.row)));
		ctx.traces.push(
			makeTrace({
				id,
				kind: 'spine',
				side,
				bus: `spine:${letter}`,
				points,
				end: { kind: 'via' },
				chipId: null,
				triggerY: boundsOf(points).y
			})
		);
		outer = local;
		if (i === 0) source = { id, colAt: columnByRow(path, grid.rows) };
	}

	for (const plan of plans) {
		const chip = wiring[plan.chip];
		const busNumber = ++ctx.busCount;
		plan.pins.forEach((pin, i) => {
			const id = `${plan.bus}.${i}`;
			const points = source ? branchPoints(ctx, side, source.colAt, inner, pin, busNumber) : null;
			if (!points || !source) {
				chip.fallback = true;
				return;
			}
			ctx.traces.push(
				makeTrace({
					id,
					kind: 'branch',
					side,
					bus: plan.bus,
					points,
					end: { kind: 'pin', chipId: chip.id, pin: pin.index },
					chipId: chip.id,
					triggerY: points[0].y,
					parent: source.id
				})
			);
			chip.feeders.push(id);
		});
	}
	return outer - 2;
}

/** Diagonal cells of a branch: one less than the columns between the spine and the approach cell. */
function branchDiagonal(grid: Grid, side: Side, inner: number, pin: SidePin): number {
	return Math.max(1, localCol(grid, side, pin.cell.col) - inner - 1);
}

/** For every row, the column a spine path takes there; -1 for rows it doesn't reach. */
function columnByRow(path: readonly Cell[], rows: number): Int32Array {
	const out = new Int32Array(rows).fill(-1);
	for (const cell of walkCells(path)) {
		if (cell.row >= 0 && cell.row < rows && out[cell.row] === -1) out[cell.row] = cell.col;
	}
	return out;
}

/**
 * Routes one branch: from its junction on the spine, 45 degrees off it, then horizontally to the
 * pin. Marks it on the grid and returns its points, or null when it can't be built.
 */
function branchPoints(
	ctx: Context,
	side: Side,
	colAt: Int32Array,
	inner: number,
	pin: SidePin,
	bus: number
): Point[] | null {
	const { grid } = ctx;
	const goal = pin.cell;
	const row = goal.row - branchDiagonal(grid, side, inner, pin);
	if (row < 1 || row + 1 >= grid.rows) return null;
	// Leave the spine only where it runs straight down.
	const col = colAt[row];
	if (col < 0 || colAt[row - 1] !== col || colAt[row + 1] !== col) return null;
	const first = { col: col + (side === 'left' ? 1 : -1), row: row + 1 };
	if (!grid.inBounds(first.col, first.row)) return null;
	// The first cell touches the spine, so it lies in the spine's clearance: let the branch in.
	const index = grid.index(first.col, first.row);
	const state = grid.cells[index];
	if (state !== FREE && state !== CLEARANCE) return null;
	grid.cells[index] = FREE;
	const window: SearchWindow = {
		col0: side === 'left' ? first.col : goal.col - 1,
		col1: side === 'left' ? goal.col + 1 : first.col,
		row0: row,
		row1: goal.row + WINDOW_MARGIN
	};
	const path = route(grid, first, goal, {
		startDir: side === 'left' ? SOUTH_EAST : SOUTH_WEST,
		endDir: heading(side),
		bus,
		window
	});
	const corners = path ? [{ col, row }, ...path] : null;
	const points = corners ? simplify(corners.map((c) => grid.centre(c.col, c.row))) : null;
	if (!corners || !points || !snapEnd(points, pin.point, { x: 0, y: 1 }, boardRect(ctx))) {
		grid.cells[index] = state;
		return null;
	}
	grid.markPath(corners, bus);
	return points;
}

/** A spine of one trace at the screen edge, with horizontal branches straight into the pins. */
function edgeSpine(
	ctx: Context,
	setup: SideSetup,
	plans: readonly BranchPlan[],
	wiring: ChipWiring[],
	endRow: number
): void {
	const { grid } = ctx;
	const { side } = setup;
	const p = grid.pitch;
	const inset = Math.min(p / 2, setup.gutter / 2);
	const x = side === 'left' ? inset : ctx.width - inset;
	let row0 = ctx.heroRow;
	let row1 = endRow;
	for (const plan of plans) {
		for (const pin of plan.pins) {
			row0 = Math.min(row0, pin.cell.row - 1);
			row1 = Math.max(row1, pin.cell.row + 1);
		}
	}
	row0 = clamp(row0, 0, grid.rows - 1);
	row1 = clamp(row1, row0, grid.rows - 1);
	const col = clamp(Math.floor(x / p), 0, grid.cols - 1);
	grid.markPath(
		[
			{ col, row: row0 },
			{ col, row: row1 }
		],
		++ctx.busCount
	);
	const letter = side === 'left' ? 'L' : 'R';
	const id = `spine:${letter}0`;
	const top = row0 * p + p / 2;
	ctx.traces.push(
		makeTrace({
			id,
			kind: 'spine',
			side,
			bus: `spine:${letter}`,
			points: [
				{ x, y: top },
				{ x, y: row1 * p + p / 2 }
			],
			end: { kind: 'via' },
			chipId: null,
			triggerY: top
		})
	);
	for (const plan of plans) {
		const chip = wiring[plan.chip];
		plan.pins.forEach((pin, i) => {
			const reach = side === 'left' ? pin.point.x - x : x - pin.point.x;
			if (reach <= 0) {
				chip.fallback = true;
				return;
			}
			const branchId = `${plan.bus}.${i}`;
			ctx.traces.push(
				makeTrace({
					id: branchId,
					kind: 'branch',
					side,
					bus: plan.bus,
					points: [{ x, y: pin.point.y }, { ...pin.point }],
					end: { kind: 'pin', chipId: chip.id, pin: pin.index },
					chipId: chip.id,
					triggerY: pin.point.y,
					parent: id
				})
			);
			chip.feeders.push(branchId);
		});
	}
}

function boardRect(ctx: Context): Rect {
	return { x: 0, y: 0, width: ctx.width, height: ctx.grid.rows * ctx.grid.pitch };
}

/**
 * Moves the end of an octilinear polyline onto `target` without changing the heading of its last
 * run: the run shifts sideways onto the target and the corner before it slides along the segment
 * before that, or along `axis` when that corner is the first point (which must stay inside
 * `bounds`). Returns false, leaving the points alone, when the shape would break.
 */
function snapEnd(points: Point[], target: Point, axis: Point, bounds: Rect): boolean {
	const last = points.length - 1;
	if (last < 1) return false;
	const k = last - 1;
	const h = dirOf(points[last].x - points[k].x, points[last].y - points[k].y);
	if (h === -1) return false;
	const run = { x: DX[h], y: DY[h] };
	const base = k > 0 ? points[k - 1] : points[k];
	const along = k > 0 ? { x: points[k].x - base.x, y: points[k].y - base.y } : axis;
	const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
	const denominator = cross(run, along);
	if (Math.abs(denominator) < 1e-9) return false;
	// The corner lies on the line through the target along the run, and on the line before it.
	const t = cross({ x: base.x - target.x, y: base.y - target.y }, along) / denominator;
	if (!(t < -1e-6)) return false;
	const corner = { x: target.x + t * run.x, y: target.y + t * run.y };
	if (k > 0) {
		const before = dirOf(points[k].x - base.x, points[k].y - base.y);
		if (dirOf(corner.x - base.x, corner.y - base.y) !== before) return false;
	} else if (
		corner.x < bounds.x ||
		corner.x > bounds.x + bounds.width ||
		corner.y < bounds.y ||
		corner.y > bounds.y + bounds.height
	) {
		return false;
	}
	points[k] = corner;
	points[last] = { x: target.x, y: target.y };
	return true;
}

/** Completes a trace with its lengths and bounds. Handy for hand-built boards in tests. */
export function makeTrace(spec: Omit<Trace, 'lengths' | 'length' | 'bbox'>): Trace {
	const lengths = cumulativeLengths(spec.points);
	const trace: Trace = {
		...spec,
		lengths,
		length: lengths[lengths.length - 1] ?? 0,
		bbox: boundsOf(spec.points)
	};
	if (trace.parent === undefined) delete trace.parent;
	if (!trace.startVia) delete trace.startVia;
	return trace;
}

const EDGES = ['left', 'top', 'right', 'bottom'] as const;
type Edge = (typeof EDGES)[number];

/** Pointing from the socket out to each edge. */
const EDGE_VECTOR: Record<Edge, Point> = {
	left: { x: -1, y: 0 },
	top: { x: 0, y: -1 },
	right: { x: 1, y: 0 },
	bottom: { x: 0, y: 1 }
};
/** The heading of a trace as it leaves each edge. */
const EDGE_HEADING: Record<Edge, Dir> = { left: EAST, top: SOUTH, right: WEST, bottom: NORTH };
const EDGE_LETTER: Record<Edge, string> = { left: 'L', top: 'T', right: 'R', bottom: 'B' };

/** One way into a port: the approach cell outside the socket and the heading of the last run. */
interface Slot {
	order: number;
	port: number;
	point: Point;
	/** From the port out to the approach cell. */
	out: Dir;
	/** The heading of the last run into the port. */
	inward: Dir;
	/** The free cell where the routed part ends. */
	cell: Cell;
	/** Cells from the port's own cell up to the approach cell, not included. */
	leg: Cell[];
}

/** The side of the rect a port is nearest to, as the heading pointing out of it. */
function outwardNormal(rect: Rect, port: Point): Dir {
	const distances: [number, Dir][] = [
		[rect.y + rect.height - port.y, SOUTH],
		[port.y - rect.y, NORTH],
		[port.x - rect.x, WEST],
		[rect.x + rect.width - port.x, EAST]
	];
	let best = distances[0];
	for (const entry of distances) if (entry[0] < best[0]) best = entry;
	return best[1];
}

/**
 * The first free cell out from a port along `out`, past the socket's blocked cells, still inside
 * the hero; null when something else is in the way.
 */
function approachCell(ctx: Context, port: Point, out: Dir): { cell: Cell; leg: Cell[] } | null {
	const { grid } = ctx;
	const start = grid.cellAt(port);
	const leg: Cell[] = [start];
	for (let k = 1; k <= MAX_APPROACH; k++) {
		const cell = { col: start.col + DX[out] * k, row: start.row + DY[out] * k };
		if (!grid.inBounds(cell.col, cell.row) || cell.row >= ctx.heroRow) return null;
		const state = grid.get(cell.col, cell.row);
		if (state === FREE) return { cell, leg };
		if (state !== BLOCKED) return null;
		leg.push(cell);
	}
	return null;
}

/**
 * How well a way into a port faces an edge: 2 head on, 1 at 45 degrees, 0 square to it,
 * negative when it faces away.
 */
function facing(out: Dir, edge: Edge): number {
	const v = EDGE_VECTOR[edge];
	const dot = DX[out] * v.x + DY[out] * v.y;
	return out & 1 ? dot : 2 * dot;
}

/** Traces from all four hero edges into the socket's ports. See the file header. */
/**
 * With a hero: the two lead traces, one into each lead port (`socket.leads`), cyan into the port
 * left of the socket's centre, green into the other. Each comes in through the side of the socket
 * its port is nearest to, like a socket trace, from the window edge that side faces (the top, the
 * left or the right; a port on the bottom side takes the left or right edge).
 */
function leadTraces(ctx: Context, socket: SocketInput): void {
	const { grid } = ctx;
	if (ctx.heroRow < 2) return;
	const centre = socket.rect.x + socket.rect.width / 2;
	const leads = (socket.leads ?? []).filter((i) => socket.ports[i] !== undefined).slice(0, 2);
	const slots: { slot: Slot; edge: Edge; side: Side }[] = [];
	for (const port of leads) {
		const point = socket.ports[port];
		const normal = outwardNormal(socket.rect, point);
		for (const turn of [0, -1, 1]) {
			const out = ((normal + turn + 8) & 7) as Dir;
			const approach = approachCell(ctx, point, out);
			if (!approach) continue;
			const side: Side = point.x < centre ? 'left' : 'right';
			const slot = { order: port, port, point, out, inward: ((out + 4) & 7) as Dir, ...approach };
			// Straight in from the edge the port faces, so the lead cuts across the field's band
			// instead of running along it; from below the text is in the way, so from the side.
			const edge: Edge =
				out === NORTH ? 'top' : out === EAST ? 'right' : out === WEST ? 'left' : side;
			slots.push({ slot, edge, side });
			break;
		}
	}
	// Reserve both last runs first, so neither route squeezes in next to the other.
	for (const { slot } of slots) grid.markPath([slot.leg[0], slot.leg[slot.leg.length - 1]]);
	slots.forEach(({ slot, edge, side }, k) => {
		const bus = ++ctx.busCount;
		const rng = () => createRng(deriveSeed(ctx.seed, `lead:${k}`));
		const trace = routeSocket(ctx, edge, slot, rng()) ?? routeSocket(ctx, edge, slot, rng(), true);
		if (!trace) return;
		grid.markPath(trace.path, bus);
		ctx.traces.push(
			makeTrace({
				id: `socket:${EDGE_LETTER[edge]}${k}`,
				kind: 'socket',
				side,
				bus: `socket:lead`,
				points: trace.points,
				end: { kind: 'port', port: slot.port },
				chipId: null,
				triggerY: boundsOf(trace.points).y
			})
		);
	});
}

function socketTraces(ctx: Context, socket: SocketInput): void {
	const { grid } = ctx;
	if (ctx.heroRow < 2) return;
	const slots: Slot[] = [];
	socket.ports.forEach((point, port) => {
		const normal = outwardNormal(socket.rect, point);
		for (const turn of [0, -1, 1]) {
			const out = ((normal + turn + 8) & 7) as Dir;
			const approach = approachCell(ctx, point, out);
			if (!approach) continue;
			slots.push({
				order: slots.length,
				port,
				point,
				out,
				inward: ((out + 4) & 7) as Dir,
				...approach
			});
		}
	});

	// Share the slots out over the edges, a round at a time, best facing first.
	const distanceTo = (slot: Slot, edge: Edge) =>
		edge === 'left'
			? slot.point.x
			: edge === 'right'
				? ctx.width - slot.point.x
				: edge === 'top'
					? slot.point.y
					: ctx.heroBottom - slot.point.y;
	const rng = createRng(deriveSeed(ctx.seed, 'socket'));
	const want = Object.fromEntries(
		EDGES.map((edge) => [edge, rng.int(SOCKET_BUS_MIN, SOCKET_BUS_MAX)])
	) as Record<Edge, number>;
	const assigned: Record<Edge, Slot[]> = { left: [], top: [], right: [], bottom: [] };
	const perPort = new Array<number>(socket.ports.length).fill(0);
	const taken = new Set<number>();
	for (let round = 0; round < SOCKET_BUS_MAX; round++) {
		for (const edge of EDGES) {
			if (assigned[edge].length >= want[edge]) continue;
			let best: Slot | null = null;
			for (const slot of slots) {
				if (taken.has(slot.order) || facing(slot.out, edge) < 0) continue;
				if (
					!best ||
					facing(slot.out, edge) > facing(best.out, edge) ||
					(facing(slot.out, edge) === facing(best.out, edge) &&
						(perPort[slot.port] < perPort[best.port] ||
							(perPort[slot.port] === perPort[best.port] &&
								distanceTo(slot, edge) < distanceTo(best, edge))))
				) {
					best = slot;
				}
			}
			if (!best) continue;
			taken.add(best.order);
			perPort[best.port]++;
			assigned[edge].push(best);
		}
	}

	// Reserve every last run first, so no route squeezes in next to one.
	for (const edge of EDGES) {
		for (const slot of assigned[edge]) grid.markPath([slot.leg[0], slot.leg[slot.leg.length - 1]]);
	}

	const centre = socket.rect.x + socket.rect.width / 2;
	for (const edge of EDGES) {
		const bus = ++ctx.busCount;
		assigned[edge].forEach((slot, k) => {
			const trace = routeSocket(
				ctx,
				edge,
				slot,
				createRng(deriveSeed(ctx.seed, `socket:${edge}:${k}`))
			);
			if (!trace) return;
			grid.markPath(trace.path, bus);
			const side: Side =
				edge === 'left' || edge === 'right' ? edge : slot.point.x < centre ? 'left' : 'right';
			ctx.traces.push(
				makeTrace({
					id: `socket:${EDGE_LETTER[edge]}${k}`,
					kind: 'socket',
					side,
					bus: `socket:${EDGE_LETTER[edge]}`,
					points: trace.points,
					end: { kind: 'port', port: slot.port },
					chipId: null,
					triggerY: boundsOf(trace.points).y
				})
			);
		});
	}
}

/**
 * Routes one socket trace from its edge to its slot's approach cell, then on to the port. The start
 * sits off the approach cell along the edge, so the trace turns into its last run at 45 degrees.
 */
function routeSocket(
	ctx: Context,
	edge: Edge,
	slot: Slot,
	rng: Rng,
	/** Let the last run come in at 45 degrees too: for a lead that has to squeeze in. */
	slanted = false
): { path: Cell[]; points: Point[] } | null {
	const { grid } = ctx;
	const goal = slot.cell;
	const lastRow = ctx.heroRow - 1;
	const leave = EDGE_HEADING[edge];
	const vertical = edge === 'left' || edge === 'right';
	const fixed =
		edge === 'left' ? 0 : edge === 'right' ? grid.cols - 1 : edge === 'top' ? 0 : lastRow;
	const span = vertical ? lastRow : grid.cols - 1;
	const offset = slot.inward === leave ? 0 : rng.int(2, 6);
	const base =
		(vertical ? goal.row : goal.col) - (vertical ? DY[slot.inward] : DX[slot.inward]) * offset;

	// The approach cell touches the reserved last run, so it lies in its clearance: let the route in.
	const index = grid.index(goal.col, goal.row);
	const state = grid.cells[index];
	if (state !== FREE && state !== CLEARANCE) return null;
	grid.cells[index] = FREE;
	const window: SearchWindow = { col0: 0, col1: grid.cols - 1, row0: 0, row1: lastRow };
	const axis = vertical ? { x: 0, y: 1 } : { x: 1, y: 0 };
	const bounds = vertical
		? { x: 0, y: 0, width: ctx.width, height: ctx.heroBottom }
		: boardRect(ctx);
	for (const shift of START_SHIFTS) {
		const along = base + shift;
		if (along < 0 || along > span) continue;
		const start = vertical ? { col: fixed, row: along } : { col: along, row: fixed };
		if (!grid.isFree(start.col, start.row)) continue;
		const endDir = slanted
			? [slot.inward, ((slot.inward + 1) & 7) as Dir, ((slot.inward + 7) & 7) as Dir]
			: slot.inward;
		const path = route(grid, start, goal, { startDir: leave, endDir, window });
		if (!path) continue;
		const centres = path.map((c) => grid.centre(c.col, c.row));
		const first = centres[0];
		const onEdge =
			edge === 'left'
				? { x: 0, y: first.y }
				: edge === 'right'
					? { x: ctx.width, y: first.y }
					: edge === 'top'
						? { x: first.x, y: 0 }
						: { x: first.x, y: ctx.heroBottom };
		const points = simplify([onEdge, ...centres]);
		if (!snapEnd(points, slot.point, axis, bounds)) continue;
		// Keep the start exactly on its edge.
		if (edge === 'left') points[0].x = 0;
		else if (edge === 'right') points[0].x = ctx.width;
		else if (edge === 'top') points[0].y = 0;
		else points[0].y = ctx.heroBottom;
		return { path, points };
	}
	grid.cells[index] = state;
	return null;
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
	const centres = path.map((c) => grid.centre(c.col, c.row));
	const points = simplify([{ x: side === 'left' ? 0 : ctx.width, y: centres[0].y }, ...centres]);
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

/**
 * Decorative buses in one gutter, from `rowStart` down, one per band of `DECOR_AREA / gutter` px.
 * They reach at most `maxCol` columns in from the edge, which keeps them outside the spine.
 */
function gutterDecor(
	ctx: Context,
	setup: SideSetup,
	maxCol: number,
	rowStart: number,
	height: number
): void {
	const { grid } = ctx;
	const { side, gutter } = setup;
	const p = grid.pitch;
	if (maxCol < 2 || gutter <= 0) return;
	const band = Math.max(8 * p, DECOR_AREA / gutter);
	const top = rowStart * p;
	const bands = Math.floor((height - top) / band);
	const edge = edgeCol(grid, side);
	for (let b = 0; b < bands; b++) {
		const rng = createRng(deriveSeed(ctx.seed, `decor:${side}:${b}`));
		const n = rng.int(BUS_MIN, Math.max(BUS_MIN, Math.min(4, Math.floor(maxCol / 2))));
		const s0 = Math.floor((top + b * band + rng.range(0, band)) / p);
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
			const target = { col: targetCol, row: Math.max(rowStart, s0 + 2 * i + drop) };
			addDecor(ctx, side, `${busId}.${i}`, busId, bus, start, target, {
				col0: Math.min(edge, targetCol) - 1,
				col1: Math.max(edge, targetCol) + 1,
				row0: Math.max(rowStart, Math.min(start.row, target.row) - WINDOW_MARGIN),
				row1: Math.max(start.row, target.row) + WINDOW_MARGIN
			});
		}
	}
}
