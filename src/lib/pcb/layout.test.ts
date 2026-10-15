import { describe, expect, it } from 'vitest';
import { isOctilinear, pointAt, rectContains, type Point, type Rect } from './geometry.js';
import { layoutBoard, type Board, type ChipInput, type LayoutInput, type Trace } from './layout.js';

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
const HERO = 640;
const FOOTER = 240;

/**
 * A page like the real one: a hero with a photo obstacle, then nine stacked chips in a centred
 * column of at most 1152 px (16 px padding on narrow screens), then a footer.
 */
function page(width: number, height: number, overrides: Partial<LayoutInput> = {}): LayoutInput {
	const pad = width >= 1184 ? (width - 1152) / 2 : 16;
	const colW = width - 2 * pad;
	const total = WEIGHTS.reduce((a, b) => a + b, 0);
	const room = height - HERO - FOOTER - GAP * (WEIGHTS.length - 1);
	const chips: ChipInput[] = [];
	let y = HERO;
	WEIGHTS.forEach((weight, i) => {
		const rect = { x: pad, y, width: colW, height: Math.round((room * weight) / total) };
		chips.push({ id: `u${i + 1}`, side: 'both', rect, pins: pinsFor(rect) });
		y += rect.height + GAP;
	});
	return {
		width,
		height,
		chips,
		obstacles: [{ x: pad + 24, y: 120, width: Math.min(360, colW - 48), height: 360 }],
		...overrides
	};
}

function feedersOf(board: Board, chipId: string, side: 'left' | 'right'): Trace[] {
	return board.traces.filter((t) => t.kind === 'feeder' && t.chipId === chipId && t.side === side);
}

/** Points every `step` px along every trace. */
function samples(trace: Trace, step = 3): Point[] {
	const out: Point[] = [];
	for (let along = 0; along < trace.length; along += step) {
		out.push(pointAt(trace.points, trace.lengths, along));
	}
	out.push(trace.points[trace.points.length - 1]);
	return out;
}

/** True when the point lies strictly inside the rect. */
function inside(rect: Rect, p: Point): boolean {
	return p.x > rect.x && p.x < rect.x + rect.width && p.y > rect.y && p.y < rect.y + rect.height;
}

describe('layoutBoard on a desktop page', () => {
	const input = page(1440, 8000);
	const board = layoutBoard(input);

	it('wires every chip with a feeder bus on both sides', () => {
		expect(board.narrow).toBe(false);
		for (const chip of input.chips) {
			for (const side of ['left', 'right'] as const) {
				const feeders = feedersOf(board, chip.id, side);
				expect(feeders.length).toBeGreaterThanOrEqual(2);
			}
			const wiring = board.chips.find((c) => c.id === chip.id)!;
			expect(wiring.fallback).toBe(false);
			expect(wiring.top).toBe(chip.rect.y);
			expect(wiring.feeders.sort()).toEqual(
				board.traces
					.filter((t) => t.kind === 'feeder' && t.chipId === chip.id)
					.map((t) => t.id)
					.sort()
			);
		}
	});

	it('ends every feeder exactly on its pin, coming in from its own side', () => {
		for (const trace of board.traces.filter((t) => t.kind === 'feeder')) {
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

	it('groups feeders in buses of 2 to 5', () => {
		const buses = new Map<string, number>();
		for (const t of board.traces.filter((t) => t.kind === 'feeder')) {
			buses.set(t.bus, (buses.get(t.bus) ?? 0) + 1);
		}
		expect(buses.size).toBeGreaterThan(input.chips.length);
		for (const size of buses.values()) {
			expect(size).toBeGreaterThanOrEqual(2);
			expect(size).toBeLessThanOrEqual(5);
		}
	});

	it('starts left traces at the left edge and right traces at the right edge', () => {
		for (const trace of board.traces) {
			expect(trace.points[0].x).toBe(trace.side === 'left' ? 0 : input.width);
		}
		expect(board.traces.some((t) => t.side === 'left')).toBe(true);
		expect(board.traces.some((t) => t.side === 'right')).toBe(true);
	});

	it('bends at 45 degrees only', () => {
		for (const trace of board.traces) expect(isOctilinear(trace.points), trace.id).toBe(true);
	});

	it('fills the gutters with decorative traces that end in vias', () => {
		const decor = board.traces.filter((t) => t.kind === 'decor');
		expect(decor.length).toBeGreaterThan(20);
		for (const trace of decor) {
			expect(trace.end.kind).toBe('via');
			expect(trace.chipId).toBeNull();
			const end = trace.points.at(-1)!;
			expect(end.x < input.chips[0].rect.x || end.x > input.width - input.chips[0].rect.x).toBe(
				true
			);
		}
	});

	it('keeps every trace out of chips and obstacles', () => {
		const rects = [...input.chips.map((c) => c.rect), ...(input.obstacles ?? [])];
		for (const trace of board.traces) {
			for (const p of samples(trace)) {
				for (const rect of rects) expect(inside(rect, p), trace.id).toBe(false);
			}
		}
	});

	it('keeps traces at least a cell apart', () => {
		const bucket = 24;
		const buckets = new Map<string, { p: Point; trace: number }[]>();
		board.traces.forEach((trace, index) => {
			for (const p of samples(trace, 4)) {
				const key = `${Math.floor(p.x / bucket)},${Math.floor(p.y / bucket)}`;
				const list = buckets.get(key) ?? [];
				list.push({ p, trace: index });
				buckets.set(key, list);
			}
		});
		let closest = Infinity;
		for (const [key, list] of buckets) {
			const [bx, by] = key.split(',').map(Number);
			for (let dx = -1; dx <= 1; dx++) {
				for (let dy = -1; dy <= 1; dy++) {
					for (const other of buckets.get(`${bx + dx},${by + dy}`) ?? []) {
						for (const own of list) {
							if (own.trace === other.trace) continue;
							closest = Math.min(closest, Math.hypot(own.p.x - other.p.x, own.p.y - other.p.y));
						}
					}
				}
			}
		}
		expect(closest).toBeGreaterThanOrEqual(12);
	});

	it('triggers feeders on their chip top and other traces on their own top', () => {
		for (const trace of board.traces) {
			if (trace.chipId) {
				expect(trace.triggerY).toBe(input.chips.find((c) => c.id === trace.chipId)!.rect.y);
			} else {
				expect(trace.triggerY).toBe(trace.bbox.y);
			}
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
			expect(feedersOf(board, chip.id, own).length).toBeGreaterThan(0);
			expect(feedersOf(board, chip.id, other)).toHaveLength(0);
		});
	});

	it('adds decorative traces with the gutter area', () => {
		const decor = (b: Board) => b.traces.filter((t) => t.kind === 'decor').length;
		expect(decor(layoutBoard(page(1920, 6000)))).toBeGreaterThan(
			decor(layoutBoard(page(1440, 6000)))
		);
	});

	it('ends an unroutable feeder in a via and flags the chip', () => {
		const input = page(1440, 4000);
		const target = input.chips[3];
		// A wall down the middle of the left gutter, longer than any search window.
		const wall = {
			x: 60,
			y: target.rect.y - 1200,
			width: 12,
			height: target.rect.height + 2400
		};
		const board = layoutBoard({ ...input, obstacles: [...(input.obstacles ?? []), wall] });
		const wiring = board.chips.find((c) => c.id === target.id)!;
		expect(wiring.fallback).toBe(true);
		expect(feedersOf(board, target.id, 'left')).toHaveLength(0);
		expect(feedersOf(board, target.id, 'right').length).toBeGreaterThan(0);

		const dead = board.traces.filter((t) => t.kind === 'unrouted' && t.chipId === target.id);
		expect(dead.length).toBeGreaterThan(0);
		for (const trace of dead) {
			expect(trace.end.kind).toBe('via');
			expect(trace.side).toBe('left');
			expect(trace.points.at(-1)!.x).toBeLessThan(wall.x);
			expect(wiring.feeders).not.toContain(trace.id);
		}
	});

	it('flags a chip that has no room for any feeder', () => {
		const input = page(1440, 4000);
		const target = input.chips[2];
		const blocker = { x: 0, y: target.rect.y - 200, width: 1440, height: target.rect.height + 400 };
		const board = layoutBoard({ ...input, obstacles: [blocker] });
		const wiring = board.chips.find((c) => c.id === target.id)!;
		expect(wiring.feeders).toHaveLength(0);
		expect(wiring.fallback).toBe(true);
	});

	it('handles an empty page', () => {
		const board = layoutBoard({ width: 800, height: 600, chips: [] });
		expect(board.chips).toEqual([]);
		for (const trace of board.traces) expect(isOctilinear(trace.points)).toBe(true);
	});
});

describe('layoutBoard at 360 px', () => {
	const input = page(360, 12000);
	const board = layoutBoard(input);
	const desktop = layoutBoard(page(1440, 12000));

	it('switches to narrow mode with fewer traces', () => {
		expect(board.narrow).toBe(true);
		expect(board.traces.length).toBeGreaterThan(0);
		expect(board.traces.length).toBeLessThan(desktop.traces.length / 2);
	});

	it('keeps traces out of the content, except in the gaps between sections', () => {
		const chips = input.chips.map((c) => c.rect).sort((a, b) => a.y - b.y);
		const inGap = (y: number) =>
			chips.some((a, i) => i + 1 < chips.length && y > a.y + a.height && y < chips[i + 1].y);
		const left = chips[0].x;
		const right = chips[0].x + chips[0].width;
		for (const trace of board.traces) {
			for (const p of samples(trace)) {
				for (const rect of [...chips, ...(input.obstacles ?? [])]) {
					expect(inside(rect, p), trace.id).toBe(false);
				}
				if (p.x > left && p.x < right) expect(inGap(p.y), `${trace.id} at ${p.y}`).toBe(true);
			}
		}
	});

	it('still gives every chip a feeder', () => {
		for (const chip of board.chips) {
			expect(chip.feeders.length).toBeGreaterThanOrEqual(1);
			expect(chip.fallback).toBe(false);
		}
	});

	it('bends at 45 degrees only', () => {
		for (const trace of board.traces) expect(isOctilinear(trace.points), trace.id).toBe(true);
	});
});
