import { describe, expect, it } from 'vitest';
import { BOOT_FALLBACK_MS, Growth, GROWTH_SPEED, MAX_STAGGER_MS, TRIGGER_RATIO } from './growth.js';
import { makeTrace, type Board, type ChipWiring, type Trace } from './layout.js';

const VH = 1000;
const T = 10_000;

/** A straight trace of `length` px that triggers at `triggerY`. */
function line(id: string, length: number, triggerY: number, chipId: string | null = null): Trace {
	return makeTrace({
		id,
		kind: chipId ? 'feeder' : 'decor',
		side: 'left',
		bus: id,
		points: [
			{ x: 0, y: triggerY + 10 },
			{ x: length, y: triggerY + 10 }
		],
		end: chipId ? { kind: 'pin', chipId, pin: 0 } : { kind: 'via' },
		chipId,
		triggerY
	});
}

function board(traces: Trace[], chips: ChipWiring[] = []): Board {
	return { seed: 7, width: 1000, height: 20_000, narrow: false, traces, chips };
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
		expect(GROWTH_SPEED).toBe(140);
		expect(MAX_STAGGER_MS).toBe(600);
		expect(TRIGGER_RATIO).toBe(0.85);
		expect(BOOT_FALLBACK_MS).toBe(2500);
	});
});

describe('Growth traces', () => {
	it('starts a trace once its top passes 85% of the viewport', () => {
		const g = new Growth(board([line('in', 1000, 849), line('out', 1000, 851)]));
		run(g, T, T + 2000);
		expect(g.drawn('in')).toBeGreaterThan(0);
		expect(g.drawn('out')).toBe(0);
		run(g, T + 2000, T + 3000, 10);
		expect(g.drawn('out')).toBeGreaterThan(0);
	});

	it('grows at 140 px/s after a stagger of at most 600 ms', () => {
		const traces = Array.from({ length: 20 }, (_, i) => line(`t${i}`, 5000, 100));
		const g = new Growth(board(traces));
		g.update(T, 0, VH);
		for (const t of traces) expect(g.drawn(t.id)).toBe(0);
		g.update(T + MAX_STAGGER_MS + 1000, 0, VH);
		const drawn = traces.map((t) => g.drawn(t.id));
		for (const value of drawn) {
			expect(value).toBeGreaterThanOrEqual(140 - 1e-9);
			expect(value).toBeLessThanOrEqual(140 + MAX_STAGGER_MS * 0.14 + 1e-9);
		}
		expect(new Set(drawn).size).toBeGreaterThan(1);
	});

	it('staggers the same way every time', () => {
		const make = () => {
			const g = new Growth(board([line('a', 5000, 100), line('b', 5000, 100)]));
			g.update(T, 0, VH);
			g.update(T + 700, 0, VH);
			return [g.drawn('a'), g.drawn('b')];
		};
		expect(make()).toEqual(make());
	});

	it('never shrinks, not when scrolling back up and not when time steps back', () => {
		const g = new Growth(board([line('a', 5000, 800)]));
		run(g, T, T + 1500);
		const before = g.drawn('a');
		expect(before).toBeGreaterThan(0);
		g.update(T + 1000, 0, VH);
		expect(g.drawn('a')).toBe(before);
		g.update(T + 1600, -5000, VH);
		expect(g.drawn('a')).toBeGreaterThanOrEqual(before);
	});

	it('clamps to the trace length', () => {
		const g = new Growth(board([line('a', 100, 0)]));
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
		const g = new Growth(board([line('a', 140, 800), line('later', 140, 5000)]));
		expect(g.update(T, 0, VH)).toBe(true);
		expect(g.animating).toBe(true);
		expect(g.update(T + 5000, 0, VH)).toBe(false);
		expect(g.animating).toBe(false);
		const idle = new Growth(board([line('far', 140, 5000)]));
		expect(idle.update(T, 0, VH)).toBe(false);
	});
});

describe('Growth chips', () => {
	const chip = (feeders: string[], top = 800): ChipWiring => ({
		id: 'c',
		top,
		feeders,
		fallback: feeders.length === 0
	});

	it('boots when the first feeder arrives and goes on when all have', () => {
		const g = new Growth(
			board([line('f1', 140, 800, 'c'), line('f2', 280, 800, 'c')], [chip(['f1', 'f2'])])
		);
		expect(g.chipState('c')).toBe('off');
		const seen = run(g, T, T + 4000, 0, 'c');
		const firstBoot = seen.find((s) => s.state === 'booting')!;
		const firstOn = seen.find((s) => s.state === 'on')!;
		expect(firstBoot).toBeDefined();
		expect(firstOn.at).toBeGreaterThan(firstBoot.at);
		// f1 needs 1 s, f2 2 s, each after a stagger of up to 600 ms.
		expect(firstBoot.at).toBeGreaterThanOrEqual(T + 1000);
		expect(firstBoot.at).toBeLessThanOrEqual(T + 1600 + 20);
		expect(firstOn.at).toBeGreaterThanOrEqual(T + 2000);
		expect(firstOn.at).toBeLessThanOrEqual(T + 2600 + 20);
		expect(seen.filter((s) => s.at < firstBoot.at).every((s) => s.state === 'off')).toBe(true);
	});

	it('goes on 2.5 s after booting when a feeder is slow', () => {
		const g = new Growth(
			board([line('f1', 140, 800, 'c'), line('slow', 5000, 800, 'c')], [chip(['f1', 'slow'])])
		);
		const seen = run(g, T, T + 6000, 0, 'c');
		const boot = seen.find((s) => s.state === 'booting')!.at;
		const on = seen.find((s) => s.state === 'on')!.at;
		expect(on - boot).toBeGreaterThanOrEqual(BOOT_FALLBACK_MS);
		expect(on - boot).toBeLessThanOrEqual(BOOT_FALLBACK_MS + 20);
		expect(g.isFull('slow')).toBe(false);
	});

	it('boots a chip without feeders on the timer alone', () => {
		const g = new Growth(board([], [chip([])]));
		g.update(T, 0, VH);
		expect(g.chipState('c')).toBe('booting');
		g.update(T + BOOT_FALLBACK_MS - 1, 0, VH);
		expect(g.chipState('c')).toBe('booting');
		g.update(T + BOOT_FALLBACK_MS, 0, VH);
		expect(g.chipState('c')).toBe('on');
	});

	it('leaves chips below the trigger line off', () => {
		const g = new Growth(board([], [chip([], 900)]));
		run(g, T, T + 5000);
		expect(g.chipState('c')).toBe('off');
	});

	it('snaps everything above the line when the page loads scrolled down', () => {
		const g = new Growth(
			board(
				[line('f1', 500, 500, 'c'), line('d', 500, 3700), line('below', 500, 9000)],
				[chip(['f1'], 500)]
			)
		);
		g.update(T, 3000, VH);
		expect(g.drawn('f1')).toBe(500);
		expect(g.drawn('d')).toBe(500);
		expect(g.drawn('below')).toBe(0);
		expect(g.chipState('c')).toBe('on');
	});

	it('does not snap when the page loads at the top', () => {
		const g = new Growth(board([line('f1', 500, 500, 'c')], [chip(['f1'], 500)]));
		g.update(T, 0, VH);
		expect(g.drawn('f1')).toBe(0);
		expect(g.chipState('c')).toBe('off');
	});

	it('turns a chip on when its feeders are snapped', () => {
		const g = new Growth(board([line('f1', 500, 800, 'c')], [chip(['f1'])]));
		g.update(T, 0, VH);
		g.snapToFull(['f1']);
		expect(g.chipState('c')).toBe('on');
	});

	it('snaps the whole board for reduced motion', () => {
		const g = new Growth(
			board([line('f1', 500, 9000, 'c'), line('d', 500, 9000)], [chip(['f1'], 9000)])
		);
		g.snapAll();
		expect(g.drawn('f1')).toBe(500);
		expect(g.drawn('d')).toBe(500);
		expect(g.chipState('c')).toBe('on');
		expect(g.update(T, 0, VH)).toBe(false);
	});

	it('returns off for a chip it does not know', () => {
		expect(new Growth(board([])).chipState('nope')).toBe('off');
	});
});

describe('Growth relayout', () => {
	it('keeps booted chips full and carries progress over by trace id', () => {
		const g = new Growth(
			board(
				[line('f1', 140, 800, 'c'), line('d', 5000, 800), line('g1', 5000, 800, 'e')],
				[
					{ id: 'c', top: 800, feeders: ['f1'], fallback: false },
					{ id: 'e', top: 800, feeders: ['g1'], fallback: false }
				]
			)
		);
		run(g, T, T + 2000);
		expect(g.chipState('c')).toBe('on');
		const d = g.drawn('d');
		const g1 = g.drawn('g1');
		expect(d).toBeGreaterThan(0);

		// The chip moved: its feeders got longer and one more came along.
		g.relayout(
			board(
				[
					line('f1', 400, 1200, 'c'),
					line('f9', 400, 1200, 'c'),
					line('d', 5000, 800),
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
		const g = new Growth(board([line('d', 5000, 800)]));
		run(g, T, T + 3000);
		g.relayout(board([line('d', 50, 800)]));
		expect(g.drawn('d')).toBe(50);
	});
});
