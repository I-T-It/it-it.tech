import { describe, expect, it } from 'vitest';
import {
	isOctilinear,
	nearestOnPolyline,
	pointAt,
	rectContains,
	type Point,
	type Rect
} from './geometry.js';
import { PITCH } from './grid.js';
import {
	layoutBoard,
	type Board,
	type ChipInput,
	type LayoutInput,
	type SocketInput,
	type Trace
} from './layout.js';

const PIN_PITCH = 48;
const STUB = 4;

/** Pins every 48 px down both sides, sticking out 4 px, left ones first (DOM order). */
function pinsFor(rect: Rect): Point[] {
	const count = Math.max(2, Math.floor(rect.height / PIN_PITCH));
	const left: Point[] = [];
	const right: Point[] = [];
	for (let k = 0; k < count; k++) {
		const y = rect.y + 24 + k * PIN_PITCH;
		left.push({ x: rect.x - STUB, y });
		right.push({ x: rect.x + rect.width + STUB, y });
	}
	return [...left, ...right];
}

const WEIGHTS = [1, 1, 1.2, 1.4, 4, 1.6, 1.3, 1, 0.8];
const GAP = 64;
const FOOTER = 240;

/** The hero is one viewport high: 900 px on a desktop, 640 px on a phone. */
function heroHeight(width: number): number {
	return width >= 768 ? 900 : 640;
}

function padOf(width: number): number {
	return width >= 1184 ? (width - 1152) / 2 : 16;
}

/**
 * The company socket: the logo (1000 x 428) centred in the hero, with its two open trace ends as
 * ports, where `itit_svg_color.svg` has them.
 */
function logoSocket(width: number): SocketInput {
	const pad = padOf(width);
	const colW = width - 2 * pad;
	const w = Math.min(600, colW - 48);
	const h = w * 0.428;
	const rect = { x: pad + (colW - w) / 2, y: (heroHeight(width) - h) / 2, width: w, height: h };
	return {
		rect,
		ports: [
			{ x: rect.x + 0.2365 * w, y: rect.y + 0.8343 * h },
			{ x: rect.x + 0.5826 * w, y: rect.y + 0.1636 * h }
		]
	};
}

/** The personal socket: a square photo frame with three footprint pads on every side. */
function photoSocket(width: number): SocketInput {
	const pad = padOf(width);
	const colW = width - 2 * pad;
	const s = Math.min(360, colW - 48);
	const rect = { x: pad + (colW - s) / 2, y: (heroHeight(width) - s) / 2, width: s, height: s };
	const ports: Point[] = [];
	for (let i = 1; i <= 3; i++) {
		const t = (i * s) / 4;
		ports.push({ x: rect.x + t, y: rect.y });
		ports.push({ x: rect.x + s, y: rect.y + t });
		ports.push({ x: rect.x + t, y: rect.y + s });
		ports.push({ x: rect.x, y: rect.y + t });
	}
	return { rect, ports };
}

/**
 * A page like the real one: a full-viewport hero with the socket, then nine stacked chips in a
 * centred column of at most 1152 px (16 px padding on narrow screens), then a footer.
 */
function page(width: number, height: number, overrides: Partial<LayoutInput> = {}): LayoutInput {
	const pad = padOf(width);
	const colW = width - 2 * pad;
	const hero = heroHeight(width);
	const total = WEIGHTS.reduce((a, b) => a + b, 0);
	const room = height - hero - FOOTER - GAP * (WEIGHTS.length - 1);
	const chips: ChipInput[] = [];
	let y = hero;
	WEIGHTS.forEach((weight, i) => {
		const rect = { x: pad, y, width: colW, height: Math.round((room * weight) / total) };
		chips.push({ id: `u${i + 1}`, side: 'both', rect, pins: pinsFor(rect) });
		y += rect.height + GAP;
	});
	return { width, height, chips, socket: logoSocket(width), ...overrides };
}

function ofKind(board: Board, kind: Trace['kind']): Trace[] {
	return board.traces.filter((t) => t.kind === kind);
}

function branchesOf(board: Board, chipId: string, side: 'left' | 'right'): Trace[] {
	return board.traces.filter((t) => t.kind === 'branch' && t.chipId === chipId && t.side === side);
}

/** Points every `step` px along a trace, from `from` px on. */
function samples(trace: Trace, step = 3, from = 0): Point[] {
	const out: Point[] = [];
	for (let along = from; along < trace.length; along += step) {
		out.push(pointAt(trace.points, trace.lengths, along));
	}
	out.push(trace.points[trace.points.length - 1]);
	return out;
}

/** Samples up to the last run, which is the only part of a socket trace inside the socket. */
function beforeLastRun(trace: Trace, step = 3): Point[] {
	const end = trace.lengths[trace.lengths.length - 2] ?? 0;
	const out: Point[] = [];
	for (let along = 0; along < end; along += step) {
		out.push(pointAt(trace.points, trace.lengths, along));
	}
	return out;
}

/** True when the point lies strictly inside the rect. */
function inside(rect: Rect, p: Point): boolean {
	return p.x > rect.x && p.x < rect.x + rect.width && p.y > rect.y && p.y < rect.y + rect.height;
}

type Edge = 'left' | 'right' | 'top' | 'bottom';

/** The board edge a point lies on, or null. */
function edgeOf(board: Board, p: Point): Edge | null {
	if (p.x === 0) return 'left';
	if (p.x === board.width) return 'right';
	if (p.y === 0) return 'top';
	if (p.y === board.heroBottom) return 'bottom';
	return null;
}

/** The closest distance between two different traces, skipping a branch and its own spine. */
function closestGap(board: Board): number {
	const bucket = 24;
	const buckets = new Map<string, { p: Point; trace: number }[]>();
	board.traces.forEach((trace, index) => {
		const points = trace.kind === 'socket' ? beforeLastRun(trace, 4) : samples(trace, 4);
		for (const p of points) {
			const key = `${Math.floor(p.x / bucket)},${Math.floor(p.y / bucket)}`;
			const list = buckets.get(key) ?? [];
			list.push({ p, trace: index });
			buckets.set(key, list);
		}
	});
	const related = (a: Trace, b: Trace) => a.parent === b.id || b.parent === a.id;
	let closest = Infinity;
	for (const [key, list] of buckets) {
		const [bx, by] = key.split(',').map(Number);
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				for (const other of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
					for (const own of list) {
						if (own.trace === other.trace) continue;
						if (related(board.traces[own.trace], board.traces[other.trace])) continue;
						closest = Math.min(closest, Math.hypot(own.p.x - other.p.x, own.p.y - other.p.y));
					}
				}
			}
		}
	}
	return closest;
}

describe('layoutBoard on a desktop page', () => {
	const input = page(1440, 8000);
	const board = layoutBoard(input);
	const first = input.chips[0].rect;
	const last = input.chips.at(-1)!.rect;
	const contentLeft = first.x;
	const contentRight = first.x + first.width;

	it('puts the hero bottom just above the first chip', () => {
		expect(board.narrow).toBe(false);
		expect(board.heroBottom).toBeLessThanOrEqual(first.y - PITCH);
		expect(board.heroBottom).toBeGreaterThan(first.y - 3 * PITCH);
		expect(board.heroBottom % PITCH).toBe(0);
	});

	it('runs a spine of 2 to 3 traces down each gutter, from the hero bottom to the last chip', () => {
		for (const side of ['left', 'right'] as const) {
			const spine = ofKind(board, 'spine').filter((t) => t.side === side);
			expect(spine.length).toBeGreaterThanOrEqual(2);
			expect(spine.length).toBeLessThanOrEqual(3);
			for (const trace of spine) {
				expect(trace.chipId).toBeNull();
				expect(trace.end.kind).toBe('via');
				expect(trace.points[0].y).toBeLessThanOrEqual(first.y);
				expect(trace.points[0].y).toBeGreaterThan(board.heroBottom - 4 * PITCH);
				expect(trace.points.at(-1)!.y).toBeGreaterThanOrEqual(last.y + last.height - PITCH);
				for (let i = 1; i < trace.points.length; i++) {
					expect(trace.points[i].y).toBeGreaterThanOrEqual(trace.points[i - 1].y);
				}
				for (const p of trace.points) {
					if (side === 'left') expect(p.x).toBeLessThan(contentLeft);
					else expect(p.x).toBeGreaterThan(contentRight);
				}
			}
		}
	});

	it('wires every chip with a bus of branches on both sides', () => {
		for (const chip of input.chips) {
			for (const side of ['left', 'right'] as const) {
				expect(branchesOf(board, chip.id, side).length).toBeGreaterThanOrEqual(2);
			}
			const wiring = board.chips.find((c) => c.id === chip.id)!;
			expect(wiring.fallback).toBe(false);
			expect(wiring.top).toBe(chip.rect.y);
			expect(wiring.feeders.sort()).toEqual(
				board.traces
					.filter((t) => t.kind === 'branch' && t.chipId === chip.id)
					.map((t) => t.id)
					.sort()
			);
		}
	});

	it('starts every branch on the innermost spine trace of its side', () => {
		for (const branch of ofKind(board, 'branch')) {
			const parent = board.traces.find((t) => t.id === branch.parent)!;
			expect(parent.kind).toBe('spine');
			expect(parent.side).toBe(branch.side);
			const xs = ofKind(board, 'spine')
				.filter((t) => t.side === branch.side)
				.map((t) => t.points[0].x);
			const innermost = branch.side === 'left' ? Math.max(...xs) : Math.min(...xs);
			expect(parent.points[0].x).toBe(innermost);
			const start = branch.points[0];
			expect(nearestOnPolyline(parent.points, parent.lengths, start).distance).toBeLessThan(1e-6);
			expect(branch.triggerY).toBe(start.y);
		}
	});

	it('ends every branch exactly on its pin, coming in from its own side', () => {
		for (const trace of ofKind(board, 'branch')) {
			const chip = input.chips.find((c) => c.id === trace.chipId)!;
			expect(trace.end.kind).toBe('pin');
			if (trace.end.kind !== 'pin') continue;
			expect(trace.end.chipId).toBe(chip.id);
			const pin = chip.pins[trace.end.pin];
			expect(trace.points.at(-1)).toEqual(pin);
			const onLeft = pin.x < chip.rect.x + chip.rect.width / 2;
			expect(trace.side).toBe(onLeft ? 'left' : 'right');
		}
	});

	it('groups branches in buses of 2 to 5', () => {
		const buses = new Map<string, number>();
		for (const t of ofKind(board, 'branch')) buses.set(t.bus, (buses.get(t.bus) ?? 0) + 1);
		expect(buses.size).toBeGreaterThan(input.chips.length);
		for (const size of buses.values()) {
			expect(size).toBeGreaterThanOrEqual(2);
			expect(size).toBeLessThanOrEqual(5);
		}
	});

	it('has no edge feeders any more', () => {
		const kinds = new Set(board.traces.map((t) => t.kind));
		expect([...kinds].sort()).toEqual(['branch', 'decor', 'socket', 'spine']);
	});

	it('bends at 45 degrees only', () => {
		for (const trace of board.traces) expect(isOctilinear(trace.points), trace.id).toBe(true);
	});

	it('fills the outer gutters with decorative traces that start at the edge and end in vias', () => {
		const decor = ofKind(board, 'decor');
		expect(decor.length).toBeGreaterThan(20);
		for (const side of ['left', 'right'] as const) {
			const spineXs = ofKind(board, 'spine')
				.filter((t) => t.side === side)
				.map((t) => t.points[0].x);
			for (const trace of decor.filter((t) => t.side === side)) {
				expect(trace.end.kind).toBe('via');
				expect(trace.chipId).toBeNull();
				expect(trace.points[0].x).toBe(side === 'left' ? 0 : input.width);
				expect(trace.bbox.y).toBeGreaterThanOrEqual(board.heroBottom);
				for (const p of trace.points) {
					if (side === 'left') expect(p.x).toBeLessThan(Math.min(...spineXs));
					else expect(p.x).toBeGreaterThan(Math.max(...spineXs));
				}
			}
		}
	});

	it('keeps every trace out of chips and obstacles, and socket traces out of the socket', () => {
		const rects = [...input.chips.map((c) => c.rect), ...(input.obstacles ?? [])];
		for (const trace of board.traces) {
			const points = trace.kind === 'socket' ? beforeLastRun(trace) : samples(trace);
			for (const p of points) {
				for (const rect of rects) expect(inside(rect, p), trace.id).toBe(false);
				expect(inside(input.socket!.rect, p), trace.id).toBe(false);
			}
		}
	});

	it('keeps traces at least a cell apart', () => {
		expect(closestGap(board)).toBeGreaterThanOrEqual(12);
	});

	it('triggers branches at their junction and other latched traces at their own top', () => {
		for (const trace of board.traces) {
			if (trace.kind === 'branch') expect(trace.triggerY).toBe(trace.points[0].y);
			else expect(trace.triggerY).toBe(trace.bbox.y);
		}
	});

	it('measures every trace', () => {
		for (const trace of board.traces) {
			expect(trace.lengths).toHaveLength(trace.points.length);
			expect(trace.length).toBeCloseTo(trace.lengths.at(-1)!);
			expect(trace.length).toBeGreaterThan(0);
			for (const p of trace.points) expect(rectContains(trace.bbox, p)).toBe(true);
		}
	});

	it('gives every trace a unique id', () => {
		const ids = board.traces.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('is deterministic', () => {
		expect(layoutBoard(page(1440, 8000))).toEqual(board);
	});

	it('lays out 1440 x 8000 in under 200 ms', () => {
		layoutBoard(page(1440, 8000, { seed: 1 }));
		const start = performance.now();
		layoutBoard(page(1440, 8000, { seed: 2 }));
		expect(performance.now() - start).toBeLessThan(200);
	});
});

describe('layoutBoard socket traces', () => {
	const cases = [
		{ name: 'the logo at 1440 px', width: 1440, socket: logoSocket(1440) },
		{ name: 'the photo at 1440 px', width: 1440, socket: photoSocket(1440) },
		{ name: 'the logo at 360 px', width: 360, socket: logoSocket(360) },
		{ name: 'the photo at 360 px', width: 360, socket: photoSocket(360) },
		{ name: 'the logo at 1920 px', width: 1920, socket: logoSocket(1920) }
	];

	for (const { name, width, socket } of cases) {
		describe(name, () => {
			const input = page(width, 8000, { socket });
			const board = layoutBoard(input);
			const traces = ofKind(board, 'socket');

			it('starts socket traces on all four edges of the hero', () => {
				const edges = new Set(traces.map((t) => edgeOf(board, t.points[0])));
				expect([...edges].sort()).toEqual(['bottom', 'left', 'right', 'top']);
				for (const trace of traces) {
					for (const p of trace.points) expect(p.y).toBeLessThanOrEqual(board.heroBottom);
				}
			});

			it('ends every socket trace exactly on a port', () => {
				expect(traces.length).toBeGreaterThanOrEqual(4);
				for (const trace of traces) {
					expect(trace.end.kind).toBe('port');
					if (trace.end.kind !== 'port') continue;
					expect(trace.points.at(-1)).toEqual(socket.ports[trace.end.port]);
					expect(trace.chipId).toBeNull();
				}
			});

			it('colours traces from the left cyan and traces from the right green', () => {
				for (const trace of traces) {
					const edge = edgeOf(board, trace.points[0]);
					if (edge === 'left') expect(trace.side).toBe('left');
					if (edge === 'right') expect(trace.side).toBe('right');
				}
			});

			it('enters the socket only on the last run', () => {
				for (const trace of traces) {
					expect(inside(socket.rect, trace.points.at(-2)!), trace.id).toBe(false);
					for (const p of beforeLastRun(trace)) {
						expect(inside(socket.rect, p), trace.id).toBe(false);
					}
				}
			});

			it('bends at 45 degrees only and keeps a cell apart', () => {
				for (const trace of board.traces) expect(isOctilinear(trace.points), trace.id).toBe(true);
				expect(closestGap(board)).toBeGreaterThanOrEqual(12);
			});
		});
	}

	it('connects the logo with traces into both ports', () => {
		const board = layoutBoard(page(1440, 8000));
		const ports = new Set(
			ofKind(board, 'socket').map((t) => (t.end.kind === 'port' ? t.end.port : -1))
		);
		expect([...ports].sort()).toEqual([0, 1]);
	});

	it('builds no socket traces without a socket', () => {
		const board = layoutBoard(page(1440, 8000, { socket: undefined }));
		expect(ofKind(board, 'socket')).toHaveLength(0);
		expect(ofKind(board, 'spine').length).toBeGreaterThan(0);
	});
});

describe('layoutBoard choices', () => {
	it('seeds from the viewport-width bucket', () => {
		const a = layoutBoard(page(1440, 4000));
		expect(a.seed).toBe(layoutBoard(page(1440, 4000, { viewportWidth: 1455 })).seed);
		expect(a.seed).not.toBe(layoutBoard(page(1440, 4000, { viewportWidth: 1600 })).seed);
	});

	it('only wires the sides a chip asks for', () => {
		const input = page(1440, 4000);
		input.chips = input.chips.map((chip, i) => ({ ...chip, side: i % 2 ? 'left' : 'right' }));
		const board = layoutBoard(input);
		input.chips.forEach((chip, i) => {
			const own = i % 2 ? 'left' : 'right';
			const other = i % 2 ? 'right' : 'left';
			expect(branchesOf(board, chip.id, own).length).toBeGreaterThan(0);
			expect(branchesOf(board, chip.id, other)).toHaveLength(0);
		});
	});

	it('adds decorative traces with the gutter area', () => {
		const decor = (b: Board) => ofKind(b, 'decor').length;
		expect(decor(layoutBoard(page(1920, 6000)))).toBeGreaterThan(
			decor(layoutBoard(page(1440, 6000)))
		);
	});

	it('ends the spine at a wall across the gutter and flags the chips below it', () => {
		const input = page(1440, 4000);
		const target = input.chips[3];
		const wall = { x: 0, y: target.rect.y - 40, width: target.rect.x - 30, height: 12 };
		const board = layoutBoard({ ...input, obstacles: [wall] });
		for (const trace of ofKind(board, 'spine').filter((t) => t.side === 'left')) {
			expect(trace.points.at(-1)!.y).toBeLessThan(wall.y);
			expect(isOctilinear(trace.points)).toBe(true);
		}
		const wiring = board.chips.find((c) => c.id === target.id)!;
		expect(wiring.fallback).toBe(true);
		expect(branchesOf(board, target.id, 'left')).toHaveLength(0);
		expect(branchesOf(board, target.id, 'right').length).toBeGreaterThan(0);
		expect(branchesOf(board, input.chips[0].id, 'left').length).toBeGreaterThan(0);
		expect(board.chips[0].fallback).toBe(false);
	});

	it('wires only the side with room when a wall covers the pins of the other', () => {
		const input = page(1920, 4000);
		const target = input.chips[3];
		const wall = {
			x: target.rect.x - 24,
			y: target.rect.y - 1200,
			width: 12,
			height: target.rect.height + 2400
		};
		const board = layoutBoard({ ...input, obstacles: [wall] });
		expect(branchesOf(board, target.id, 'left')).toHaveLength(0);
		expect(branchesOf(board, target.id, 'right').length).toBeGreaterThan(0);
		for (const trace of board.traces) expect(isOctilinear(trace.points)).toBe(true);
	});

	it('flags a chip that has no room for any branch', () => {
		const input = page(1440, 4000);
		const target = input.chips[2];
		const blocker = { x: 0, y: target.rect.y - 200, width: 1440, height: target.rect.height + 400 };
		const board = layoutBoard({ ...input, obstacles: [blocker] });
		const wiring = board.chips.find((c) => c.id === target.id)!;
		expect(wiring.feeders).toHaveLength(0);
		expect(wiring.fallback).toBe(true);
		// The chips above the blocker still get their branches.
		expect(board.chips.find((c) => c.id === input.chips[0].id)!.fallback).toBe(false);
	});

	it('handles an empty page', () => {
		const board = layoutBoard({ width: 800, height: 600, chips: [] });
		expect(board.chips).toEqual([]);
		expect(board.heroBottom).toBeLessThanOrEqual(600);
		for (const trace of board.traces) expect(isOctilinear(trace.points)).toBe(true);
	});
});

describe('layoutBoard at 360 px', () => {
	const input = page(360, 12000);
	const board = layoutBoard(input);
	const desktop = layoutBoard(page(1440, 12000));
	const first = input.chips[0].rect;

	it('switches to narrow mode with fewer traces', () => {
		expect(board.narrow).toBe(true);
		expect(board.traces.length).toBeGreaterThan(0);
		expect(board.traces.length).toBeLessThan(desktop.traces.length / 2);
	});

	it('runs a spine of one trace per side at the screen edge', () => {
		const spine = ofKind(board, 'spine');
		expect(spine.map((t) => t.side).sort()).toEqual(['left', 'right']);
		for (const trace of spine) {
			const x = trace.points[0].x;
			for (const p of trace.points) expect(p.x).toBe(x);
			if (trace.side === 'left') expect(x).toBeLessThan(first.x - STUB);
			else expect(x).toBeGreaterThan(first.x + first.width + STUB);
			expect(trace.points[0].y).toBeLessThanOrEqual(first.y);
		}
	});

	it('keeps traces below the hero out of the content column', () => {
		const left = first.x;
		const right = first.x + first.width;
		for (const trace of board.traces.filter((t) => t.kind !== 'socket')) {
			for (const p of samples(trace)) expect(p.x > left && p.x < right, trace.id).toBe(false);
		}
	});

	it('still gives every chip a branch on each side', () => {
		for (const chip of board.chips) {
			for (const side of ['left', 'right'] as const) {
				expect(branchesOf(board, chip.id, side).length).toBeGreaterThanOrEqual(1);
			}
			expect(chip.fallback).toBe(false);
		}
		for (const branch of ofKind(board, 'branch')) {
			const parent = board.traces.find((t) => t.id === branch.parent)!;
			expect(parent.kind).toBe('spine');
			expect(branch.points[0].x).toBe(parent.points[0].x);
		}
	});

	it('bends at 45 degrees only', () => {
		for (const trace of board.traces) expect(isOctilinear(trace.points), trace.id).toBe(true);
	});

	it('is deterministic', () => {
		expect(layoutBoard(page(360, 12000))).toEqual(board);
	});
});
