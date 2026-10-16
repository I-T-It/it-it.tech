import { describe, expect, it } from 'vitest';
import { SOCKET_DRAW_MS } from '../pcb/growth.js';
import { createRng } from '../pcb/rng.js';
import {
	FIRST_TEASER_MAX_MS,
	FIRST_TEASER_MIN_MS,
	FLICKER_MS,
	FLICKER_SHARE,
	GLITCH_START_AFTER_POWER_MS,
	HOLD_MAX_MS,
	HOLD_MIN_MS,
	MAX_BAND_AREA,
	MAX_TRANSITIONS_PER_S,
	MIN_FRAME_MS,
	SWAP_CLEAR_MS,
	SWAP_GLITCH_MAX_MS,
	SWAP_GLITCH_MIN_MS,
	TEASER_GAP_MS,
	TEASER_MAX_MS,
	TEASER_MIN_MS,
	WAIT_MAX_MS,
	WAIT_MIN_MS,
	maxTransitionsInWindow,
	nextCycle,
	wholeImageTransitions,
	type Cycle,
	type GlitchEvent
} from './schedule.js';

const cycleOf = (seed: number, start = 0, options?: { avatar?: boolean }): Cycle =>
	nextCycle(createRng(seed), start, options);

/** Cycle after cycle for `minutes` of simulated time, like the component plays them. */
function timeline(seed: number, minutes: number): GlitchEvent[] {
	const rng = createRng(seed);
	const events: GlitchEvent[] = [];
	let start = 0;
	while (start < minutes * 60_000) {
		const cycle = nextCycle(rng, start);
		events.push(...cycle.events);
		start = cycle.end;
	}
	return events;
}

const kinds = (events: GlitchEvent[], ...wanted: GlitchEvent['kind'][]) =>
	events.filter((e) => wanted.includes(e.kind));
const seeds = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

describe('constants', () => {
	it('hold the numbers of the plan', () => {
		expect([TEASER_MIN_MS, TEASER_MAX_MS, TEASER_GAP_MS, SWAP_CLEAR_MS]).toEqual([
			150, 300, 4000, 3000
		]);
		expect([SWAP_GLITCH_MIN_MS, SWAP_GLITCH_MAX_MS, HOLD_MIN_MS, HOLD_MAX_MS]).toEqual([
			500, 700, 3000, 5000
		]);
		expect([WAIT_MIN_MS, WAIT_MAX_MS, FIRST_TEASER_MIN_MS, FIRST_TEASER_MAX_MS]).toEqual([
			20_000, 40_000, 4000, 8000
		]);
		expect([FLICKER_MS, FLICKER_SHARE, MAX_TRANSITIONS_PER_S, MAX_BAND_AREA, MIN_FRAME_MS]).toEqual(
			[100, 1 / 3, 4, 0.08, 60]
		);
	});

	it('starts the glitch when the scroll link is fully in: the socket draw plus 2.6 s after the power', () => {
		expect(GLITCH_START_AFTER_POWER_MS).toBe(SOCKET_DRAW_MS + 2600);
	});
});

describe('a cycle', () => {
	it('is the same for the same seed and different for another', () => {
		expect(cycleOf(7)).toEqual(cycleOf(7));
		expect(cycleOf(7)).not.toEqual(cycleOf(8));
	});

	it('is placed from the start it is given', () => {
		const a = cycleOf(3, 0);
		const b = cycleOf(3, 12_345);
		expect(b.end - 12_345).toBe(a.end);
		expect(b.events.map((e) => e.at - 12_345)).toEqual(a.events.map((e) => e.at));
		expect(b.events.map((e) => e.frames)).toEqual(a.events.map((e) => e.frames));
	});

	it('has its first teaser 4 to 8 s in and its swap 20 to 40 s in', () => {
		for (const seed of seeds(500)) {
			const { events } = cycleOf(seed, 1000);
			const first = events[0];
			expect(['tease', 'flicker']).toContain(first.kind);
			expect(first.at - 1000).toBeGreaterThanOrEqual(FIRST_TEASER_MIN_MS);
			expect(first.at - 1000).toBeLessThanOrEqual(FIRST_TEASER_MAX_MS);
			const swapIn = events.find((e) => e.kind === 'swap-in')!;
			expect(swapIn.at - 1000).toBeGreaterThanOrEqual(WAIT_MIN_MS);
			expect(swapIn.at - 1000).toBeLessThanOrEqual(WAIT_MAX_MS);
		}
	});

	it('lists its events in order, none overlapping, ending where the swap-out ends', () => {
		for (const seed of seeds(300)) {
			const { events, end } = cycleOf(seed);
			expect(events.at(-1)!.kind).toBe('swap-out');
			expect(events.at(-2)!.kind).toBe('swap-in');
			for (let i = 1; i < events.length; i++) {
				expect(events[i].at).toBeGreaterThanOrEqual(events[i - 1].at + events[i - 1].duration);
			}
			expect(end).toBe(events.at(-1)!.at + events.at(-1)!.duration);
		}
	});

	it('has 1 to 3 teasers of 150 to 300 ms, at least 4 s apart', () => {
		for (const seed of seeds(1000)) {
			const teasers = kinds(cycleOf(seed).events, 'tease', 'flicker');
			expect(teasers.length).toBeGreaterThanOrEqual(1);
			expect(teasers.length).toBeLessThanOrEqual(3);
			for (const t of teasers) {
				expect(t.duration).toBeGreaterThanOrEqual(TEASER_MIN_MS);
				expect(t.duration).toBeLessThanOrEqual(TEASER_MAX_MS);
			}
			for (let i = 1; i < teasers.length; i++) {
				const gap = teasers[i].at - (teasers[i - 1].at + teasers[i - 1].duration);
				expect(gap).toBeGreaterThanOrEqual(TEASER_GAP_MS);
			}
		}
	});

	it('does not always have the same number of teasers: 1, 2 and 3 all happen', () => {
		const counts = new Set(
			seeds(500).map((seed) => kinds(cycleOf(seed).events, 'tease', 'flicker').length)
		);
		expect([...counts].sort()).toEqual([1, 2, 3]);
	});

	it('keeps every teaser 3 s clear of a swap glitch, before and after it', () => {
		for (const seed of seeds(300)) {
			const events = timeline(seed, 10);
			events.forEach((e, i) => {
				if (e.kind !== 'tease' && e.kind !== 'flicker') return;
				const before = events[i - 1];
				const after = events[i + 1];
				if (before?.kind === 'swap-out' || before?.kind === 'swap-in') {
					expect(e.at - (before.at + before.duration)).toBeGreaterThanOrEqual(SWAP_CLEAR_MS);
				}
				if (after?.kind === 'swap-in' || after?.kind === 'swap-out') {
					expect(after.at - (e.at + e.duration)).toBeGreaterThanOrEqual(SWAP_CLEAR_MS);
				}
			});
		}
	});

	it('swaps in for 500 to 700 ms, holds 3 to 5 s, and swaps out for 500 to 700 ms', () => {
		for (const seed of seeds(500)) {
			const { events } = cycleOf(seed);
			const swapIn = events.at(-2)!;
			const swapOut = events.at(-1)!;
			for (const swap of [swapIn, swapOut]) {
				expect(swap.duration).toBeGreaterThanOrEqual(SWAP_GLITCH_MIN_MS);
				expect(swap.duration).toBeLessThanOrEqual(SWAP_GLITCH_MAX_MS);
			}
			const hold = swapOut.at - (swapIn.at + swapIn.duration);
			expect(hold).toBeGreaterThanOrEqual(HOLD_MIN_MS);
			expect(hold).toBeLessThanOrEqual(HOLD_MAX_MS);
		}
	});

	it('changes the whole image exactly once in a swap, at the middle of the glitch', () => {
		for (const seed of seeds(300)) {
			const { events } = cycleOf(seed);
			const swapIn = events.at(-2)!;
			const swapOut = events.at(-1)!;
			const changes = (e: GlitchEvent, from: 'photo' | 'avatar') => {
				const shown = e.frames.map((f) => f.show);
				return shown.filter((s, i) => s !== (i === 0 ? from : shown[i - 1])).length;
			};
			expect(changes(swapIn, 'photo')).toBe(1);
			expect(changes(swapOut, 'avatar')).toBe(1);
			const turn = (e: GlitchEvent, to: 'photo' | 'avatar') =>
				e.frames.find((f) => f.show === to)!.at;
			expect(turn(swapIn, 'avatar')).toBe(Math.round(swapIn.duration / 2));
			expect(turn(swapOut, 'photo')).toBe(Math.round(swapOut.duration / 2));
			expect(swapIn.frames.at(-1)!.show).toBe('avatar');
			expect(swapOut.frames.at(-1)!.show).toBe('photo');
		}
	});

	it('tears the photo only in a plain teaser: it never shows the avatar', () => {
		for (const seed of seeds(300)) {
			for (const e of kinds(cycleOf(seed).events, 'tease')) {
				expect(e.frames.every((f) => f.show === 'photo')).toBe(true);
				expect(e.frames.every((f) => f.bands.every((b) => b.source === 'photo'))).toBe(true);
			}
		}
	});
});

describe('flickers', () => {
	it('are about 1 teaser in 3', () => {
		let teasers = 0;
		let flickers = 0;
		for (const seed of seeds(3000)) {
			const found = kinds(cycleOf(seed).events, 'tease', 'flicker');
			teasers += found.length;
			flickers += found.filter((e) => e.kind === 'flicker').length;
		}
		expect(flickers / teasers).toBeGreaterThan(0.25);
		expect(flickers / teasers).toBeLessThan(0.42);
	});

	it('show the avatar for 100 ms, with two whole-image changes and the photo back at the end', () => {
		let seen = 0;
		for (const seed of seeds(1000)) {
			for (const e of kinds(cycleOf(seed).events, 'flicker')) {
				seen++;
				const shown = e.frames.map((f) => f.show);
				const first = shown.indexOf('avatar');
				const last = shown.lastIndexOf('avatar');
				expect(first).toBeGreaterThan(0);
				expect(last).toBe(first);
				expect(e.frames[first + 1].show).toBe('photo');
				const lit = e.frames[first + 1].at - e.frames[first].at;
				expect(lit).toBeGreaterThanOrEqual(FLICKER_MS - 10);
				expect(lit).toBeLessThanOrEqual(FLICKER_MS + 10);
				expect(e.frames.at(-1)!.show).toBe('photo');
				expect(wholeImageTransitions([e])).toHaveLength(2);
			}
		}
		expect(seen).toBeGreaterThan(100);
	});

	it('put the avatar in the middle of the teaser', () => {
		for (const seed of seeds(300)) {
			for (const e of kinds(cycleOf(seed).events, 'flicker')) {
				const on = e.frames.find((f) => f.show === 'avatar')!.at;
				const off = on + FLICKER_MS;
				expect(on).toBeGreaterThanOrEqual(MIN_FRAME_MS);
				expect(Math.abs(on - (e.duration - off))).toBeLessThanOrEqual(1);
			}
		}
	});
});

describe('frames', () => {
	it('start at 0, stay inside the event and come at least 60 ms apart', () => {
		for (const seed of seeds(300)) {
			for (const e of cycleOf(seed).events) {
				expect(e.frames[0].at).toBe(0);
				for (let i = 0; i < e.frames.length; i++) {
					expect(e.frames[i].at).toBeLessThan(e.duration);
					if (i > 0) {
						expect(e.frames[i].at - e.frames[i - 1].at).toBeGreaterThanOrEqual(MIN_FRAME_MS);
					}
				}
			}
		}
	});

	it('cover at most 8% of the die with bands, inside the die, tinted cyan or green only', () => {
		const tints = new Set<string>();
		for (const seed of seeds(300)) {
			for (const e of cycleOf(seed).events) {
				for (const frame of e.frames) {
					expect(frame.bands).toHaveLength(3);
					const area = frame.bands.reduce((sum, b) => sum + b.height, 0);
					expect(area).toBeLessThanOrEqual(MAX_BAND_AREA);
					for (const band of frame.bands) {
						expect(band.height).toBeGreaterThan(0);
						expect(band.top).toBeGreaterThanOrEqual(0);
						expect(band.top + band.height).toBeLessThanOrEqual(1);
						expect(Math.abs(band.shift)).toBeGreaterThan(0);
						expect(Math.abs(band.shift)).toBeLessThan(0.25);
						tints.add(band.tint);
					}
				}
			}
		}
		expect([...tints].sort()).toEqual(['cyan', 'green']);
	});

	it('mix the other image into the bands of a swap: avatar strips going in, photo strips coming out', () => {
		for (const seed of seeds(100)) {
			const { events } = cycleOf(seed);
			for (const swap of events.slice(-2)) {
				for (const frame of swap.frames) {
					const other = frame.show === 'photo' ? 'avatar' : 'photo';
					expect(frame.bands.every((b) => b.source === other)).toBe(true);
				}
			}
		}
	});
});

describe('flash budget (WCAG 2.3.1)', () => {
	it('counts the whole-image changes of a timeline', () => {
		const frame = (at: number, show: 'photo' | 'avatar') => ({ at, show, bands: [] });
		const events: GlitchEvent[] = [
			{
				at: 1000,
				kind: 'flicker',
				duration: 300,
				frames: [frame(0, 'photo'), frame(100, 'avatar'), frame(200, 'photo')]
			},
			{
				at: 9000,
				kind: 'swap-in',
				duration: 600,
				frames: [frame(0, 'photo'), frame(300, 'avatar')]
			},
			{
				at: 14_000,
				kind: 'swap-out',
				duration: 600,
				frames: [frame(0, 'avatar'), frame(300, 'photo')]
			}
		];
		expect(wholeImageTransitions(events)).toEqual([
			{ at: 1100, to: 'avatar' },
			{ at: 1200, to: 'photo' },
			{ at: 9300, to: 'avatar' },
			{ at: 14_300, to: 'photo' }
		]);
	});

	it('finds the busiest window', () => {
		const frame = (at: number, show: 'photo' | 'avatar') => ({ at, show, bands: [] });
		const events: GlitchEvent[] = [
			{
				at: 0,
				kind: 'flicker',
				duration: 300,
				frames: [frame(0, 'photo'), frame(100, 'avatar'), frame(200, 'photo')]
			},
			{
				at: 1000,
				kind: 'flicker',
				duration: 300,
				frames: [frame(0, 'photo'), frame(100, 'avatar'), frame(200, 'photo')]
			}
		];
		// Changes at 100, 200, 1100 and 1200. A window is 1000 ms long, its end not included.
		expect(maxTransitionsInWindow(events, 1000)).toBe(2);
		expect(maxTransitionsInWindow(events, 1001)).toBe(3);
		expect(maxTransitionsInWindow(events, 1101)).toBe(4);
		expect(maxTransitionsInWindow([], 1000)).toBe(0);
	});

	it('keeps every simulated 10 minutes within 4 changes per second, and in practice within 2', () => {
		let busiest = 0;
		for (const seed of seeds(1000)) {
			busiest = Math.max(busiest, maxTransitionsInWindow(timeline(seed, 10), 1000));
		}
		expect(busiest).toBeLessThanOrEqual(MAX_TRANSITIONS_PER_S);
		expect(busiest).toBe(2);
	});
});

describe('a cycle without the avatar', () => {
	it('has plain teasers only and ends where the swap would have started', () => {
		for (const seed of seeds(300)) {
			const { events, end } = cycleOf(seed, 500, { avatar: false });
			expect(events.length).toBeGreaterThanOrEqual(1);
			expect(events.every((e) => e.kind === 'tease')).toBe(true);
			expect(events.every((e) => e.frames.every((f) => f.show === 'photo'))).toBe(true);
			expect(end - 500).toBeGreaterThanOrEqual(WAIT_MIN_MS);
			expect(end - 500).toBeLessThanOrEqual(WAIT_MAX_MS);
			const last = events.at(-1)!;
			expect(end - (last.at + last.duration)).toBeGreaterThanOrEqual(SWAP_CLEAR_MS);
		}
	});
});
