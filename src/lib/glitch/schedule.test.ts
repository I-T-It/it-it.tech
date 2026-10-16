import { describe, expect, it } from 'vitest';
import { SOCKET_DRAW_MS } from '../pcb/growth.js';
import { createRng } from '../pcb/rng.js';
import {
	BLOCK_LOOKS,
	FLASH_GLITCH_MIN_MS,
	FLASH_MS,
	FLASH_SHARE,
	GLITCH_START_AFTER_POWER_MS,
	GLITCH_WAIT_MAX_MS,
	GLITCH_WAIT_MIN_MS,
	MAX_FLASHES_PER_S,
	MAX_SPILL,
	MAX_SWAP_AREA,
	MAX_TEAR_AREA,
	MAX_TRANSITIONS_PER_S,
	MIN_FRAME_MS,
	OTHER_FRAGMENT_SHARE,
	SWAP_FRAMES,
	SWAP_GLITCH_MAX_MS,
	SWAP_GLITCH_MIN_MS,
	SWAP_SHARE,
	TEAR_MAX_MS,
	TEAR_MIN_MS,
	TINTS,
	TINT_RGB,
	frameArea,
	frameTransitions,
	maxTransitionsInWindow,
	nextGlitch,
	spillArea,
	wholeImageTransitions,
	type Frame,
	type GlitchEvent,
	type GlitchKind,
	type GlitchOptions,
	type Shown,
	type Slice
} from './schedule.js';

const HOLDERS: readonly Shown[] = ['photo', 'avatar'];
const other = (shown: Shown): Shown => (shown === 'photo' ? 'avatar' : 'photo');

/**
 * The glitch that follows `startMs` for a seed, with `holder` holding the signal. Planning a glitch
 * is the expensive part (each frame is fitted to its area cap) and many tests walk the same ones,
 * so each is planned once per file. The result is read-only.
 */
const glitches = new Map<string, GlitchEvent>();
function glitchOf(seed: number, holder: Shown = 'photo', options?: GlitchOptions): GlitchEvent {
	const key = `${seed}:${holder}:${options?.avatar ?? true}`;
	let event = glitches.get(key);
	if (!event) {
		event = nextGlitch(createRng(seed), 0, holder, options);
		glitches.set(key, event);
	}
	return event;
}

/** `count` seeds, each glitching from each holder: every property is checked in both directions. */
const sample = (count: number, kind?: GlitchKind): GlitchEvent[] =>
	seeds(count)
		.flatMap((seed) => HOLDERS.map((holder) => glitchOf(seed, holder)))
		.filter((event) => !kind || event.kind === kind);

/**
 * Glitch after glitch for `minutes` of simulated time, like the component plays them: each one
 * starts from the image the one before left holding the signal. The budget tests all walk the same
 * timelines, so each one is planned once per file. The result is read-only.
 */
const timelines = new Map<string, readonly GlitchEvent[]>();
function timeline(seed: number, minutes: number, options?: GlitchOptions): readonly GlitchEvent[] {
	const key = `${seed}:${minutes}:${options?.avatar ?? true}`;
	let events = timelines.get(key);
	if (!events) {
		const rng = createRng(seed);
		const planned: GlitchEvent[] = [];
		let holder: Shown = 'photo';
		let start = 0;
		while (start < minutes * 60_000) {
			const event = nextGlitch(rng, start, holder, options);
			planned.push(event);
			holder = event.to;
			start = event.at + event.duration;
		}
		events = planned;
		timelines.set(key, events);
	}
	return events;
}

/**
 * How many seeds the 10 minute timelines run over. A timeline is about 90 glitches, so this is a
 * couple of ten thousand glitches and as many frames; single glitches run over more seeds below.
 */
const TIMELINE_SEEDS = 250;

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
		expect([TEAR_MIN_MS, TEAR_MAX_MS, GLITCH_WAIT_MIN_MS, GLITCH_WAIT_MAX_MS]).toEqual([
			150, 300, 4000, 8000
		]);
		expect([SWAP_GLITCH_MIN_MS, SWAP_GLITCH_MAX_MS]).toEqual([500, 700]);
		expect([FLASH_MS, FLASH_GLITCH_MIN_MS, MIN_FRAME_MS]).toEqual([100, 220, 60]);
	});

	it('split the glitches 35% swap, 30% flash and 35% tear, whichever image holds the signal', () => {
		expect([SWAP_SHARE, FLASH_SHARE]).toEqual([0.35, 0.3]);
	});

	it('allow 3 flashes in any second, and a flash is two changes of the picture', () => {
		expect(MAX_FLASHES_PER_S).toBe(3);
		expect(MAX_TRANSITIONS_PER_S).toBe(2 * MAX_FLASHES_PER_S);
	});

	it('size the disturbance: how much of the die, how far past it, how many frames in a swap', () => {
		expect([MAX_TEAR_AREA, MAX_SWAP_AREA, MAX_SPILL, SWAP_FRAMES]).toEqual([0.4, 0.65, 0.55, 5]);
	});

	it('starts the glitch when the scroll link is fully in: the socket draw plus 2.6 s after the power', () => {
		expect(GLITCH_START_AFTER_POWER_MS).toBe(SOCKET_DRAW_MS + 2600);
	});
});

describe('a glitch', () => {
	it('is the same for the same seed and holder and different for another', () => {
		expect(glitchOf(7)).toEqual(nextGlitch(createRng(7), 0, 'photo'));
		expect(glitchOf(7)).not.toEqual(glitchOf(8));
		expect(glitchOf(7, 'avatar')).not.toEqual(glitchOf(7, 'photo'));
	});

	it('is placed from the start it is given', () => {
		for (const holder of HOLDERS) {
			const a = nextGlitch(createRng(3), 0, holder);
			const b = nextGlitch(createRng(3), 12_345, holder);
			expect(b.at - 12_345).toBe(a.at);
			expect(b.frames).toEqual(a.frames);
			expect([b.kind, b.duration, b.from, b.to]).toEqual([a.kind, a.duration, a.from, a.to]);
		}
	});

	it('comes 4 to 8 s after the start it is given', () => {
		for (const event of sample(500)) {
			expect(event.at).toBeGreaterThanOrEqual(GLITCH_WAIT_MIN_MS);
			expect(event.at).toBeLessThanOrEqual(GLITCH_WAIT_MAX_MS);
		}
		for (const seed of seeds(200)) {
			const event = nextGlitch(createRng(seed), 1000, 'photo');
			expect(event.at - 1000).toBeGreaterThanOrEqual(GLITCH_WAIT_MIN_MS);
			expect(event.at - 1000).toBeLessThanOrEqual(GLITCH_WAIT_MAX_MS);
		}
	});

	it('is a swap, a flash or a tear: about 35%, 30% and 35%, from either image', () => {
		for (const holder of HOLDERS) {
			const counts: Record<GlitchKind, number> = { swap: 0, flash: 0, tear: 0 };
			const total = 2000;
			for (const seed of seeds(total)) counts[glitchOf(seed, holder).kind]++;
			expect(counts.swap / total).toBeGreaterThan(SWAP_SHARE - 0.06);
			expect(counts.swap / total).toBeLessThan(SWAP_SHARE + 0.06);
			expect(counts.flash / total).toBeGreaterThan(FLASH_SHARE - 0.06);
			expect(counts.flash / total).toBeLessThan(FLASH_SHARE + 0.06);
			expect(counts.tear / total).toBeGreaterThan(1 - SWAP_SHARE - FLASH_SHARE - 0.06);
			expect(counts.tear / total).toBeLessThan(1 - SWAP_SHARE - FLASH_SHARE + 0.06);
		}
	});

	it('does not favour the photo: the kinds come out the same from the photo and from the avatar', () => {
		const share = (holder: Shown, kind: GlitchKind) =>
			seeds(2000).filter((seed) => glitchOf(seed, holder).kind === kind).length / 2000;
		for (const kind of ['swap', 'flash', 'tear'] as const) {
			expect(Math.abs(share('photo', kind) - share('avatar', kind))).toBeLessThan(0.05);
		}
	});

	it('knows which image holds the signal before and after it', () => {
		for (const holder of HOLDERS) {
			for (const seed of seeds(400)) {
				const event = glitchOf(seed, holder);
				expect(event.from).toBe(holder);
				expect(event.to).toBe(event.kind === 'swap' ? other(holder) : holder);
				expect(event.frames[0].show).toBe(holder);
				expect(event.frames.at(-1)!.show).toBe(event.to);
			}
		}
	});

	it('hands the signal over in a swap only: a flash and a tear leave it where it was', () => {
		for (const event of sample(500)) {
			if (event.kind === 'swap') expect(event.to).not.toBe(event.from);
			else expect(event.to).toBe(event.from);
		}
	});
});

describe('a tear', () => {
	it('lasts 150 to 300 ms with the image that holds the signal underneath all the way', () => {
		let seen = 0;
		for (const event of sample(600, 'tear')) {
			seen++;
			expect(event.duration).toBeGreaterThanOrEqual(TEAR_MIN_MS);
			expect(event.duration).toBeLessThanOrEqual(TEAR_MAX_MS);
			expect(event.frames.every((f) => f.show === event.from)).toBe(true);
			expect(wholeImageTransitions([event], event.from)).toEqual([]);
		}
		expect(seen).toBeGreaterThan(300);
	});

	it('tears the avatar as well as the photo', () => {
		const underneath = new Set(sample(600, 'tear').map((event) => event.from));
		expect([...underneath].sort()).toEqual(['avatar', 'photo']);
	});
});

describe('a flash', () => {
	it('shows the other image for 100 ms in the middle, with the holder back at the end', () => {
		let seen = 0;
		for (const e of sample(1000, 'flash')) {
			seen++;
			const shown = e.frames.map((f) => f.show);
			const first = shown.indexOf(other(e.from));
			const last = shown.lastIndexOf(other(e.from));
			expect(first).toBeGreaterThan(0);
			expect(last).toBe(first);
			expect(e.frames[first + 1].show).toBe(e.from);
			const lit = e.frames[first + 1].at - e.frames[first].at;
			expect(lit).toBeGreaterThanOrEqual(FLASH_MS - 10);
			expect(lit).toBeLessThanOrEqual(FLASH_MS + 10);
			expect(e.frames.at(-1)!.show).toBe(e.from);
			expect(e.to).toBe(e.from);
			expect(e.duration).toBeGreaterThanOrEqual(FLASH_GLITCH_MIN_MS);
			expect(e.duration).toBeLessThanOrEqual(TEAR_MAX_MS);
		}
		expect(seen).toBeGreaterThan(300);
	});

	it('flashes the photo over the avatar as readily as the avatar over the photo', () => {
		const flashed = new Set<Shown>();
		for (const e of sample(600, 'flash')) {
			flashed.add(e.frames.find((f) => f.show !== e.from)!.show);
		}
		expect([...flashed].sort()).toEqual(['avatar', 'photo']);
	});

	it('changes the whole image twice, which is one flash, and not once more', () => {
		for (const e of sample(600, 'flash')) {
			const changes = wholeImageTransitions([e], e.from);
			expect(changes.map((c) => c.to)).toEqual([other(e.from), e.from]);
		}
	});

	it('puts the other image in the middle of the glitch', () => {
		for (const e of sample(500, 'flash')) {
			const on = e.frames.find((f) => f.show !== e.from)!.at;
			const off = on + FLASH_MS;
			expect(on).toBeGreaterThanOrEqual(MIN_FRAME_MS);
			expect(Math.abs(on - (e.duration - off))).toBeLessThanOrEqual(1);
		}
	});
});

describe('a swap', () => {
	it('lasts 500 to 700 ms and hands the signal to the other image', () => {
		let seen = 0;
		for (const e of sample(600, 'swap')) {
			seen++;
			expect(e.duration).toBeGreaterThanOrEqual(SWAP_GLITCH_MIN_MS);
			expect(e.duration).toBeLessThanOrEqual(SWAP_GLITCH_MAX_MS);
			expect(e.frames).toHaveLength(SWAP_FRAMES);
			expect(e.to).toBe(other(e.from));
		}
		expect(seen).toBeGreaterThan(200);
	});

	it('changes the whole image exactly once, at the middle of the glitch, in both directions', () => {
		const directions = new Set<string>();
		for (const e of sample(600, 'swap')) {
			const shown = e.frames.map((f) => f.show);
			const changes = shown.filter((s, i) => s !== (i === 0 ? e.from : shown[i - 1])).length;
			expect(changes).toBe(1);
			const turn = e.frames.find((f) => f.show === e.to)!.at;
			expect(turn).toBe(Math.round(e.duration / 2));
			expect(e.frames.at(-1)!.show).toBe(e.to);
			directions.add(`${e.from}>${e.to}`);
		}
		expect([...directions].sort()).toEqual(['avatar>photo', 'photo>avatar']);
	});
});

describe('the image that holds the signal, glitch after glitch', () => {
	it('starts on the photo and keeps what the last glitch left, until a swap hands it over', () => {
		for (const seed of seeds(TIMELINE_SEEDS)) {
			const events = timeline(seed, 10);
			expect(events[0].from).toBe('photo');
			for (let i = 1; i < events.length; i++) {
				expect(events[i].from).toBe(events[i - 1].to);
			}
		}
	});

	it('is the photo some of the time and the avatar some of the time, with no fixed hold', () => {
		const streaks = new Set<number>();
		let photoTime = 0;
		let avatarTime = 0;
		for (const seed of seeds(TIMELINE_SEEDS)) {
			const events = timeline(seed, 10);
			let run = 0;
			for (const e of events) {
				if (e.from === 'photo') photoTime++;
				else avatarTime++;
				run++;
				if (e.kind === 'swap') {
					streaks.add(run);
					run = 0;
				}
			}
		}
		// Not tied to a home: both images hold the signal for a good share of the glitches.
		expect(avatarTime / (photoTime + avatarTime)).toBeGreaterThan(0.35);
		expect(avatarTime / (photoTime + avatarTime)).toBeLessThan(0.65);
		// It stays for 1 glitch, or for 2, or for 6 (the shortest and a long visit both happen).
		expect(streaks.has(1)).toBe(true);
		expect(streaks.has(2)).toBe(true);
		expect(Math.max(...streaks)).toBeGreaterThanOrEqual(6);
	});

	it('swaps both ways in turn: the photo to the avatar, then back, never the same way twice', () => {
		for (const seed of seeds(TIMELINE_SEEDS)) {
			const swaps = timeline(seed, 10).filter((e) => e.kind === 'swap');
			swaps.forEach((e, i) => expect(e.to).toBe(i % 2 === 0 ? 'avatar' : 'photo'));
		}
	});

	it('keeps the whole image where the glitch before it left it: no change between two glitches', () => {
		for (const seed of seeds(60)) {
			const events = timeline(seed, 10);
			const changes = wholeImageTransitions(events);
			// Every whole-image change lies inside a glitch.
			for (const change of changes) {
				const inside = events.some((e) => change.at >= e.at && change.at <= e.at + e.duration);
				expect(inside).toBe(true);
			}
		}
	});
});

describe('frames', () => {
	it('start at 0, stay inside the event and come at least 60 ms apart', () => {
		for (const e of sample(300)) {
			expect(e.frames[0].at).toBe(0);
			for (let i = 0; i < e.frames.length; i++) {
				expect(e.frames[i].at).toBeLessThan(e.duration);
				if (i > 0) {
					expect(e.frames[i].at - e.frames[i - 1].at).toBeGreaterThanOrEqual(MIN_FRAME_MS);
				}
			}
		}
	});

	it('hold whole slices and rectangular blocks, always at least two slices and one block', () => {
		for (const e of sample(200)) {
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
	});

	it('throw slices sideways by a lot: from a few percent of the die to over half of what is allowed', () => {
		let largest = 0;
		for (const e of sample(300)) {
			for (const f of e.frames) {
				for (const s of f.slices) {
					expect(Math.abs(s.shift)).toBeGreaterThanOrEqual(0.05);
					expect(Math.abs(s.shift)).toBeLessThanOrEqual(MAX_SPILL);
					largest = Math.max(largest, Math.abs(s.shift));
				}
			}
		}
		expect(largest).toBeGreaterThan(0.4);
	});

	it('let fragments spill out of the die sideways, never above or below it, and never far', () => {
		let spilled = 0;
		let inside = 0;
		let clipped = 0;
		for (const e of sample(300)) {
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
		// Most frames have something out on the board, some do not, and some slices are cut at the die.
		expect(spilled).toBeGreaterThan(inside);
		expect(inside).toBeGreaterThan(0);
		expect(clipped).toBeGreaterThan(100);
	});

	it('show the picture behind every block: the image is big enough to fill its window', () => {
		for (const e of sample(300)) {
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
	});

	it('cover at most 40% of the die in a tear or a flash and 65% in a swap, counting what spills', () => {
		let tearMost = 0;
		let swapMost = 0;
		for (const e of sample(300)) {
			for (const f of e.frames) {
				const area = frameArea(f);
				expect(area).toBeGreaterThan(0.05);
				expect(area).toBeLessThanOrEqual(e.kind === 'swap' ? MAX_SWAP_AREA : MAX_TEAR_AREA);
				if (e.kind === 'swap') swapMost = Math.max(swapMost, area);
				else tearMost = Math.max(tearMost, area);
			}
		}
		// Big, not just allowed to be: the old thin bands covered 8%.
		expect(tearMost).toBeGreaterThan(0.25);
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
		for (const e of sample(300)) {
			for (const f of e.frames) {
				for (const fragment of fragmentsOf(f)) tints.add(fragment.tint);
				for (const b of f.blocks) looks.add(b.look);
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
});

describe('the fragments of the other image', () => {
	it('bleed into a swap, mostly the image that is not underneath, going either way', () => {
		for (const from of HOLDERS) {
			let otherCount = 0;
			let same = 0;
			for (const seed of seeds(300)) {
				const swap = glitchOf(seed, from);
				if (swap.kind !== 'swap') continue;
				for (const f of swap.frames) {
					for (const fragment of fragmentsOf(f)) {
						if (fragment.source === f.show) same++;
						else otherCount++;
					}
				}
			}
			expect(same).toBeGreaterThan(0);
			expect(otherCount).toBeGreaterThan(same);
			expect(same / (same + otherCount)).toBeGreaterThan(0.1);
		}
	});

	it('bleed into a tear too: about 40% of the fragments, whichever image is underneath', () => {
		expect(OTHER_FRAGMENT_SHARE).toBe(0.4);
		for (const holder of HOLDERS) {
			let fragments = 0;
			let fromOther = 0;
			let withOther = 0;
			let tears = 0;
			for (const seed of seeds(1500)) {
				const tear = glitchOf(seed, holder);
				if (tear.kind !== 'tear') continue;
				tears++;
				const found = tear.frames.flatMap(fragmentsOf);
				fragments += found.length;
				const count = found.filter((fragment) => fragment.source === other(holder)).length;
				fromOther += count;
				if (count > 0) withOther++;
			}
			expect(fromOther / fragments).toBeGreaterThan(OTHER_FRAGMENT_SHARE - 0.08);
			expect(fromOther / fragments).toBeLessThan(OTHER_FRAGMENT_SHARE + 0.08);
			// Not in every tear, and not in none: some tears are one image only.
			expect(withOther).toBeGreaterThan(tears * 0.5);
			expect(withOther).toBeLessThan(tears);
		}
	});

	it('bleed into a flash too, in the frames either side of it and in the one that shows the other image', () => {
		for (const holder of HOLDERS) {
			let fromOther = 0;
			let fragments = 0;
			for (const seed of seeds(1000)) {
				const flash = glitchOf(seed, holder);
				if (flash.kind !== 'flash') continue;
				for (const f of flash.frames) {
					for (const fragment of fragmentsOf(f)) {
						fragments++;
						if (fragment.source !== f.show) fromOther++;
					}
				}
			}
			expect(fromOther).toBeGreaterThan(fragments * 0.2);
			expect(fromOther).toBeLessThan(fragments * 0.6);
		}
	});
});

describe('flash budget (WCAG 2.3.1)', () => {
	it('counts every change of the picture: each frame, and the end of the event', () => {
		const events: GlitchEvent[] = [
			{
				at: 1000,
				kind: 'flash',
				duration: 300,
				from: 'photo',
				to: 'photo',
				frames: [frame(0, 'photo'), frame(100, 'avatar'), frame(200, 'photo')]
			},
			{
				at: 9000,
				kind: 'swap',
				duration: 600,
				from: 'photo',
				to: 'avatar',
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
		const tear = (at: number): GlitchEvent => ({
			at,
			kind: 'tear',
			duration: 200,
			from: 'photo',
			to: 'photo',
			frames: [frame(0, 'photo'), frame(100, 'photo')]
		});
		const events = [tear(0), tear(1000)];
		// Changes at 0, 100, 200, 1000, 1100 and 1200.
		expect(maxTransitionsInWindow(events, 1000)).toBe(3);
		expect(maxTransitionsInWindow(events, 1001)).toBe(4);
		expect(maxTransitionsInWindow(events, 1101)).toBe(5);
		expect(maxTransitionsInWindow(events, 1201)).toBe(6);
		expect(maxTransitionsInWindow([], 1000)).toBe(0);
	});

	it('keeps one event within the budget by itself: a swap changes the picture 6 times at most', () => {
		let swapMost = 0;
		let tearMost = 0;
		for (const e of sample(1000)) {
			const changes = e.frames.length + 1;
			if (e.kind === 'swap') swapMost = Math.max(swapMost, changes);
			else tearMost = Math.max(tearMost, changes);
			expect(changes).toBeLessThanOrEqual(MAX_TRANSITIONS_PER_S);
			expect(maxTransitionsInWindow([e], 1000)).toBeLessThanOrEqual(MAX_TRANSITIONS_PER_S);
		}
		expect(swapMost).toBe(MAX_TRANSITIONS_PER_S);
		expect(tearMost).toBeGreaterThanOrEqual(4);
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

	it('keeps the whole image to 2 changes in any second (a flash is a flash), from either image', () => {
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

	it('leaves at least 4 s between two events, so no second holds the changes of two', () => {
		for (const seed of seeds(TIMELINE_SEEDS)) {
			const events = timeline(seed, 10);
			expect(events[0].at).toBeGreaterThanOrEqual(GLITCH_WAIT_MIN_MS);
			for (let i = 1; i < events.length; i++) {
				const gap = events[i].at - (events[i - 1].at + events[i - 1].duration);
				expect(gap).toBeGreaterThanOrEqual(GLITCH_WAIT_MIN_MS);
				expect(gap).toBeLessThanOrEqual(GLITCH_WAIT_MAX_MS);
			}
		}
	});
});

describe('the seeds the e2e tests pin (e2e/photo-glitch.spec.ts)', () => {
	it('seed 129 swaps to the avatar 4.7 s in and back to the photo by 10 s', () => {
		const events = timeline(129, 1);
		const [first, second] = events;
		expect([first.kind, first.from, first.to]).toEqual(['swap', 'photo', 'avatar']);
		expect([second.kind, second.from, second.to]).toEqual(['swap', 'avatar', 'photo']);
		expect(first.at).toBeLessThan(5000);
		expect(second.at + second.duration).toBeLessThan(10_000);
	});

	it('seed 3 flashes and tears both images and swaps both ways, at least twice each, in 5 minutes', () => {
		const count = { flashOnPhoto: 0, flashOnAvatar: 0, tearOnAvatar: 0, swaps: 0 };
		for (const e of timeline(3, 5)) {
			if (e.at > 300_000) break;
			if (e.kind === 'flash') count[e.from === 'photo' ? 'flashOnPhoto' : 'flashOnAvatar']++;
			if (e.kind === 'tear' && e.from === 'avatar') count.tearOnAvatar++;
			if (e.kind === 'swap') count.swaps++;
		}
		expect(count.flashOnPhoto).toBeGreaterThanOrEqual(2);
		expect(count.flashOnAvatar).toBeGreaterThanOrEqual(2);
		expect(count.tearOnAvatar).toBeGreaterThanOrEqual(2);
		expect(count.swaps).toBeGreaterThanOrEqual(4);
	});
});

describe('a glitch without the avatar', () => {
	it('is a plain tear of the photo, whatever the dice say', () => {
		for (const seed of seeds(300)) {
			for (const holder of HOLDERS) {
				const e = glitchOf(seed, holder, { avatar: false });
				expect(e.kind).toBe('tear');
				expect([e.from, e.to]).toEqual(['photo', 'photo']);
				expect(e.frames.every((f) => f.show === 'photo')).toBe(true);
				expect(e.at).toBeGreaterThanOrEqual(GLITCH_WAIT_MIN_MS);
				expect(e.at).toBeLessThanOrEqual(GLITCH_WAIT_MAX_MS);
			}
		}
	});

	it('has no avatar fragments either: everything is cut from the photo', () => {
		for (const seed of seeds(300)) {
			for (const f of glitchOf(seed, 'photo', { avatar: false }).frames) {
				expect(fragmentsOf(f).every((fragment) => fragment.source === 'photo')).toBe(true);
			}
		}
	});
});
