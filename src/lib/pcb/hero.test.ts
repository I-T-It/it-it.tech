import { describe, expect, it } from 'vitest';
import {
	DX,
	DY,
	dirOf,
	isOctilinear,
	pointAt,
	turnSteps,
	type Dir,
	type Point,
	type Rect
} from './geometry.js';
import { PITCH } from './grid.js';
import { ellipseDistance, HERO_BAND, HERO_CLEARANCE, heroEllipse, type Ellipse } from './hero.js';
import { layoutBoard, type Board, type LayoutInput, type Trace } from './layout.js';

/** The hero content as the real page measures it: the logo socket and the text block. */
const CONTENT: Record<string, { area: Rect; content: Rect[] }> = {
	'1440x900': {
		area: { x: 0, y: 0, width: 1440, height: 900 },
		content: [
			{ x: 384, y: 143, width: 672, height: 232 },
			{ x: 408, y: 447, width: 623, height: 238 }
		]
	},
	'1920x1080': {
		area: { x: 0, y: 0, width: 1920, height: 1080 },
		content: [
			{ x: 624, y: 231, width: 672, height: 232 },
			{ x: 648, y: 543, width: 623, height: 238 }
		]
	},
	'1280x720': {
		area: { x: 0, y: 0, width: 1280, height: 720 },
		content: [
			{ x: 307, y: 60, width: 666, height: 230 },
			{ x: 328, y: 347, width: 623, height: 238 }
		]
	},
	'375x667': {
		area: { x: 0, y: 0, width: 375, height: 667 },
		content: [
			{ x: 60, y: 71, width: 256, height: 88 },
			{ x: 30, y: 215, width: 315, height: 305 }
		]
	}
};

function corners(rect: Rect, grow: number): Point[] {
	const x0 = rect.x - grow;
	const y0 = rect.y - grow;
	const x1 = rect.x + rect.width + grow;
	const y1 = rect.y + rect.height + grow;
	return [
		{ x: x0, y: y0 },
		{ x: x1, y: y0 },
		{ x: x0, y: y1 },
		{ x: x1, y: y1 }
	];
}

function margins(e: Ellipse, area: Rect) {
	return {
		top: e.cy - e.ry - area.y,
		bottom: area.y + area.height - (e.cy + e.ry),
		left: e.cx - e.rx - area.x,
		right: area.x + area.width - (e.cx + e.rx)
	};
}

describe('heroEllipse', () => {
	for (const [name, { area, content }] of Object.entries(CONTENT)) {
		it(`holds all of the content with room to spare at ${name}`, () => {
			const e = heroEllipse(content, area)!;
			for (const rect of content) {
				for (const p of corners(rect, HERO_CLEARANCE)) {
					expect(ellipseDistance(e, p)).toBeLessThanOrEqual(1 + 1e-9);
				}
			}
		});
	}

	it('centres on the content', () => {
		const { area, content } = CONTENT['1440x900'];
		const e = heroEllipse(content, area)!;
		expect(e.cx).toBeCloseTo(720, 0);
		expect(e.cy).toBeCloseTo((143 + 685) / 2, 0);
	});

	it('leaves a band of field on every side where the window has room', () => {
		const { area, content } = CONTENT['1920x1080'];
		const m = margins(heroEllipse(content, area)!, area);
		for (const value of Object.values(m)) expect(value).toBeGreaterThanOrEqual(HERO_BAND - 1);
		// No bigger than it has to be: the band at the top or bottom is about HERO_BAND.
		expect(Math.min(m.top, m.bottom)).toBeLessThan(HERO_BAND + 24);
	});

	it('shares out what room there is when the content nearly fills the window', () => {
		const { area, content } = CONTENT['1440x900'];
		const m = margins(heroEllipse(content, area)!, area);
		// The thinnest band is as thick as it can be: bands round 75 px on the sides and the top.
		expect(Math.min(m.top, m.left, m.right)).toBeGreaterThan(60);
	});

	it('still holds the content when the window is too small for a band', () => {
		for (const name of ['1280x720', '375x667']) {
			const { area, content } = CONTENT[name];
			const e = heroEllipse(content, area)!;
			expect(e.rx).toBeGreaterThan(0);
			expect(e.ry).toBeGreaterThan(0);
		}
	});

	it('returns null without content', () => {
		expect(heroEllipse([], CONTENT['1440x900'].area)).toBeNull();
	});
});

// A page: the hero (one window high) with its content and the scroll link, then a column of chips.
function heroPage(name: string, extra: Partial<LayoutInput> = {}): LayoutInput {
	const { area, content } = CONTENT[name];
	const width = area.width;
	const pad = width >= 1184 ? (width - 1152) / 2 : 16;
	const chips = [0, 1, 2].map((i) => {
		const rect = { x: pad, y: area.height + 48 + i * 700, width: width - 2 * pad, height: 600 };
		const pins: Point[] = [];
		for (let k = 0; k < 10; k++) {
			pins.push({ x: rect.x - 4, y: rect.y + 24 + k * 48 });
			pins.push({ x: rect.x + rect.width + 4, y: rect.y + 24 + k * 48 });
		}
		return { id: `c${i}`, side: 'both' as const, rect, pins };
	});
	const indicator = { x: width / 2 - 39, y: area.height - 90, width: 78, height: 82 };
	return {
		width,
		height: area.height + 48 + 3 * 700 + 200,
		chips,
		obstacles: [content[1], indicator],
		socket: { rect: content[0], ports: [{ x: content[0].x + 100, y: content[0].y + 190 }] },
		hero: { rect: area, ellipse: heroEllipse(content, area)! },
		...extra
	};
}

function heroTraces(board: Board): Trace[] {
	return board.traces.filter((t) => t.kind === 'hero');
}

/** Points every `step` px along a trace. */
function samples(trace: Trace, step = 2): Point[] {
	const out: Point[] = [];
	for (let along = 0; along < trace.length; along += step) {
		out.push(pointAt(trace.points, trace.lengths, along));
	}
	out.push(trace.points[trace.points.length - 1]);
	return out;
}

function onEdge(p: Point, area: Rect, width: number): boolean {
	const eps = 1e-6;
	return (
		Math.abs(p.x) < eps ||
		Math.abs(p.x - width) < eps ||
		Math.abs(p.y - area.y) < eps ||
		Math.abs(p.y - (area.y + area.height)) < eps
	);
}

describe('layoutBoard hero field', () => {
	const input = heroPage('1440x900');
	const board = layoutBoard(input);
	const field = heroTraces(board);
	// Rim traces end on the ellipse; fill traces ("hero:f...") end in vias on the open board.
	const rim = field.filter((t) => !t.id.startsWith('hero:f'));
	const fill = field.filter((t) => t.id.startsWith('hero:f'));
	const { ellipse, rect: area } = input.hero!;

	it('fills the hero with a dense field of traces', () => {
		expect(field.length).toBeGreaterThanOrEqual(80);
		expect(board.hero).toEqual(input.hero);
	});

	it('fills the open board between the rim buses with buses from the edges that end in vias', () => {
		expect(fill.length).toBeGreaterThan(10);
		for (const trace of fill) {
			expect(onEdge(trace.points[0], area, board.width), trace.id).toBe(true);
			expect(trace.startVia, trace.id).toBeUndefined();
			expect(trace.end).toEqual({ kind: 'via' });
		}
	});

	it('never lets a trace turn back on itself', () => {
		for (const trace of field) {
			const dirs = trace.points
				.slice(1)
				.map((p, i) => dirOf(p.x - trace.points[i].x, p.y - trace.points[i].y) as number);
			for (const d of dirs)
				expect(turnSteps(dirs[0] as Dir, d as Dir), trace.id).toBeLessThanOrEqual(2);
		}
	});

	it('keeps every trace out of the ellipse, halo included', () => {
		for (const trace of board.traces) {
			for (const p of samples(trace)) {
				expect(
					ellipseDistance({ ...ellipse, rx: ellipse.rx + 4, ry: ellipse.ry + 4 }, p),
					trace.id
				).toBeGreaterThanOrEqual(1);
			}
		}
	});

	it('ends every rim trace on the rim of the ellipse, heading in', () => {
		expect(rim.length).toBeGreaterThanOrEqual(40);
		for (const trace of rim) {
			const n = trace.points.length;
			const end = trace.points[n - 1];
			const before = trace.points[n - 2];
			const d = dirOf(end.x - before.x, end.y - before.y);
			expect(d, trace.id).not.toBe(-1);
			const ahead = {
				x: end.x + DX[d as number] * 3 * PITCH,
				y: end.y + DY[d as number] * 3 * PITCH
			};
			expect(ellipseDistance(ellipse, ahead), trace.id).toBeLessThan(1);
			expect(trace.end).toEqual({ kind: 'via' });
		}
	});

	it('starts each hero trace on an edge of the window, or at a via on the board', () => {
		let vias = 0;
		for (const trace of field) {
			const start = trace.points[0];
			if (trace.startVia) {
				vias++;
				expect(onEdge(start, area, board.width), trace.id).toBe(false);
			} else {
				expect(onEdge(start, area, board.width), trace.id).toBe(true);
			}
		}
		expect(vias).toBeGreaterThan(0);
		expect(vias).toBeLessThan(field.length / 2);
	});

	it('comes in from all four corners', () => {
		const quadrants = new Map<string, number>();
		for (const trace of field) {
			const s = trace.points[0];
			const key = `${s.x < ellipse.cx ? 'L' : 'R'}${s.y < ellipse.cy ? 'T' : 'B'}`;
			quadrants.set(key, (quadrants.get(key) ?? 0) + 1);
		}
		for (const key of ['LT', 'RT', 'LB', 'RB'])
			expect(quadrants.get(key) ?? 0, key).toBeGreaterThan(4);
	});

	it('surrounds the ellipse: traces end on it all the way round', () => {
		const angles = rim
			.map((t) => t.points[t.points.length - 1])
			.map((p) => Math.atan2((p.y - ellipse.cy) / ellipse.ry, (p.x - ellipse.cx) / ellipse.rx))
			.sort((a, b) => a - b);
		const gaps = angles.map((a, i) =>
			i === 0 ? a + 2 * Math.PI - angles.at(-1)! : a - angles[i - 1]
		);
		expect(Math.max(...gaps)).toBeLessThan(Math.PI / 4);
	});

	it('colours traces from the left cyan and from the right green', () => {
		for (const trace of field) {
			expect(trace.side, trace.id).toBe(trace.points[0].x < board.width / 2 ? 'left' : 'right');
		}
	});

	it('keeps out from under the scroll link', () => {
		const link = input.obstacles![1];
		for (const trace of field) {
			for (const p of samples(trace)) {
				const inside =
					p.x > link.x && p.x < link.x + link.width && p.y > link.y && p.y < link.y + link.height;
				expect(inside, trace.id).toBe(false);
			}
		}
	});

	it('bends at 45 degrees only and stays inside the hero', () => {
		for (const trace of field) {
			expect(isOctilinear(trace.points), trace.id).toBe(true);
			for (const p of trace.points) {
				expect(p.y).toBeGreaterThanOrEqual(area.y - 1e-6);
				expect(p.y).toBeLessThanOrEqual(area.y + area.height + 1e-6);
			}
		}
	});

	it('builds no socket traces: nothing runs inside the ellipse', () => {
		expect(board.traces.filter((t) => t.kind === 'socket')).toHaveLength(0);
	});

	it('gives every trace a unique id', () => {
		const ids = board.traces.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('is deterministic', () => {
		expect(layoutBoard(heroPage('1440x900'))).toEqual(board);
	});

	it('still wires the chips below the hero', () => {
		for (const chip of board.chips) expect(chip.feeders.length, chip.id).toBeGreaterThan(0);
	});

	for (const name of ['1920x1080', '1280x720', '375x667']) {
		it(`keeps the ellipse clear at ${name}`, () => {
			const page = heroPage(name);
			const e = page.hero!.ellipse;
			const other = layoutBoard(page);
			expect(heroTraces(other).length, name).toBeGreaterThan(8);
			for (const trace of other.traces) {
				for (const p of samples(trace, 3)) {
					expect(ellipseDistance(e, p), trace.id).toBeGreaterThanOrEqual(1);
				}
			}
		});
	}

	it('builds the hero field of a 1440 x 900 window in well under the frame budget', () => {
		const page = heroPage('1440x900');
		layoutBoard(page);
		const start = performance.now();
		layoutBoard(page);
		expect(performance.now() - start).toBeLessThan(60);
	});

	it('lays out 1440 x 8000 with a hero in under 200 ms', () => {
		const page = heroPage('1440x900', { height: 8000 });
		const start = performance.now();
		layoutBoard(page);
		expect(performance.now() - start).toBeLessThan(200);
	});
});

describe('layoutBoard without a hero', () => {
	it('builds no hero traces', () => {
		const page = heroPage('1440x900');
		delete page.hero;
		const board = layoutBoard(page);
		expect(heroTraces(board)).toHaveLength(0);
		expect(board.hero).toBeNull();
	});
});
