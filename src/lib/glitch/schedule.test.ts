import { describe, expect, it } from 'vitest';
import { SOCKET_DRAW_MS } from '../pcb/growth.js';
import { createRng } from '../pcb/rng.js';
import {
	AVATAR_FRAGMENT_SHARE,
	BLOCK_LOOKS,
	FIRST_TEASER_MAX_MS,
	FIRST_TEASER_MIN_MS,
	FLICKER_MS,
	FLICKER_SHARE,
	GLITCH_START_AFTER_POWER_MS,
	HOLD_MAX_MS,
	HOLD_MIN_MS,
	MAX_FLASHES_PER_S,
	MAX_SPILL,
	MAX_SWAP_AREA,
	MAX_TEASE_AREA,
	MAX_TRANSITIONS_PER_S,
	MIN_FRAME_MS,
	SWAP_CLEAR_MS,
	SWAP_FRAMES,
	SWAP_GLITCH_MAX_MS,
	SWAP_GLITCH_MIN_MS,
	TEASER_GAP_MS,
	TEASER_MAX_MS,
	TEASER_MIN_MS,
	TINTS,
	TINT_RGB,
	WAIT_MAX_MS,
	WAIT_MIN_MS,
	frameArea,
	frameTransitions,
	maxTransitionsInWindow,
	nextCycle,
	spillArea,
	wholeImageTransitions,
	type Cycle,
	type Frame,
	type GlitchEvent,
	type Shown,
	type Slice
} from './schedule.js';

const cycleOf = (seed: number, start = 0, options?: { avatar?: boolean }): Cycle =>
	nextCycle(createRng(seed), start, options);

/**
 * Cycle after cycle for `minutes` of simulated time, like the component plays them. Planning a
 * cycle is the expensive part (each frame is fitted to its area cap), and the budget tests all walk
 * the same timelines, so each one is planned once per file. The result is read-only.
 */
const timelines = new Map<string, readonly GlitchEvent[]>();
function timeline(
	seed: number,
	minutes: number,
	options?: { avatar?: boolean }
): readonly GlitchEvent[] {
	const key = `${seed}:${minutes}:${options?.avatar ?? true}`;
	let events = timelines.get(key);
	if (!events) {
		const rng = createRng(seed);
		const planned: GlitchEvent[] = [];
		let start = 0;
		while (start < minutes * 60_000) {
			const cycle = nextCycle(rng, start, options);
			planned.push(...cycle.events);
			start = cycle.end;
		}
		events = planned;
		timelines.set(key, events);
	}
	return events;
}

/**
 * How many seeds the 10 minute timelines run over. A timeline is about 17 cycles, so this is a few
 * thousand cycles and tens of thousands of frames; single cycles run over more seeds further down.
 */
const TIMELINE_SEEDS = 250;

const kinds = (events: GlitchEvent[], ...wanted: GlitchEvent['kind'][]) =>
	events.filter((e) => wanted.includes(e.kind));
const seeds = (count: number) => Array.from({ length: count }, (_, i) => i + 1);
const fragmentsOf = (frame: Frame) => [...frame.slices, ...frame.blocks];

const slice = (over: Partial<Slice> = {}): Slice => ({
	top: 0.1,
	height: 0.1,
	shift: 0.2,
	source: 'photo',
	cast: false,
	split: false,
	spill: true,
	tint: 'cyan',
	...over
});

/** A frame that changes the picture, for the tests of the counting itself. */
const frame = (at: number, show: Shown, shift = 0.2): Frame => ({
	at,
	show,
	slices: [slice({ shift })],
	blocks: []
});

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
		expect([FLICKER_MS, FLICKER_SHARE, MIN_FRAME_MS]).toEqual([100, 1 / 3, 60]);
	});

	it('allow 3 flashes in any second, and a flash is two changes of the picture', () => {
		expect(MAX_FLASHES_PER_S).toBe(3);
		expect(MAX_TRANSITIONS_PER_S).toBe(2 * MAX_FLASHES_PER_S);
	});

	it('size the disturbance: how much of the die, how far past it, how many frames in a swap', () => {
		expect([MAX_TEASE_AREA, MAX_SWAP_AREA, MAX_SPILL, SWAP_FRAMES]).toEqual([0.4, 0.65, 0.55, 5]);
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
		for (const seed of seeds(TIMELINE_SEEDS)) {
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

	it('has the photo underneath in a plain teaser: the whole image never changes', () => {
		for (const seed of seeds(300)) {
			for (const e of kinds(cycleOf(seed).events, 'tease')) {
				expect(e.frames.every((f) => f.show === 'photo')).toBe(true);
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

	it('hold whole slices and rectangular blocks, always at least two slices and one block', () => {
		for (const seed of seeds(200)) {
			for (const e of cycleOf(seed).events) {
				for (const f of e.frames) {
					expect(f.slices.length).toBeGreaterThanOrEqual(2);
					expect(f.blocks.length).toBeGreaterThanOrEqual(1);
					for (const s of f.slices) {
						expect(s.height).toBeGreaterThan(0);
						expect(s.top).toBeGreaterThanOrEqual(0);
						expect(s.top + s.height).toBeLessThanOrEqual(1);
					}
					for (const b of f.blocks) {
						expect(b.width).toBeGreaterThan(0);
						expect(b.height).toBeGreaterThan(0);
						expect(b.top).toBeGreaterThanOrEqual(0);
						expect(b.top + b.height).toBeLessThanOrEqual(1);
					}
				}
			}
		}
	});

	it('throw slices sideways by a lot: from a few percent of the die to over half of what is allowed', () => {
		let largest = 0;
		for (const seed of seeds(300)) {
			for (const e of cycleOf(seed).events) {
				for (const f of e.frames) {
					for (const s of f.slices) {
						expect(Math.abs(s.shift)).toBeGreaterThanOrEqual(0.05);
						expect(Math.abs(s.shift)).toBeLessThanOrEqual(MAX_SPILL);
						largest = Math.max(largest, Math.abs(s.shift));
					}
				}
			}
		}
		expect(largest).toBeGreaterThan(0.4);
	});

	it('let fragments spill out of the die sideways, never above or below it, and never far', () => {
		let spilled = 0;
		let inside = 0;
		let clipped = 0;
		for (const seed of seeds(300)) {
			for (const e of cycleOf(seed).events) {
				for (const f of e.frames) {
					for (const s of f.slices) {
						expect(s.shift + 1).toBeLessThanOrEqual(1 + MAX_SPILL);
						expect(s.shift).toBeGreaterThanOrEqual(-MAX_SPILL);
						if (!s.spill) clipped++;
					}
					for (const b of f.blocks) {
						expect(b.left).toBeGreaterThanOrEqual(-MAX_SPILL);
						expect(b.left + b.width).toBeLessThanOrEqual(1 + MAX_SPILL);
					}
					if (spillArea(f) > 0) spilled++;
					else inside++;
				}
			}
		}
		// Most frames have something out on the board, some do not, and some slices are cut at the die.
		expect(spilled).toBeGreaterThan(inside);
		expect(inside).toBeGreaterThan(0);
		expect(clipped).toBeGreaterThan(100);
	});

	it('show the picture behind every block: the image is big enough to fill its window', () => {
		for (const seed of seeds(300)) {
			for (const e of cycleOf(seed).events) {
				for (const f of e.frames) {
					for (const b of f.blocks) {
						// The image sits at dx, dy and is one die across: it must cover the block.
						expect(b.dx).toBeLessThanOrEqual(b.left + 1e-9);
						expect(b.dx + 1).toBeGreaterThanOrEqual(b.left + b.width - 1e-9);
						expect(b.dy).toBeLessThanOrEqual(b.top + 1e-9);
						expect(b.dy + 1).toBeGreaterThanOrEqual(b.top + b.height - 1e-9);
					}
				}
			}
		}
	});

	it('cover at most 40% of the die in a teaser and 65% in a swap, counting what spills', () => {
		let teaserMost = 0;
		let swapMost = 0;
		for (const seed of seeds(300)) {
			for (const e of cycleOf(seed).events) {
				const swap = e.kind === 'swap-in' || e.kind === 'swap-out';
				for (const f of e.frames) {
					const area = frameArea(f);
					expect(area).toBeGreaterThan(0.05);
					expect(area).toBeLessThanOrEqual(swap ? MAX_SWAP_AREA : MAX_TEASE_AREA);
					if (swap) swapMost = Math.max(swapMost, area);
					else teaserMost = Math.max(teaserMost, area);
				}
			}
		}
		// Big, not just allowed to be: the old thin bands covered 8%.
		expect(teaserMost).toBeGreaterThan(0.25);
		expect(swapMost).toBeGreaterThan(0.5);
	});

	it('measure the union: overlapping fragments count once, the part outside the die counts too', () => {
		const one = (over: Partial<Slice>): Frame => ({
			at: 0,
			show: 'photo',
			slices: [slice({ top: 0, height: 0.2, shift: 0, ...over })],
			blocks: []
		});
		expect(frameArea(one({}))).toBeCloseTo(0.2, 10);
		expect(spillArea(one({}))).toBe(0);
		// Shifted half a die to the right: still 0.2 of a die in area, and 0.1 of it is outside.
		expect(frameArea(one({ shift: 0.5 }))).toBeCloseTo(0.2, 10);
		expect(spillArea(one({ shift: 0.5 }))).toBeCloseTo(0.1, 10);
		// Cut at the die's edge instead: only what is left inside shows, and nothing is outside.
		expect(frameArea(one({ shift: 0.5, spill: false }))).toBeCloseTo(0.1, 10);
		expect(frameArea(one({ shift: -0.25, spill: false }))).toBeCloseTo(0.15, 10);
		expect(spillArea(one({ shift: 0.5, spill: false }))).toBe(0);
		const two: Frame = {
			at: 0,
			show: 'photo',
			slices: [
				slice({ top: 0, height: 0.2, shift: 0 }),
				slice({
					top: 0.1,
					height: 0.2,
					shift: -0.25,
					source: 'avatar',
					cast: true,
					split: true,
					tint: 'green'
				})
			],
			blocks: [
				{
					left: 0.5,
					top: 0.1,
					width: 0.25,
					height: 0.1,
					dx: 0,
					dy: 0,
					source: 'photo',
					look: 'tint',
					tint: 'cyan'
				}
			]
		};
		// The two slices share rows 0.1 to 0.2, where they overlap over x = 0 to 0.75; the block sits
		// inside the first slice. Union: 0.2 + 0.2 - 0.75 x 0.1. The second slice sticks out of the
		// die's left edge by a quarter of a die over its 0.2 of height.
		expect(frameArea(two)).toBeCloseTo(0.2 + 0.2 - 0.75 * 0.1, 10);
		expect(spillArea(two)).toBeCloseTo(0.25 * 0.2, 10);
	});

	it('cast in cyan, green, magenta and blue only, and none of those is saturated red', () => {
		const tints = new Set<string>();
		const looks = new Set<string>();
		for (const seed of seeds(300)) {
			for (const e of cycleOf(seed).events) {
				for (const f of e.frames) {
					for (const fragment of fragmentsOf(f)) tints.add(fragment.tint);
					for (const b of f.blocks) looks.add(b.look);
				}
			}
		}
		expect([...tints].sort()).toEqual([...TINTS].sort());
		expect([...looks].sort()).toEqual([...BLOCK_LOOKS].sort());
		expect([...TINTS].sort()).toEqual(['blue', 'cyan', 'green', 'magenta']);
		for (const tint of TINTS) {
			const [r, g, b] = TINT_RGB[tint];
			// WCAG 2.3.1: a colour is a saturated red when red is 80% or more of the three together.
			expect(r / (r + g + b)).toBeLessThan(0.8);
			// And far from it: red never leads by more than a third.
			expect(r / (r + g + b)).toBeLessThan(0.5);
		}
	});

	it('mix both images into the fragments of a swap, mostly the one that is not underneath', () => {
		let other = 0;
		let same = 0;
		for (const seed of seeds(200)) {
			for (const swap of cycleOf(seed).events.slice(-2)) {
				for (const f of swap.frames) {
					const here = f.show;
					for (const fragment of fragmentsOf(f)) {
						if (fragment.source === here) same++;
						else other++;
					}
				}
			}
		}
		expect(same).toBeGreaterThan(0);
		expect(other).toBeGreaterThan(same);
		expect(same / (same + other)).toBeGreaterThan(0.1);
	});

	it('let the avatar bleed through the photo in teasers too: about 40% of the fragments', () => {
		let fragments = 0;
		let avatar = 0;
		let teasersWithAvatar = 0;
		let teasers = 0;
		for (const seed of seeds(1000)) {
			for (const e of kinds(cycleOf(seed).events, 'tease')) {
				teasers++;
				const found = e.frames.flatMap(fragmentsOf);
				fragments += found.length;
				const fromAvatar = found.filter((fragment) => fragment.source === 'avatar').length;
				avatar += fromAvatar;
				if (fromAvatar > 0) teasersWithAvatar++;
			}
		}
		expect(AVATAR_FRAGMENT_SHARE).toBe(0.4);
		expect(avatar / fragments).toBeGreaterThan(AVATAR_FRAGMENT_SHARE - 0.08);
		expect(avatar / fragments).toBeLessThan(AVATAR_FRAGMENT_SHARE + 0.08);
		// Not in every teaser, and not in none: some teasers are photo only.
		expect(teasersWithAvatar).toBeGreaterThan(teasers * 0.5);
		expect(teasersWithAvatar).toBeLessThan(teasers);
	});
});

describe('flash budget (WCAG 2.3.1)', () => {
	it('counts every change of the picture: each frame, and the end of the event', () => {
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
			}
		];
		expect(frameTransitions(events)).toEqual([1000, 1100, 1200, 1300, 9000, 9300, 9600]);
		expect(wholeImageTransitions(events)).toEqual([
			{ at: 1100, to: 'avatar' },
			{ at: 1200, to: 'photo' },
			{ at: 9300, to: 'avatar' }
		]);
	});

	it('finds the busiest window, its end not included', () => {
		const events: GlitchEvent[] = [
			{ at: 0, kind: 'tease', duration: 200, frames: [frame(0, 'photo'), frame(100, 'photo')] },
			{ at: 1000, kind: 'tease', duration: 200, frames: [frame(0, 'photo'), frame(100, 'photo')] }
		];
		// Changes at 0, 100, 200, 1000, 1100 and 1200.
		expect(maxTransitionsInWindow(events, 1000)).toBe(3);
		expect(maxTransitionsInWindow(events, 1001)).toBe(4);
		expect(maxTransitionsInWindow(events, 1101)).toBe(5);
		expect(maxTransitionsInWindow(events, 1201)).toBe(6);
		expect(maxTransitionsInWindow([], 1000)).toBe(0);
	});

	it('keeps one event within the budget by itself: a swap changes the picture 6 times at most', () => {
		let swapMost = 0;
		let teaserMost = 0;
		for (const seed of seeds(1000)) {
			for (const e of cycleOf(seed).events) {
				const changes = e.frames.length + 1;
				if (e.kind === 'swap-in' || e.kind === 'swap-out') {
					expect(e.frames).toHaveLength(SWAP_FRAMES);
					swapMost = Math.max(swapMost, changes);
				} else {
					teaserMost = Math.max(teaserMost, changes);
				}
				expect(changes).toBeLessThanOrEqual(MAX_TRANSITIONS_PER_S);
			}
		}
		expect(swapMost).toBe(MAX_TRANSITIONS_PER_S);
		expect(teaserMost).toBeGreaterThanOrEqual(4);
	});

	it('keeps every simulated 10 minutes within 3 flashes (6 changes) per second', () => {
		let busiest = 0;
		for (const seed of seeds(TIMELINE_SEEDS)) {
			busiest = Math.max(busiest, maxTransitionsInWindow(timeline(seed, 10), 1000));
		}
		expect(busiest).toBeLessThanOrEqual(MAX_TRANSITIONS_PER_S);
		// The effect uses its budget: a swap is the busiest second.
		expect(busiest).toBe(MAX_TRANSITIONS_PER_S);
	});

	it('keeps it within the budget when the avatar is not there either', () => {
		let busiest = 0;
		for (const seed of seeds(TIMELINE_SEEDS)) {
			busiest = Math.max(
				busiest,
				maxTransitionsInWindow(timeline(seed, 10, { avatar: false }), 1000)
			);
		}
		expect(busiest).toBeLessThanOrEqual(MAX_TRANSITIONS_PER_S);
	});

	it('keeps the whole image to 2 changes in any second, as before (a flicker is a flash)', () => {
		let busiest = 0;
		for (const seed of seeds(TIMELINE_SEEDS)) {
			const times = wholeImageTransitions(timeline(seed, 10)).map((change) => change.at);
			for (let i = 0; i < times.length; i++) {
				busiest = Math.max(
					busiest,
					times.filter((t) => t >= times[i] && t < times[i] + 1000).length
				);
			}
		}
		expect(busiest).toBe(2);
	});

	it('leaves at least 3 s between two events, so no second holds the changes of two', () => {
		for (const seed of seeds(TIMELINE_SEEDS)) {
			const events = timeline(seed, 10);
			for (let i = 1; i < events.length; i++) {
				const gap = events[i].at - (events[i - 1].at + events[i - 1].duration);
				expect(gap).toBeGreaterThanOrEqual(SWAP_CLEAR_MS);
			}
		}
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

	it('has no avatar fragments either: everything is cut from the photo', () => {
		for (const seed of seeds(300)) {
			for (const e of cycleOf(seed, 0, { avatar: false }).events) {
				for (const f of e.frames) {
					expect(fragmentsOf(f).every((fragment) => fragment.source === 'photo')).toBe(true);
				}
			}
		}
	});
});
