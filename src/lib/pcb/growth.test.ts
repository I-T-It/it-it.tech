import { describe, expect, it } from 'vitest';
import {
	BOOT_FALLBACK_MS,
	BRANCH_SPEED,
	FRONT_RATIO,
	frontAt,
	Growth,
	GROWTH_SPEED,
	MAX_STAGGER_MS,
	SOCKET_MS
} from './growth.js';
import { makeTrace, type Board, type ChipWiring, type Trace } from './layout.js';

const VH = 1000;
const T = 10_000;

/** A straight branch (with `chipId`) or decoration of `length` px that latches at `triggerY`. */
function line(id: string, length: number, triggerY: number, chipId: string | null = null): Trace {
	return makeTrace({
		id,
		kind: chipId ? 'branch' : 'decor',
		side: 'left',
		bus: id,
		points: [
			{ x: 0, y: triggerY },
			{ x: length, y: triggerY }
		],
		end: chipId ? { kind: 'pin', chipId, pin: 0 } : { kind: 'via' },
		chipId,
		triggerY
	});
}

/** A spine trace through `points`. */
function spine(id: string, points: { x: number; y: number }[]): Trace {
	return makeTrace({
		id,
		kind: 'spine',
		side: 'left',
		bus: 'spine:L',
		points,
		end: { kind: 'via' },
		chipId: null,
		triggerY: points[0].y
	});
}

/** A straight vertical spine from `top` to `bottom`. */
function straightSpine(id: string, top: number, bottom: number): Trace {
	return spine(id, [
		{ x: 50, y: top },
		{ x: 50, y: bottom }
	]);
}

/** A socket trace of `length` px, coming in from the left edge. */
function socketTrace(id: string, length: number): Trace {
	return makeTrace({
		id,
		kind: 'socket',
		side: 'left',
		bus: 'socket:L',
		points: [
			{ x: 0, y: 400 },
			{ x: length, y: 400 }
		],
		end: { kind: 'port', port: 0 },
		chipId: null,
		triggerY: 400
	});
}

function board(traces: Trace[], chips: ChipWiring[] = [], height = 20_000): Board {
	return {
		seed: 7,
		width: 1000,
		height,
		narrow: false,
		heroBottom: 900,
		traces,
		chips
	};
}

/** Calls update every `step` ms from `from` to `to`, both included. Returns the chip states seen. */
function run(g: Growth, from: number, to: number, scrollY = 0, chipId?: string, step = 20) {
	const seen: { at: number; state: string }[] = [];
	for (let now = from; now <= to; now += step) {
		g.update(now, scrollY, VH);
		if (chipId) seen.push({ at: now, state: g.chipState(chipId) });
	}
	return seen;
}

describe('constants', () => {
	it('match the design', () => {
		expect(FRONT_RATIO).toBe(0.9);
		expect(BRANCH_SPEED).toBe(600);
		expect(GROWTH_SPEED).toBe(140);
		expect(MAX_STAGGER_MS).toBe(600);
		expect(BOOT_FALLBACK_MS).toBe(2500);
		expect(SOCKET_MS).toBe(2000);
	});
});

describe('frontAt', () => {
	const HEIGHT = 6000;
	const MAX = HEIGHT - VH;

	it('sits 90% down the viewport for most of the page', () => {
		expect(frontAt(0, VH, HEIGHT)).toBe(900);
		expect(frontAt(2000, VH, HEIGHT)).toBe(2900);
		expect(frontAt(MAX - VH, VH, HEIGHT)).toBe(MAX - VH + 900);
	});

	it('reaches the bottom of the document at the bottom of the scroll', () => {
		expect(frontAt(MAX, VH, HEIGHT)).toBe(HEIGHT);
	});

	it('closes the gap over the last viewport of scroll, never going back', () => {
		let last = -Infinity;
		for (let y = 0; y <= MAX; y += 10) {
			const front = frontAt(y, VH, HEIGHT);
			expect(front).toBeGreaterThanOrEqual(last);
			expect(front).toBeGreaterThanOrEqual(y + 900);
			expect(front).toBeLessThanOrEqual(y + VH);
			last = front;
		}
		expect(frontAt(MAX - VH / 2, VH, HEIGHT)).toBe(MAX - VH / 2 + 950);
	});

	it('covers the whole of a page that does not scroll', () => {
		expect(frontAt(0, VH, 800)).toBe(VH);
	});
});

describe('Growth spine', () => {
	it('draws the spine down to the front at scrollY plus 90% of the viewport', () => {
		const g = new Growth(board([straightSpine('s', 1000, 5000)]));
		expect(g.front).toBe(0);
		g.update(T, 0, VH);
		expect(g.front).toBe(900);
		expect(g.drawn('s')).toBe(0);
		g.update(T, 1000, VH);
		expect(g.front).toBe(1900);
		expect(g.drawn('s')).toBe(900);
		g.update(T, 9000, VH);
		expect(g.drawn('s')).toBe(4000);
		expect(g.isFull('s')).toBe(true);
	});

	it('draws the whole spine at the bottom of the page', () => {
		const g = new Growth(board([straightSpine('s', 1000, 5950)], [], 6000));
		g.update(T, 0, VH);
		g.update(T + 16, 5000, VH);
		expect(g.front).toBe(6000);
		expect(g.isFull('s')).toBe(true);
	});

	it('gives the same length for the same scrollY, whatever came before', () => {
		const fresh = new Growth(board([straightSpine('s', 1000, 5000)]));
		fresh.update(T, 1500, VH);
		const travelled = new Growth(board([straightSpine('s', 1000, 5000)]));
		run(travelled, T, T + 400, 0);
		travelled.update(T + 500, 4000, VH);
		travelled.update(T + 600, 200, VH);
		travelled.update(T + 9000, 1500, VH);
		expect(travelled.drawn('s')).toBe(fresh.drawn('s'));
		expect(fresh.drawn('s')).toBe(1500 + 900 - 1000);
	});

	it('rises with scrollY and falls when scrolling back up', () => {
		const g = new Growth(board([straightSpine('s', 1000, 5000)]));
		const at = (scrollY: number, now: number) => {
			g.update(now, scrollY, VH);
			return g.drawn('s');
		};
		const down = [0, 800, 1600, 2400].map((y, i) => at(y, T + i * 16));
		const up = [1600, 800, 300].map((y, i) => at(y, T + 100 + i * 16));
		expect(down).toEqual([0, 700, 1500, 2300]);
		expect(up).toEqual([1500, 700, 200]);
	});

	it('follows a spine that jogs sideways', () => {
		const g = new Growth(
			board([
				spine('s', [
					{ x: 0, y: 1000 },
					{ x: 0, y: 2000 },
					{ x: 100, y: 2100 },
					{ x: 100, y: 3000 }
				])
			])
		);
		g.update(T, 2050 - 900, VH);
		expect(g.drawn('s')).toBeCloseTo(1000 + 50 * Math.SQRT2);
	});

	it('needs no frames of its own: only scrolling moves it', () => {
		const g = new Growth(board([straightSpine('s', 0, 5000)]));
		expect(g.update(T, 1000, VH)).toBe(false);
		expect(g.animating).toBe(false);
	});

	it('stays full after snapAll, wherever the page scrolls', () => {
		const g = new Growth(board([straightSpine('s', 1000, 5000)]));
		g.snapAll();
		expect(g.drawn('s')).toBe(4000);
		g.update(T, 0, VH);
		expect(g.drawn('s')).toBe(4000);
	});

	it('keeps a snapped spine trace full', () => {
		const g = new Growth(board([straightSpine('s', 1000, 5000), straightSpine('t', 1000, 5000)]));
		g.update(T, 0, VH);
		g.snapToFull(['s']);
		g.update(T + 16, 0, VH);
		expect(g.drawn('s')).toBe(4000);
		expect(g.drawn('t')).toBe(0);
	});
});

describe('Growth latched traces', () => {
	it('starts a branch once the front passes its junction and keeps it drawn', () => {
		const g = new Growth(board([line('b', 140, 1500, 'c'), line('later', 140, 2100, 'c')]));
		run(g, T, T + 2000, 0);
		expect(g.drawn('b')).toBe(0);
		g.update(T + 2000, 900, VH);
		run(g, T + 2000, T + 3000, 900);
		expect(g.isFull('b')).toBe(true);
		expect(g.drawn('later')).toBe(0);
		run(g, T + 3000, T + 4000, 0);
		expect(g.isFull('b')).toBe(true);
	});

	it('grows branches at 600 px/s from the moment the front passes', () => {
		const g = new Growth(board([line('a', 5000, 100, 'c'), line('b', 5000, 100, 'c')]));
		g.update(T, 0, VH);
		expect(g.drawn('a')).toBe(0);
		g.update(T + 1000, 0, VH);
		expect(g.drawn('a')).toBeCloseTo(BRANCH_SPEED);
		expect(g.drawn('b')).toBeCloseTo(BRANCH_SPEED);
	});

	it('keeps a latched trace level with a fast scroll: never shorter than the front is past it', () => {
		const g = new Growth(board([line('b', 5000, 1000, 'c'), line('d', 5000, 1200)]));
		g.update(T, 0, VH);
		// One frame later the front is at 3900, 2900 px past the branch and 2700 past the decoration.
		g.update(T + 16, 3000, VH);
		expect(g.drawn('b')).toBeGreaterThanOrEqual(2900);
		expect(g.drawn('d')).toBeGreaterThanOrEqual(2700);
		// Scrolling on keeps them level; scrolling back up does not shrink them.
		g.update(T + 32, 4000, VH);
		expect(g.drawn('b')).toBeGreaterThanOrEqual(3900);
		g.update(T + 48, 0, VH);
		expect(g.drawn('b')).toBeGreaterThanOrEqual(3900);
	});

	it('lets a trace that is already past the front at load grow in, without a jump', () => {
		const g = new Growth(board([line('b', 5000, 100, 'c')]));
		g.update(T, 0, VH);
		g.update(T + 16, 0, VH);
		expect(g.drawn('b')).toBeCloseTo(16 * 0.6);
	});

	it('boots the last chip once the page is scrolled to the bottom', () => {
		const height = 3000;
		const g = new Growth(
			board(
				[line('f1', 300, height - 60, 'c')],
				[{ id: 'c', top: height - 200, feeders: ['f1'], fallback: false }],
				height
			)
		);
		run(g, T, T + 500, 0);
		expect(g.chipState('c')).toBe('off');
		run(g, T + 500, T + 2000, height - VH);
		expect(g.isFull('f1')).toBe(true);
		expect(g.chipState('c')).toBe('on');
	});

	it('staggers decoration by up to 600 ms, the same way every time', () => {
		const traces = Array.from({ length: 20 }, (_, i) => line(`t${i}`, 5000, 100));
		const make = () => {
			const g = new Growth(board(traces));
			g.update(T, 0, VH);
			g.update(T + MAX_STAGGER_MS + 1000, 0, VH);
			return traces.map((t) => g.drawn(t.id));
		};
		const drawn = make();
		for (const value of drawn) {
			expect(value).toBeGreaterThanOrEqual(140 - 1e-9);
			expect(value).toBeLessThanOrEqual(140 + MAX_STAGGER_MS * 0.14 + 1e-9);
		}
		expect(new Set(drawn).size).toBeGreaterThan(1);
		expect(make()).toEqual(drawn);
	});

	it('never shrinks, not when scrolling back up and not when time steps back', () => {
		const g = new Growth(board([line('a', 5000, 500)]));
		run(g, T, T + 1500);
		const before = g.drawn('a');
		expect(before).toBeGreaterThan(0);
		g.update(T + 1000, 0, VH);
		expect(g.drawn('a')).toBe(before);
		g.update(T + 1600, -5000, VH);
		expect(g.drawn('a')).toBeGreaterThanOrEqual(before);
	});

	it('clamps to the trace length', () => {
		const g = new Growth(board([line('a', 100, 0, 'c')]));
		g.update(T, 0, VH);
		expect(g.drawn('a')).toBe(0);
		g.update(T + 60_000, 0, VH);
		expect(g.drawn('a')).toBe(100);
		expect(g.isFull('a')).toBe(true);
	});

	it('returns 0 for a trace it does not know', () => {
		expect(new Growth(board([])).drawn('nope')).toBe(0);
	});

	it('snaps traces to full on request', () => {
		const g = new Growth(board([line('a', 500, 9000), line('b', 500, 9000)]));
		g.update(T, 0, VH);
		g.snapToFull(['a']);
		expect(g.drawn('a')).toBe(500);
		expect(g.isFull('a')).toBe(true);
		expect(g.drawn('b')).toBe(0);
	});

	it('reports whether anything still moves', () => {
		const g = new Growth(board([line('a', 140, 500, 'c'), line('later', 140, 5000, 'c')]));
		expect(g.update(T, 0, VH)).toBe(true);
		expect(g.animating).toBe(true);
		expect(g.update(T + 5000, 0, VH)).toBe(false);
		expect(g.animating).toBe(false);
		const idle = new Growth(board([line('far', 140, 5000)]));
		expect(idle.update(T, 0, VH)).toBe(false);
	});
});

describe('Growth socket', () => {
	const lengths = [80, 300, 700, 1500, 3000];
	const traces = () => lengths.map((length, i) => socketTrace(`socket:L${i}`, length));

	it('grows every socket trace from the first update and finishes within 2 s', () => {
		const g = new Growth(board(traces()));
		expect(g.drawn('socket:L0')).toBe(0);
		expect(g.update(T, 0, VH)).toBe(true);
		for (const t of traces()) expect(g.drawn(t.id)).toBe(0);
		g.update(T + SOCKET_MS / 2, 0, VH);
		for (const t of traces()) {
			expect(g.drawn(t.id)).toBeGreaterThan(0);
			expect(g.isFull(t.id)).toBe(false);
		}
		let last = -1;
		for (let now = T; now <= T + SOCKET_MS; now += 16) {
			g.update(now, 0, VH);
			const value = g.drawn('socket:L4');
			expect(value).toBeGreaterThanOrEqual(last);
			last = value;
		}
		expect(g.update(T + SOCKET_MS, 0, VH)).toBe(false);
		for (const t of traces()) expect(g.isFull(t.id)).toBe(true);
	});

	it('runs on time alone, whatever the scroll position', () => {
		const a = new Growth(board(traces()));
		const b = new Growth(board(traces()));
		a.update(T, 0, VH);
		b.update(T, 6000, VH);
		a.update(T + 700, 0, VH);
		b.update(T + 700, 200, VH);
		for (const t of traces()) expect(b.drawn(t.id)).toBe(a.drawn(t.id));
		b.update(T + SOCKET_MS, 9000, VH);
		for (const t of traces()) expect(b.isFull(t.id)).toBe(true);
	});

	it('keeps its clock across a relayout', () => {
		const g = new Growth(board(traces()));
		g.update(T, 0, VH);
		g.update(T + 1000, 0, VH);
		const half = g.drawn('socket:L3');
		g.relayout(board(traces()));
		expect(g.drawn('socket:L3')).toBe(half);
		g.update(T + SOCKET_MS, 0, VH);
		for (const t of traces()) expect(g.isFull(t.id)).toBe(true);
	});
});

describe('Growth chips', () => {
	const chip = (feeders: string[], top = 500): ChipWiring => ({
		id: 'c',
		top,
		feeders,
		fallback: feeders.length === 0
	});

	it('boots when the first branch arrives and goes on when all have', () => {
		const g = new Growth(
			board([line('f1', 600, 500, 'c'), line('f2', 1200, 550, 'c')], [chip(['f1', 'f2'])])
		);
		expect(g.chipState('c')).toBe('off');
		const seen = run(g, T, T + 4000, 0, 'c');
		const firstBoot = seen.find((s) => s.state === 'booting')!;
		const firstOn = seen.find((s) => s.state === 'on')!;
		// f1 needs 1 s, f2 2 s.
		expect(firstBoot.at).toBe(T + 1000);
		expect(firstOn.at).toBe(T + 2000);
		expect(seen.filter((s) => s.at < firstBoot.at).every((s) => s.state === 'off')).toBe(true);
	});

	it('goes on 2.5 s after booting when a branch is slow', () => {
		const g = new Growth(
			board([line('f1', 140, 500, 'c'), line('slow', 5000, 500, 'c')], [chip(['f1', 'slow'])])
		);
		const seen = run(g, T, T + 6000, 0, 'c');
		const boot = seen.find((s) => s.state === 'booting')!.at;
		const on = seen.find((s) => s.state === 'on')!.at;
		expect(on - boot).toBeGreaterThanOrEqual(BOOT_FALLBACK_MS);
		expect(on - boot).toBeLessThanOrEqual(BOOT_FALLBACK_MS + 20);
		expect(g.isFull('slow')).toBe(false);
	});

	it('boots a chip without branches on the timer once the front passes its top', () => {
		const g = new Growth(board([], [chip([])]));
		g.update(T, 0, VH);
		expect(g.chipState('c')).toBe('booting');
		g.update(T + BOOT_FALLBACK_MS - 1, 0, VH);
		expect(g.chipState('c')).toBe('booting');
		g.update(T + BOOT_FALLBACK_MS, 0, VH);
		expect(g.chipState('c')).toBe('on');
	});

	it('leaves chips below the front off', () => {
		const g = new Growth(board([], [chip([], 1000)]));
		run(g, T, T + 5000);
		expect(g.chipState('c')).toBe('off');
	});

	it('keeps chips on after scrolling back up', () => {
		const g = new Growth(
			board([straightSpine('s', 900, 5000), line('f1', 140, 2500, 'c')], [chip(['f1'], 2400)])
		);
		run(g, T, T + 2000, 2000);
		expect(g.chipState('c')).toBe('on');
		run(g, T + 2000, T + 3000, 0);
		expect(g.chipState('c')).toBe('on');
		expect(g.isFull('f1')).toBe(true);
		expect(g.drawn('s')).toBe(0);
	});

	it('snaps branches and chips above the front when the page loads scrolled down', () => {
		const g = new Growth(
			board(
				[
					straightSpine('s', 900, 9000),
					line('f1', 500, 1200, 'c'),
					line('d', 500, 3500),
					line('below', 500, 9000, 'c')
				],
				[chip(['f1', 'below'], 1100)]
			)
		);
		g.update(T, 3000, VH);
		expect(g.drawn('s')).toBe(3900 - 900);
		expect(g.drawn('f1')).toBe(500);
		expect(g.drawn('d')).toBe(500);
		expect(g.drawn('below')).toBe(0);
		expect(g.chipState('c')).toBe('on');
	});

	it('does not snap when the page loads at the top', () => {
		const g = new Growth(board([line('f1', 500, 500, 'c')], [chip(['f1'])]));
		g.update(T, 0, VH);
		expect(g.drawn('f1')).toBe(0);
		expect(g.chipState('c')).toBe('off');
	});

	it('turns a chip on when its branches are snapped', () => {
		const g = new Growth(board([line('f1', 500, 500, 'c')], [chip(['f1'])]));
		g.update(T, 0, VH);
		g.snapToFull(['f1']);
		expect(g.chipState('c')).toBe('on');
	});

	it('snaps the whole board, every kind, for reduced motion', () => {
		const g = new Growth(
			board(
				[
					straightSpine('s', 1000, 9000),
					line('f1', 500, 9000, 'c'),
					line('d', 500, 9000),
					socketTrace('socket:T0', 400)
				],
				[chip(['f1'], 9000)]
			)
		);
		g.snapAll();
		for (const id of ['s', 'f1', 'd', 'socket:T0']) expect(g.isFull(id), id).toBe(true);
		expect(g.chipState('c')).toBe('on');
		expect(g.update(T, 0, VH)).toBe(false);
		for (const id of ['s', 'f1', 'd', 'socket:T0']) expect(g.isFull(id), id).toBe(true);
	});

	it('returns off for a chip it does not know', () => {
		expect(new Growth(board([])).chipState('nope')).toBe('off');
	});
});

describe('Growth relayout', () => {
	it('keeps booted chips full and carries progress over by trace id', () => {
		const g = new Growth(
			board(
				[line('f1', 140, 500, 'c'), line('d', 5000, 500), line('g1', 5000, 500, 'e')],
				[
					{ id: 'c', top: 500, feeders: ['f1'], fallback: false },
					{ id: 'e', top: 500, feeders: ['g1'], fallback: false }
				]
			)
		);
		run(g, T, T + 2000);
		expect(g.chipState('c')).toBe('on');
		const d = g.drawn('d');
		const g1 = g.drawn('g1');
		expect(d).toBeGreaterThan(0);

		// The chip moved: its branches got longer and one more came along.
		g.relayout(
			board(
				[
					line('f1', 400, 1200, 'c'),
					line('f9', 400, 1200, 'c'),
					line('d', 5000, 500),
					line('g1', 5000, 1200, 'e'),
					line('new', 500, 5000)
				],
				[
					{ id: 'c', top: 1200, feeders: ['f1', 'f9'], fallback: false },
					{ id: 'e', top: 1200, feeders: ['g1'], fallback: false }
				]
			)
		);
		expect(g.chipState('c')).toBe('on');
		expect(g.drawn('f1')).toBe(400);
		expect(g.drawn('f9')).toBe(400);
		expect(g.drawn('d')).toBe(d);
		expect(g.drawn('g1')).toBe(g1);
		expect(g.chipState('e')).toBe('off');
		expect(g.drawn('new')).toBe(0);

		g.update(T + 2500, 0, VH);
		expect(g.drawn('d')).toBeGreaterThan(d);
	});

	it('clamps carried progress to the new length', () => {
		const g = new Growth(board([line('d', 5000, 500)]));
		run(g, T, T + 3000);
		g.relayout(board([line('d', 50, 500)]));
		expect(g.drawn('d')).toBe(50);
	});

	it('measures a relaid spine against the last front right away', () => {
		const g = new Growth(board([straightSpine('s', 1000, 5000)]));
		g.update(T, 1000, VH);
		expect(g.drawn('s')).toBe(900);
		g.relayout(board([straightSpine('s', 1200, 5000)]));
		expect(g.drawn('s')).toBe(700);
	});

	it('stays static after a relayout under reduced motion', () => {
		const g = new Growth(board([straightSpine('s', 1000, 5000)]));
		g.snapAll();
		g.relayout(board([straightSpine('s', 1000, 6000), line('new', 300, 9000)]));
		expect(g.drawn('s')).toBe(5000);
		expect(g.drawn('new')).toBe(300);
	});
});
