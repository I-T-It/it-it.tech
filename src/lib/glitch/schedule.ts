/**
 * The timeline of the hero photo glitch: pure, seeded, no DOM. Same seed, same timeline.
 *
 * One cycle is a wait with 1 to 3 short teasers in it (thin strips of the photo tear sideways;
 * about one in three flickers the avatar in for 100 ms), then one swap: the photo tears into the
 * avatar, the avatar holds for 3 to 5 s, and it tears back. `nextCycle` plans one cycle; the
 * component plays it and asks for the next one when it is over.
 *
 * ```ts
 * const rng = createRng(seed);
 * const { events, end } = nextCycle(rng, 0);
 * // events: tease at 6.2 s, flicker at 14 s, swap-in at 27.5 s, swap-out at 32.4 s
 * ```
 *
 * Flash safety (WCAG 2.3.1) is built into the spacing: teasers are 4 s apart and 3 s clear of the
 * swap, and a swap changes the whole image once per glitch. The busiest second holds a flicker's
 * two changes (one flash). `maxTransitionsInWindow` checks any timeline against the budget.
 */
import { SOCKET_DRAW_MS } from '../pcb/growth.js';
import type { Rng } from '../pcb/rng.js';

/** A teaser lasts this long, in ms. */
export const TEASER_MIN_MS = 150;
export const TEASER_MAX_MS = 300;
/** At least this long between the end of a teaser and the start of the next. */
export const TEASER_GAP_MS = 4000;
/** No teaser starts within this long of a swap glitch, before or after it. */
export const SWAP_CLEAR_MS = 3000;
/** A flicker shows the avatar for this long. */
export const FLICKER_MS = 100;
/** The share of teasers that flicker the avatar in. */
export const FLICKER_SHARE = 1 / 3;
/** A flicker needs room for a frame before it, the 100 ms, and a frame after: 60 + 100 + 60. */
export const FLICKER_TEASER_MIN_MS = 220;
/** The swap glitch in, and the one out. */
export const SWAP_GLITCH_MIN_MS = 500;
export const SWAP_GLITCH_MAX_MS = 700;
/** The avatar holds this long between the two. */
export const HOLD_MIN_MS = 3000;
export const HOLD_MAX_MS = 5000;
/** From the start of a cycle to its swap. */
export const WAIT_MIN_MS = 20_000;
export const WAIT_MAX_MS = 40_000;
/** From the start of a cycle to its first teaser. */
export const FIRST_TEASER_MIN_MS = 4000;
export const FIRST_TEASER_MAX_MS = 8000;
/** The most whole-image changes allowed in any 1000 ms (WCAG 2.3.1: 2 flashes). */
export const MAX_TRANSITIONS_PER_S = 4;
/** The bands together cover at most this share of the die in any frame. */
export const MAX_BAND_AREA = 0.08;
/** A new frame of bands comes no sooner than this. */
export const MIN_FRAME_MS = 60;
/** ... and no later than this, in a teaser. */
export const MAX_FRAME_MS = 110;
/** The number of bands. */
export const BAND_COUNT = 3;

/**
 * When the glitch starts, counted from the moment the socket has power: the frame has drawn
 * itself (SOCKET_DRAW_MS) and the scroll link has come in, 2.6 s after the text.
 */
export const GLITCH_START_AFTER_POWER_MS = SOCKET_DRAW_MS + 2600;

export type Shown = 'photo' | 'avatar';
export type Tint = 'cyan' | 'green';
export type GlitchKind = 'tease' | 'flicker' | 'swap-in' | 'swap-out';

/** One torn strip: full width, `height` of the die tall, `top` down from its top edge. */
export interface Band {
	/** 0 to 1 of the die height. */
	top: number;
	/** 0 to 1 of the die height. */
	height: number;
	/** Sideways, as a fraction of the die width. Negative is to the left. */
	shift: number;
	/** The image the strip is cut from. */
	source: Shown;
	tint: Tint;
}

/** What the die shows from `at` until the next frame, or the end of the event. */
export interface Frame {
	/** In ms from the start of the event. */
	at: number;
	/** The whole image underneath. */
	show: Shown;
	bands: Band[];
}

export interface GlitchEvent {
	/** In ms from the time origin the cycle was planned from. */
	at: number;
	kind: GlitchKind;
	duration: number;
	frames: Frame[];
}

export interface Cycle {
	events: GlitchEvent[];
	/** When the cycle is over, and the next one can start, in the same ms as `events`. */
	end: number;
}

export interface CycleOptions {
	/** False when the avatar did not load: no flickers and no swap. Default true. */
	avatar?: boolean;
}

/** Each band is at most a third of the area budget; floored to 4 decimals so the sum cannot pass it. */
const BAND_MAX_HEIGHT = MAX_BAND_AREA / BAND_COUNT;
const BAND_MIN_HEIGHT = BAND_MAX_HEIGHT * 0.4;
const TINTS: readonly Tint[] = ['cyan', 'green'];

const floor4 = (value: number) => Math.floor(value * 10_000) / 10_000;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

function makeBands(rng: Rng, source: Shown): Band[] {
	return Array.from({ length: BAND_COUNT }, () => {
		const height = floor4(rng.range(BAND_MIN_HEIGHT, BAND_MAX_HEIGHT));
		return {
			top: floor4(rng.range(0, 1 - height)),
			height,
			shift: round4((rng.chance(0.5) ? 1 : -1) * rng.range(0.03, 0.12)),
			source,
			tint: rng.pick(TINTS)
		};
	});
}

/** Frame times from `from` while they stay below `until`, `MIN_FRAME_MS` to `MAX_FRAME_MS` apart. */
function frameTimes(rng: Rng, from: number, until: number): number[] {
	const times = [from];
	for (let t = from + rng.int(MIN_FRAME_MS, MAX_FRAME_MS); t < until;) {
		times.push(t);
		t += rng.int(MIN_FRAME_MS, MAX_FRAME_MS);
	}
	return times;
}

function teaser(rng: Rng, at: number, duration: number, flicker: boolean): GlitchEvent {
	if (flicker) {
		// Before, the avatar for FLICKER_MS exactly in the middle, after: three frames.
		const on = Math.round((duration - FLICKER_MS) / 2);
		return {
			at,
			kind: 'flicker',
			duration,
			frames: [
				{ at: 0, show: 'photo', bands: makeBands(rng, 'photo') },
				{ at: on, show: 'avatar', bands: makeBands(rng, 'photo') },
				{ at: on + FLICKER_MS, show: 'photo', bands: makeBands(rng, 'photo') }
			]
		};
	}
	return {
		at,
		kind: 'tease',
		duration,
		frames: frameTimes(rng, 0, duration).map((time) => ({
			at: time,
			show: 'photo' as const,
			bands: makeBands(rng, 'photo')
		}))
	};
}

/**
 * A swap glitch: bands of the other image tear across for `duration`, and exactly in the middle the
 * whole image changes once. The bands always come from the image that is not underneath.
 */
function swap(rng: Rng, kind: 'swap-in' | 'swap-out', at: number, duration: number): GlitchEvent {
	const from: Shown = kind === 'swap-in' ? 'photo' : 'avatar';
	const to: Shown = kind === 'swap-in' ? 'avatar' : 'photo';
	const middle = Math.round(duration / 2);
	const before = frameTimes(rng, 0, middle - MIN_FRAME_MS + 1).map((time) => ({
		at: time,
		show: from,
		bands: makeBands(rng, to)
	}));
	const after = frameTimes(rng, middle, duration).map((time) => ({
		at: time,
		show: to,
		bands: makeBands(rng, from)
	}));
	return { at, kind, duration, frames: [...before, ...after] };
}

/**
 * One wait with its teasers, then one swap. `startMs` is when the cycle begins (the glitch
 * arming, or the end of the previous cycle); every time in the result counts from the same origin.
 *
 * The first teaser comes 4 to 8 s in, so a cycle never opens with a glitch. The swap comes 20 to
 * 40 s in. The teasers in between are 4 s apart and end 3 s before the swap. After the swap the
 * next cycle's first teaser is at least 4 s away, which keeps it clear of the swap-out too.
 */
export function nextCycle(rng: Rng, startMs: number, options: CycleOptions = {}): Cycle {
	const avatar = options.avatar ?? true;
	const swapAt = startMs + rng.int(WAIT_MIN_MS, WAIT_MAX_MS);
	const events: GlitchEvent[] = [];

	let wanted = rng.int(1, 3);
	let at = startMs + rng.int(FIRST_TEASER_MIN_MS, FIRST_TEASER_MAX_MS);
	while (wanted > 0) {
		const flicker = avatar && rng.chance(FLICKER_SHARE);
		const duration = rng.int(flicker ? FLICKER_TEASER_MIN_MS : TEASER_MIN_MS, TEASER_MAX_MS);
		if (at + duration > swapAt - SWAP_CLEAR_MS) break;
		events.push(teaser(rng, at, duration, flicker));
		wanted--;
		at += duration + TEASER_GAP_MS + rng.int(0, TEASER_GAP_MS);
	}

	if (!avatar) return { events, end: swapAt };

	const glitchIn = rng.int(SWAP_GLITCH_MIN_MS, SWAP_GLITCH_MAX_MS);
	const hold = rng.int(HOLD_MIN_MS, HOLD_MAX_MS);
	const glitchOut = rng.int(SWAP_GLITCH_MIN_MS, SWAP_GLITCH_MAX_MS);
	const outAt = swapAt + glitchIn + hold;
	events.push(swap(rng, 'swap-in', swapAt, glitchIn), swap(rng, 'swap-out', outAt, glitchOut));
	return { events, end: outAt + glitchOut };
}

export interface Transition {
	/** In the same ms as the events. */
	at: number;
	/** The image the die shows from then on. */
	to: Shown;
}

/**
 * Every moment the whole image changes, photo to avatar or back, in order. The die starts on the
 * photo. A change of bands is not one.
 */
export function wholeImageTransitions(events: readonly GlitchEvent[]): Transition[] {
	const changes: Transition[] = [];
	let shown: Shown = 'photo';
	for (const event of events) {
		for (const frame of event.frames) {
			if (frame.show === shown) continue;
			shown = frame.show;
			changes.push({ at: event.at + frame.at, to: shown });
		}
	}
	return changes;
}

/**
 * The most whole-image changes in any window of `windowMs`. A window holds the changes from its
 * start up to, not including, its end.
 */
export function maxTransitionsInWindow(events: readonly GlitchEvent[], windowMs: number): number {
	const times = wholeImageTransitions(events).map((change) => change.at);
	let most = 0;
	let from = 0;
	for (let to = 0; to < times.length; to++) {
		while (times[to] - times[from] >= windowMs) from++;
		most = Math.max(most, to - from + 1);
	}
	return most;
}
