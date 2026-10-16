import { describe, expect, it } from 'vitest';
import { describeMeasure, measureAgainstReference } from './budget.testing.js';
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
import { Growth, HERO_JITTER_MS, HERO_MS, LEAD_MS, SOCKET_DRAW_MS } from './growth.js';
import { ellipseDistance, HERO_CLEARANCE, heroEllipse, HERO_WIDTH, type Ellipse } from './hero.js';
import { layoutBoard, type Board, type LayoutInput, type Trace } from './layout.js';

interface HeroCase {
	area: Rect;
	/** The logo socket, then each block of the text: what the ellipse holds. */
	content: Rect[];
	/** The text block as a whole: the obstacle. */
	copy: Rect;
	/** Top of the first chip below the hero. */
	chipTop: number;
}

const rect = (x: number, y: number, width: number, height: number): Rect => ({
	x,
	y,
	width,
	height
});

/** The hero as the real page measures it: the logo socket, the name, the rule, tagline, handle, icons. */
const CONTENT: Record<string, HeroCase> = {
	'1440x900': {
		area: rect(0, 0, 1440, 900),
		content: [
			rect(384, 161, 672, 232),
			rect(250, 456, 940, 72),
			rect(528, 542, 384, 2),
			rect(576, 560, 288, 36),
			rect(594, 611, 251, 24),
			rect(586, 643, 267, 24)
		],
		copy: rect(250, 456, 940, 212),
		chipTop: 1059
	},
	'1920x1080': {
		area: rect(0, 0, 1920, 1080),
		content: [
			rect(624, 246, 672, 232),
			rect(490, 554, 940, 72),
			rect(768, 640, 384, 2),
			rect(816, 658, 288, 36),
			rect(834, 709, 251, 24),
			rect(826, 741, 267, 24)
		],
		copy: rect(490, 554, 940, 212),
		chipTop: 1329
	},
	'1280x720': {
		area: rect(0, 0, 1280, 720),
		content: [
			rect(307, 77, 666, 230),
			rect(183, 357, 913, 71),
			rect(448, 442, 384, 2),
			rect(496, 460, 288, 36),
			rect(514, 511, 251, 24),
			rect(506, 543, 267, 24)
		],
		copy: rect(183, 357, 913, 210),
		chipTop: 848
	},
	'768x1024': {
		area: rect(0, 0, 768, 1024),
		content: [
			rect(184, 281, 399, 138),
			rect(110, 491, 548, 42),
			rect(192, 547, 384, 2),
			rect(240, 565, 288, 36),
			rect(258, 617, 251, 24),
			rect(250, 649, 267, 24)
		],
		copy: rect(110, 491, 548, 182),
		chipTop: 1146
	},
	'375x667': {
		area: rect(0, 0, 375, 667),
		content: [
			rect(60, 124, 256, 88),
			rect(30, 260, 315, 67),
			rect(35, 341, 305, 2),
			rect(43, 359, 288, 36),
			rect(62, 411, 251, 24),
			rect(54, 443, 267, 24)
		],
		copy: rect(30, 260, 315, 207),
		chipTop: 771
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

	it('leaves at least 32 px of clear board round every corner of the content', () => {
		for (const { area, content } of Object.values(CONTENT)) {
			const e = heroEllipse(content, area)!;
			for (const rect of content) {
				for (const p of corners(rect, 32)) expect(ellipseDistance(e, p)).toBeLessThanOrEqual(1);
			}
		}
	});

	it('centres on the content', () => {
		const { area, content } = CONTENT['1440x900'];
		const e = heroEllipse(content, area)!;
		expect(e.cx).toBeCloseTo(720, 0);
		expect(e.cy).toBeCloseTo((161 + 667) / 2, 0);
	});

	for (const name of ['1440x900', '1920x1080']) {
		it(`is 80% of the window wide and only as tall as the content needs at ${name}`, () => {
			const { area, content } = CONTENT[name];
			const e = heroEllipse(content, area)!;
			expect(e.rx * 2).toBeCloseTo(HERO_WIDTH * area.width, 6);
			// Some corner of the content, grown by the clearance, sits right on the rim.
			const reach = Math.max(
				...content.flatMap((r) => corners(r, HERO_CLEARANCE).map((p) => ellipseDistance(e, p)))
			);
			expect(reach).toBeGreaterThan(0.999);
		});
	}

	it('leaves field above and below the content on a desktop window', () => {
		const { area, content } = CONTENT['1440x900'];
		const m = margins(heroEllipse(content, area)!, area);
		expect(m.top).toBeGreaterThan(24);
		expect(m.bottom).toBeGreaterThan(24);
		expect(m.left).toBeCloseTo(144, 6);
	});

	for (const name of ['375x667', '768x1024', '1280x720']) {
		it(`grows wider than 80% where the content needs it, at ${name}`, () => {
			const { area, content } = CONTENT[name];
			const e = heroEllipse(content, area)!;
			expect(e.rx * 2).toBeGreaterThan(HERO_WIDTH * area.width);
			expect(e.ry).toBeLessThan(area.height);
		});
	}

	it('returns null without content', () => {
		expect(heroEllipse([], CONTENT['1440x900'].area)).toBeNull();
	});
});

// A page: the hero (one window high) with its content and the scroll link, then a column of chips.
function heroPage(name: string, extra: Partial<LayoutInput> = {}): LayoutInput {
	const { area, content, copy, chipTop } = CONTENT[name];
	const width = area.width;
	const pad = width >= 1184 ? (width - 1152) / 2 : 16;
	const chips = [0, 1, 2].map((i) => {
		const rect = { x: pad, y: chipTop + i * 700, width: width - 2 * pad, height: 600 };
		const pins: Point[] = [];
		for (let k = 0; k < 10; k++) {
			pins.push({ x: rect.x - 4, y: rect.y + 24 + k * 48 });
			pins.push({ x: rect.x + rect.width + 4, y: rect.y + 24 + k * 48 });
		}
		return { id: `c${i}`, side: 'both' as const, rect, pins };
	});
	const indicator = { x: width / 2 - 39, y: area.height - 90, width: 78, height: 82 };
	const logo = content[0];
	return {
		width,
		height: chipTop + 3 * 700 + 200,
		chips,
		obstacles: [copy, indicator],
		// The logo's two open trace ends: one on its bottom edge, one on its top edge.
		socket: {
			rect: logo,
			ports: [
				{ x: logo.x + 0.1 * logo.width, y: logo.y + logo.height - 2 },
				{ x: logo.x + 0.6 * logo.width, y: logo.y + 1 }
			],
			leads: [0, 1]
		},
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
	// Rim traces ("hero:4.1") end on the ellipse; fill traces ("hero:f...") end in vias on the
	// open board; dots ("hero:d...") run from a via to a via.
	const rim = field.filter((t) => /^hero:\d/.test(t.id));
	const fill = field.filter((t) => t.id.startsWith('hero:f'));
	const dots = field.filter((t) => t.id.startsWith('hero:d'));
	const { ellipse, rect: area } = input.hero!;

	it('fills the hero with a dense field of traces', () => {
		expect(field.length).toBeGreaterThanOrEqual(80);
		expect(board.hero).toEqual(input.hero);
	});

	it('fills the open board between the rim buses with buses from the edges that end in vias', () => {
		expect(fill.length).toBeGreaterThan(1);
		for (const trace of fill) {
			const start = trace.points[0];
			// From the bottom they start on vias below the hero, the rest on a window edge.
			if (start.y > heroBottom) expect(trace.startVia, trace.id).toBe(true);
			else expect(onEdge(start, area, board.width), trace.id).toBe(true);
			expect(trace.end).toEqual({ kind: 'via' });
		}
	});

	/** The headings of a trace's runs. */
	const headings = (trace: Trace) =>
		trace.points
			.slice(1)
			.map((p, i) => dirOf(p.x - trace.points[i].x, p.y - trace.points[i].y) as number);

	it('fills the open board with buses of parallel traces, from a via to a via', () => {
		expect(dots.length).toBeGreaterThan(12);
		const buses = new Map<string, Trace[]>();
		for (const trace of dots) {
			expect(trace.startVia, trace.id).toBe(true);
			expect(trace.end).toEqual({ kind: 'via' });
			expect(onEdge(trace.points[0], area, board.width), trace.id).toBe(false);
			expect(trace.points.length, trace.id).toBeLessThanOrEqual(3);
			buses.set(trace.bus, [...(buses.get(trace.bus) ?? []), trace]);
		}
		// Bus-like: most traces run beside others, every trace of a bus the same way.
		const inBuses = [...buses.values()].filter((bus) => bus.length >= 2).flat();
		expect(inBuses.length).toBeGreaterThan(dots.length * 0.7);
		for (const bus of buses.values()) {
			for (const trace of bus) expect(headings(trace), trace.id).toEqual(headings(bus[0]));
			expect(bus.length).toBeLessThanOrEqual(4);
		}
	});

	it('mixes short, middle and long filler runs', () => {
		const cells = dots.map((t) => t.length / PITCH);
		expect(cells.some((n) => n < 6)).toBe(true);
		expect(cells.some((n) => n >= 6 && n < 11)).toBe(true);
		expect(cells.some((n) => n >= 11)).toBe(true);
	});

	it('mirrors some filler buses: a twin beside it that bends the other way', () => {
		const twins = new Set(dots.filter((t) => t.bus.endsWith('m')).map((t) => t.bus));
		expect(twins.size).toBeGreaterThan(0);
		for (const twin of twins) {
			const a = dots.find((t) => t.bus === twin.slice(0, -1))!;
			const b = dots.find((t) => t.bus === twin)!;
			// Each bus is drawn toward the ellipse, so either may run the way it was laid or back.
			const ways = (t: Trace) => {
				const h = headings(t);
				return [h, [...h].reverse().map((d) => (d + 4) % 8)];
			};
			const mirrored = ways(a).some((ha) =>
				ways(b).some(
					(hb) =>
						hb[0] === ha[0] &&
						// One turns clockwise, the other as far the other way.
						(ha.length < 2 || (ha[1] - ha[0] + 8) % 8 === (hb[0] - hb[1] + 8) % 8)
				)
			);
			expect(mirrored, twin).toBe(true);
		}
	});

	it('never lets a trace turn back on itself', () => {
		for (const trace of field) {
			const dirs = trace.points
				.slice(1)
				.map((p, i) => dirOf(p.x - trace.points[i].x, p.y - trace.points[i].y) as Dir);
			// Every run within 90 degrees of the way in from the edge, or of the way into the rim.
			const within = (heading: Dir) => dirs.every((d) => turnSteps(heading, d) <= 2);
			expect(within(dirs[0]) || within(dirs[dirs.length - 1]), trace.id).toBe(true);
		}
	});

	it('keeps every trace but the two leads out of the ellipse, halo included', () => {
		for (const trace of board.traces.filter((t) => t.kind !== 'socket')) {
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

	const spines = board.traces.filter((t) => t.kind === 'spine');
	const onSpineTop = (p: Point) =>
		spines.some((s) => s.points[0].x === p.x && s.points[0].y === p.y);
	const heroBottom = area.y + area.height;

	it('starts each rim trace on a side or the top of the window, at a via, or on a spine', () => {
		let vias = 0;
		for (const trace of rim) {
			const start = trace.points[0];
			if (onSpineTop(start)) continue;
			if (trace.startVia) {
				vias++;
				expect(onEdge(start, area, board.width), trace.id).toBe(false);
			} else {
				const onSideOrTop =
					Math.abs(start.x) < 1e-6 ||
					Math.abs(start.x - board.width) < 1e-6 ||
					Math.abs(start.y - area.y) < 1e-6;
				expect(onSideOrTop, trace.id).toBe(true);
			}
		}
		expect(vias).toBeGreaterThan(0);
		expect(vias).toBeLessThan(rim.length / 2);
	});

	it('runs the traces from the bottom on out of the hero, to vias on the page below', () => {
		const onSide = (p: Point) => Math.abs(p.x) < 1e-6 || Math.abs(p.x - board.width) < 1e-6;
		const below = field.filter(
			(t) => t.points[0].y > heroBottom && !onSpineTop(t.points[0]) && !onSide(t.points[0])
		);
		expect(below.length).toBeGreaterThan(5);
		for (const trace of below) {
			expect(trace.startVia, trace.id).toBe(true);
			expect(trace.points[0].y, trace.id).toBeLessThan(board.heroBottom);
		}
		// Nothing starts or ends on the bottom edge of the hero itself.
		for (const trace of field) {
			expect(Math.abs(trace.points[0].y - heroBottom), trace.id).toBeGreaterThan(1);
		}
	});

	it('lets the spine grow out of the field: a hero trace runs on from the top of each spine trace', () => {
		expect(spines.length).toBeGreaterThan(0);
		for (const spine of spines) {
			const top = spine.points[0];
			const link = field.find((t) => t.points[0].x === top.x && t.points[0].y === top.y);
			expect(link, spine.id).toBeDefined();
			expect(link!.startVia, spine.id).toBeUndefined();
			// Straight up out of the spine.
			expect(link!.points[1].x, spine.id).toBe(top.x);
			expect(link!.points[1].y, spine.id).toBeLessThan(top.y);
		}
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

	it('bends at 45 degrees only and stays above the first chip', () => {
		for (const trace of field) {
			expect(isOctilinear(trace.points), trace.id).toBe(true);
			for (const p of trace.points) {
				expect(p.y).toBeGreaterThanOrEqual(area.y - 1e-6);
				expect(p.y).toBeLessThanOrEqual(board.heroBottom + PITCH);
			}
		}
	});

	it('runs two lead traces into the ellipse, each from the edge its port faces', () => {
		const leads = board.traces.filter((t) => t.kind === 'socket');
		expect(leads).toHaveLength(2);
		const [cyan, green] = [...leads].sort((a, b) => a.points[0].x - b.points[0].x);
		const ports = input.socket!.ports;
		// The cyan port is on the logo's bottom side, over the text: its lead comes from the left.
		expect(cyan.side).toBe('left');
		expect(cyan.points[0].x).toBe(0);
		expect(cyan.points.at(-1)).toEqual(ports[0]);
		expect(cyan.end).toEqual({ kind: 'port', port: 0 });
		// The green port is on the top side: its lead comes straight down from the top.
		expect(green.side).toBe('right');
		expect(green.points[0].y).toBe(0);
		expect(green.points.at(-1)).toEqual(ports[1]);
		expect(green.end).toEqual({ kind: 'port', port: 1 });
		for (const lead of leads) {
			expect(isOctilinear(lead.points), lead.id).toBe(true);
			// Into the ellipse, and only into the socket on its last run.
			expect(samples(lead).some((p) => ellipseDistance(ellipse, p) < 1)).toBe(true);
			const lastRun = lead.lengths.at(-2)!;
			for (const p of samples(lead).filter((_, i) => i * 2 < lastRun)) {
				const r = input.socket!.rect;
				const inside = p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
				expect(inside, lead.id).toBe(false);
			}
		}
	});

	it('builds no lead traces without lead ports', () => {
		const page = heroPage('1440x900');
		page.socket = { ...page.socket!, leads: [] };
		expect(layoutBoard(page).traces.filter((t) => t.kind === 'socket')).toHaveLength(0);
	});

	it('gives every trace a unique id', () => {
		const ids = board.traces.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('is deterministic', () => {
		expect(layoutBoard(heroPage('1440x900'))).toEqual(board);
	});

	it('draws a different field for every seed, each keeping the ellipse clear and quick', () => {
		const keep = { ...ellipse, rx: ellipse.rx + 4, ry: ellipse.ry + 4 };
		const shapes = new Set<string>();
		let slowest = 0;
		for (let seed = 1; seed <= 12; seed++) {
			const page = heroPage('1440x900', { seed: seed * 7919 });
			const start = performance.now();
			const other = layoutBoard(page);
			slowest = Math.max(slowest, performance.now() - start);
			expect(
				other.traces.filter((t) => t.kind === 'socket'),
				`seed ${seed}`
			).toHaveLength(2);
			expect(heroTraces(other).length, `seed ${seed}`).toBeGreaterThan(60);
			for (const trace of other.traces.filter((t) => t.kind !== 'socket')) {
				for (const p of samples(trace, 4)) {
					expect(ellipseDistance(keep, p), `seed ${seed} ${trace.id}`).toBeGreaterThanOrEqual(1);
				}
			}
			shapes.add(JSON.stringify(heroTraces(other).map((t) => t.points)));
		}
		expect(shapes.size).toBe(12);
		expect(slowest).toBeLessThan(100);
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
			for (const trace of other.traces.filter((t) => t.kind !== 'socket')) {
				for (const p of samples(trace, 3)) {
					expect(ellipseDistance(e, p), trace.id).toBeGreaterThanOrEqual(1);
				}
			}
		});
	}

	/**
	 * The hero field of a 1440 x 900 window takes about 0.9 times `referenceMs` (10 ms against 12 ms
	 * on a laptop) and 1 to 1.5 times under a heavy CPU load, where both slow down 2x or more. It
	 * fails once the layout is about 5x slower, which is what a fixed 60 ms allowed; that limit
	 * failed on CI at 64.9 ms.
	 */
	const FRAME_BUDGET_RATIO = 4;

	it('builds the hero field of a 1440 x 900 window in well under the frame budget', async () => {
		const page = heroPage('1440x900');
		const measure = await measureAgainstReference(() => {
			const start = performance.now();
			layoutBoard(page);
			return performance.now() - start;
		});
		console.info(describeMeasure('hero layout', measure, FRAME_BUDGET_RATIO));
		expect(measure.ratio).toBeLessThan(FRAME_BUDGET_RATIO);
	});

	it('lays out 1440 x 8000 with a hero in under 200 ms', () => {
		const page = heroPage('1440x900', { height: 8000 });
		const start = performance.now();
		layoutBoard(page);
		expect(performance.now() - start).toBeLessThan(200);
	});
});

describe('layoutBoard hero field draw direction', () => {
	// A trace is drawn from its first point to its last, so the first point has to be the one
	// farthest out: every trace grows toward the hero's centre, never out toward the page edge.
	const windows = ['1440x900', '1920x1080', '1280x720', '768x1024', '375x667'];
	const seeds = Array.from({ length: 20 }, (_, i) => 1 + i * 7919);
	/**
	 * A filler bus is drawn all one way, so the odd trace of a bus running along the ellipse may end
	 * a hair farther out than it starts (a few px; the ellipse's own radius is 1). A bus drawn out
	 * toward the page edge is off by much more.
	 */
	const TANGENT = 0.05;

	/**
	 * A fill bus starts on the edge of the field (a window edge, or the row where the field ends
	 * below the hero) and is drawn away from that edge by construction: one that bends along the
	 * edge on its way in may end a hair farther out by the ellipse's measure. Every other trace,
	 * the leads and the floating filler buses included, is held to the measure.
	 */
	function onFieldEdge(board: Board, trace: Trace): boolean {
		if (!trace.id.startsWith('hero:f')) return false;
		const { x, y } = trace.points[0];
		return (
			x <= 0 || x >= board.width || y <= board.hero!.rect.y || y >= board.heroBottom - PITCH * 2
		);
	}

	function awayFromCentre(board: Board): string[] {
		const ellipse = board.hero!.ellipse;
		const wrong: string[] = [];
		for (const trace of board.traces) {
			if (trace.kind !== 'hero' && trace.kind !== 'socket') continue;
			if (onFieldEdge(board, trace)) continue;
			const start = ellipseDistance(ellipse, trace.points[0]);
			const end = ellipseDistance(ellipse, trace.points[trace.points.length - 1]);
			if (start + TANGENT < end) wrong.push(`${trace.id} ${(end - start).toFixed(4)}`);
		}
		return wrong;
	}

	it('starts every hero and lead trace farther from the centre than it ends', () => {
		for (const name of windows) {
			for (const seed of seeds) {
				const board = layoutBoard(heroPage(name, { seed }));
				expect(awayFromCentre(board), `${name} seed ${seed}`).toEqual([]);
			}
		}
	}, 60_000);

	it('grows the tip of every part-drawn hero and lead trace in toward the centre', () => {
		const board = layoutBoard(heroPage('1440x900', { seed: 4242 }));
		const { ellipse } = board.hero!;
		const growth = new Growth(board);
		growth.update(0, 0, 900);
		growth.update(HERO_MS / 2, 0, 900);
		let partial = 0;
		for (const trace of board.traces) {
			if (trace.kind !== 'hero' && trace.kind !== 'socket') continue;
			if (onFieldEdge(board, trace)) continue;
			const drawn = growth.drawn(trace.id);
			if (!(drawn > 0 && drawn < trace.length)) continue;
			partial++;
			const tip = pointAt(trace.points, trace.lengths, drawn);
			expect(ellipseDistance(ellipse, tip), trace.id).toBeLessThanOrEqual(
				ellipseDistance(ellipse, trace.points[0]) + TANGENT
			);
		}
		expect(partial).toBeGreaterThan(20);
	});
});

describe('layoutBoard hero field timing', () => {
	const windows = ['1440x900', '1920x1080', '768x1024', '375x667'];
	const seeds = [3, 4242, 99991];
	const STEP = 20;

	/** When each trace of the field first shows and first is full, and when the socket has power. */
	function timeline(board: Board) {
		const growth = new Growth(board);
		const traces = board.traces.filter((t) => t.kind === 'hero' || t.kind === 'socket');
		const start = new Map<string, number>();
		const finish = new Map<string, number>();
		let power = -1;
		growth.update(0, 0, 900);
		for (let ms = 0; ms <= HERO_MS + 500; ms += STEP) {
			growth.update(ms, 0, 900);
			if (power < 0 && growth.powered) power = ms;
			for (const t of traces) {
				if (!start.has(t.id) && growth.drawn(t.id) > 0) start.set(t.id, ms);
				if (!finish.has(t.id) && growth.isFull(t.id)) finish.set(t.id, ms);
			}
		}
		const hero = board.traces.filter((t) => t.kind === 'hero');
		const leads = board.traces.filter((t) => t.kind === 'socket');
		const speed = (t: Trace) => (t.length / (finish.get(t.id)! - start.get(t.id)!)) * 1000;
		return {
			power,
			starts: hero.map((t) => start.get(t.id)!),
			finishes: hero.map((t) => finish.get(t.id)!),
			speeds: hero.map(speed),
			leads: leads.map((t) => ({
				start: start.get(t.id)!,
				finish: finish.get(t.id)!,
				speed: speed(t)
			}))
		};
	}

	const quantile = (xs: number[], q: number) => {
		const sorted = [...xs].sort((a, b) => a - b);
		return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
	};

	it('starts the leads in the window the rest of the field starts in, no faster than it grows', () => {
		for (const name of windows) {
			for (const seed of seeds) {
				const label = `${name} seed ${seed}`;
				const { starts, speeds, leads } = timeline(layoutBoard(heroPage(name, { seed })));
				expect(leads.length, label).toBeGreaterThan(0);
				for (const lead of leads) {
					// Not before the field has begun, not after it has all begun, give or take a jitter.
					expect(lead.start, label).toBeGreaterThanOrEqual(Math.min(...starts) - HERO_JITTER_MS);
					expect(lead.start, label).toBeLessThanOrEqual(Math.max(...starts) + HERO_JITTER_MS);
					// Not a streak: no faster than the fastest of the field, give or take a quarter.
					expect(lead.speed, label).toBeLessThanOrEqual(Math.max(...speeds) * 1.25);
				}
			}
		}
	}, 60_000);

	it('powers the socket when the leads arrive, whatever the seed', () => {
		for (const name of windows) {
			for (const seed of seeds) {
				const label = `${name} seed ${seed}`;
				const { power, leads } = timeline(layoutBoard(heroPage(name, { seed })));
				expect(power, label).toBeGreaterThanOrEqual(LEAD_MS);
				expect(power, label).toBeLessThanOrEqual(LEAD_MS + STEP);
				for (const lead of leads) expect(lead.finish, label).toBeLessThanOrEqual(LEAD_MS + STEP);
			}
		}
	}, 60_000);

	it('spreads the arrival of the field over the end of the build, none long after power', () => {
		for (const name of windows) {
			for (const seed of seeds) {
				const label = `${name} seed ${seed}`;
				const { power, finishes } = timeline(layoutBoard(heroPage(name, { seed })));
				// A real spread, not one moment: the middle 80% arrive over at least 1.2 s.
				const spread = quantile(finishes, 0.9) - quantile(finishes, 0.1);
				expect(spread, label).toBeGreaterThanOrEqual(1200);
				// And no clump: no 300 ms holds more than a third of the field.
				const bins = new Map<number, number>();
				for (const f of finishes)
					bins.set(Math.floor(f / 300), (bins.get(Math.floor(f / 300)) ?? 0) + 1);
				expect(Math.max(...bins.values()) / finishes.length, label).toBeLessThan(1 / 3);
				// Some come in after the socket has power, while the logo draws; the time the logo
				// takes is the latest any may be.
				expect(finishes.filter((f) => f > power).length, label).toBeGreaterThan(0);
				expect(Math.max(...finishes), label).toBeLessThanOrEqual(power + SOCKET_DRAW_MS + STEP);
			}
		}
	}, 60_000);
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
