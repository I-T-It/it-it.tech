/**
 * The timeline of the hero photo glitch: pure, seeded, no DOM. Same seed, same timeline.
 *
 * The photo and the avatar fight over the signal. Whichever one holds it is what the die shows
 * and what a screen reader finds; it starts as the photo. Then a glitch comes every 4 to 8 s,
 * and each glitch is one of three, whichever image holds the signal:
 *
 * - a swap (35%): the holder tears into the other image, which takes the signal and keeps it until
 *   a later glitch swaps it back;
 * - a flash (30%): the other image takes over for 100 ms and the holder is back, still holding;
 * - a tear (35%): the holder tears and nothing else changes.
 *
 * `nextGlitch` plans one glitch from the image that holds the signal; the component plays it,
 * takes the image it left holding the signal and asks for the next one.
 *
 * What a glitch looks like is a hacked signal: whole horizontal slices of the picture jump
 * sideways by a lot, rectangular blocks come out in the wrong colours (a cast, a negative, a
 * posterised crush, a smear dragged along the row), and some of it spills out of the die onto the
 * board. Both images take part in every glitch: fragments of the other one bleed into the one
 * underneath, and in a swap they come mostly from the image that is about to take over. Exactly in
 * the middle of a swap the whole image changes once.
 *
 * ```ts
 * const rng = createRng(seed);
 * const first = nextGlitch(rng, 0, 'photo'); // a tear at 6.2 s, the photo still holds the signal
 * const second = nextGlitch(rng, first.at + first.duration, first.to); // a swap at 13.1 s, to the avatar
 * ```
 *
 * Flash safety (WCAG 2.3.1) does not lean on the exception for small areas (a flash only counts
 * when it fills a quarter of a 10 degree field of view). Every change of the picture counts, however
 * little or much of it changes: that covers a full-die luminance flip, every block that flips
 * luminance (a negative, a fragment of the dark avatar over the light photo) and what spills
 * outside the die. A flash is two changes, 3 flashes a second is the limit, so at most 6 changes
 * fall in any second. A tear or a flash has at most 5 frames and a swap exactly 5 (6 changes with
 * the one back to rest), and glitches are at least 4 s apart, so one glitch never shares a second
 * with another. `maxTransitionsInWindow` checks any timeline against the budget.
 *
 * The area of a frame is capped on top of that, so a glitch stays a glitch and not another
 * picture, and no saturated red is ever drawn: the colours are cyan, green, magenta and blue.
 */
import { SOCKET_DRAW_MS } from '../pcb/growth.js';
import type { Rng } from '../pcb/rng.js';

/** A tear lasts this long, in ms. */
export const TEAR_MIN_MS = 150;
export const TEAR_MAX_MS = 300;
/**
 * A glitch comes this long after the wait begins, which is when the glitch arms or the last glitch
 * ends: at least 4 s clear of the one before, so the changes of two never share a second.
 */
export const GLITCH_WAIT_MIN_MS = 4000;
export const GLITCH_WAIT_MAX_MS = 8000;
/** A flash shows the other image for this long. */
export const FLASH_MS = 100;
/** A flash needs room for a frame before it, the 100 ms, and a frame after: 60 + 100 + 60. */
export const FLASH_GLITCH_MIN_MS = 220;
/** A swap glitch lasts this long. */
export const SWAP_GLITCH_MIN_MS = 500;
export const SWAP_GLITCH_MAX_MS = 700;
/** The share of glitches that swap the image that holds the signal, and the share that flash. The rest tear. */
export const SWAP_SHARE = 0.35;
export const FLASH_SHARE = 0.3;

/** WCAG 2.3.1: no more than 3 flashes in any one second. */
export const MAX_FLASHES_PER_S = 3;
/** A flash is a pair of opposite changes, so the changes of the picture in a second are at most 6. */
export const MAX_TRANSITIONS_PER_S = 2 * MAX_FLASHES_PER_S;
/** A new frame comes no sooner than this. */
export const MIN_FRAME_MS = 60;
/** ... and no later than this, in a tear. */
export const MAX_FRAME_MS = 110;
/** A swap glitch is exactly this many frames: with the change back to rest, the 6 of the budget. */
export const SWAP_FRAMES = 5;

/** The fragments of a frame cover at most this share of the die, spill included, in a tear or a flash. */
export const MAX_TEAR_AREA = 0.4;
/** ... and in a swap, which is the big moment. */
export const MAX_SWAP_AREA = 0.65;
/** A fragment reaches at most this far past the die's left or right edge, in die widths. Never above or below it. */
export const MAX_SPILL = 0.55;
/** The share of all fragments in a tear that are cut from the image that is not underneath, so it leaks in. */
export const OTHER_FRAGMENT_SHARE = 0.4;
/** The share of tear frames that have fragments of the other image in them at all. */
const BLEED_FRAME_SHARE = 0.6;
/** The share of the fragments of a swap that come from the image that is not underneath. */
const SWAP_OTHER_SHARE = 0.75;

/**
 * When the glitch starts, counted from the moment the socket has power: the frame has drawn
 * itself (SOCKET_DRAW_MS) and the scroll link has come in, 2.6 s after the text.
 */
export const GLITCH_START_AFTER_POWER_MS = SOCKET_DRAW_MS + 2600;

export type Shown = 'photo' | 'avatar';
export type GlitchKind = 'tear' | 'flash' | 'swap';

/**
 * The colours of a glitch: the brand's cyan and green, and magenta and blue for the wrong-channel
 * look. Red is not among them, and none may be: WCAG 2.3.1 has its own limit for saturated red.
 */
export const TINTS = ['cyan', 'green', 'magenta', 'blue'] as const;
export type Tint = (typeof TINTS)[number];

/** Each tint as sRGB, 0 to 255. A colour is a saturated red when red is 80% or more of the sum. */
export const TINT_RGB: Record<Tint, readonly [number, number, number]> = {
	cyan: [0, 231, 255],
	green: [63, 216, 63],
	magenta: [240, 40, 220],
	blue: [46, 91, 255]
};

/**
 * What a block does to the picture it shows: `tint` recolours it in one hue (a channel gone
 * wrong, luminance kept), `negative` flips its lightness, `posterise` crushes it to a few flat
 * levels under a tint, `smear` drags one column of it along the whole row.
 */
export const BLOCK_LOOKS = ['tint', 'negative', 'posterise', 'smear'] as const;
export type BlockLook = (typeof BLOCK_LOOKS)[number];

/**
 * A torn row: as wide as the die, `height` of it tall, `top` down from its top edge, moved
 * sideways by `shift`. A slice that `spill`s sticks out of the die onto the board; one that does
 * not is cut at the die's edges, and so shows less of the row the further it moves.
 */
export interface Slice {
	/** 0 to 1 of the die height. */
	top: number;
	/** 0 to 1 of the die height. */
	height: number;
	/** Sideways, as a fraction of the die width. Negative is to the left. */
	shift: number;
	/** The image the slice is cut from. */
	source: Shown;
	/** The colour of its edge lines, and of its cast when it has one. */
	tint: Tint;
	/** The slice is recoloured too. */
	cast: boolean;
	/** The slice splits into a cyan and a magenta ghost, a little apart. */
	split: boolean;
	/** What is moved out of the die is shown, outside it. */
	spill: boolean;
}

/**
 * A rectangle of the die, in die units, showing the image moved to (`dx`, `dy`) and recoloured by
 * `look`. The image is one die across, so `dx` and `dy` are limited to keep it under the whole
 * block: `dx <= left`, `dx + 1 >= left + width`, and the same for `dy`.
 */
export interface Block {
	left: number;
	top: number;
	width: number;
	height: number;
	dx: number;
	dy: number;
	source: Shown;
	look: BlockLook;
	tint: Tint;
}

/** What the die shows from `at` until the next frame, or the end of the event. */
export interface Frame {
	/** In ms from the start of the event. */
	at: number;
	/** The whole image underneath. */
	show: Shown;
	slices: Slice[];
	blocks: Block[];
}

export interface GlitchEvent {
	/** In ms from the time origin the glitch was planned from. */
	at: number;
	kind: GlitchKind;
	duration: number;
	/** The image that holds the signal when the glitch starts. */
	from: Shown;
	/** ... and when it is over: the other one after a swap, the same one after a flash or a tear. */
	to: Shown;
	frames: Frame[];
}

export interface GlitchOptions {
	/** False when the avatar did not load: the photo only, torn, with no flash, no swap and no avatar fragments. Default true. */
	avatar?: boolean;
}

// ---- Areas -------------------------------------------------------------------------------

/** A rectangle in die units: the die is 0 to 1 both ways. */
interface Rect {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}

/** What a slice shows, in die units: all of it, or only what is left inside the die. */
export const sliceSpan = (slice: Slice): [number, number] =>
	slice.spill
		? [slice.shift, 1 + slice.shift]
		: [Math.max(0, slice.shift), Math.min(1, 1 + slice.shift)];

const rectsOf = (frame: Frame): Rect[] => [
	...frame.slices.map((s) => {
		const [x0, x1] = sliceSpan(s);
		return { x0, x1, y0: s.top, y1: s.top + s.height };
	}),
	...frame.blocks.map((b) => ({
		x0: b.left,
		x1: b.left + b.width,
		y0: b.top,
		y1: b.top + b.height
	}))
];

/**
 * The area of the union of the rectangles, by cutting the plane along every edge. `fit` asks for it
 * on every trim of every frame, and a frame has 3 to 7 rectangles, so this sorts by insertion into
 * two arrays and reuses the second for every strip, instead of a Set and a filtered, mapped, sorted
 * copy per strip. The result is the same to the last bit, with ties kept in the order they came.
 */
function unionArea(rects: readonly Rect[]): number {
	const edges: number[] = [];
	for (const { x0, x1 } of rects) {
		insertEdge(edges, x0);
		insertEdge(edges, x1);
	}
	const strip: Rect[] = [];
	let area = 0;
	for (let i = 0; i + 1 < edges.length; i++) {
		const [left, right] = [edges[i], edges[i + 1]];
		if (right === left) continue;
		// What crosses the strip, from the top down. Rectangles that start level keep their order.
		strip.length = 0;
		for (const r of rects) {
			if (r.x0 <= left && r.x1 >= right) insertByTop(strip, r);
		}
		let covered = 0;
		let reach = -Infinity;
		for (const { y0: from, y1: to } of strip) {
			if (to <= reach) continue;
			covered += to - Math.max(from, reach);
			reach = to;
		}
		area += covered * (right - left);
	}
	return area;
}

function insertEdge(edges: number[], x: number): void {
	let at = edges.push(x) - 1;
	for (; at > 0 && edges[at - 1] > x; at--) edges[at] = edges[at - 1];
	edges[at] = x;
}

function insertByTop(strip: Rect[], rect: Rect): void {
	let at = strip.push(rect) - 1;
	for (; at > 0 && strip[at - 1].y0 > rect.y0; at--) strip[at] = strip[at - 1];
	strip[at] = rect;
}

/** How much of a die the fragments of a frame cover together, the part outside the die included. */
export function frameArea(frame: Frame): number {
	return unionArea(rectsOf(frame));
}

/** The part of `frameArea` that lies outside the die, on the board. */
export function spillArea(frame: Frame): number {
	const rects = rectsOf(frame);
	const inside = rects
		.map((r) => ({ x0: Math.max(r.x0, 0), x1: Math.min(r.x1, 1), y0: r.y0, y1: r.y1 }))
		.filter((r) => r.x1 > r.x0);
	return Math.max(0, unionArea(rects) - unionArea(inside));
}

// ---- Making frames -----------------------------------------------------------------------

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
/** `value` on a grid of `steps` to the die: the coarse, blocky positions of a corrupted picture. */
const snap = (value: number, steps: number) => Math.round(value * steps) / steps;
const floorTo = (value: number, steps: number) => Math.floor(value * steps + 1e-9) / steps;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Slices sit on a grid of 64 to the die height, blocks of 32. */
const SLICE_GRID = 64;
const BLOCK_GRID = 32;
const SLICE_MIN_HEIGHT = 2 / SLICE_GRID;
const BLOCK_MIN_SIDE = 2 / BLOCK_GRID;
/** How much of a frame's area its slices get, the rest is for the blocks. */
const SLICE_AREA_SHARE = 0.55;
/** The areas are drawn a little over, as overlaps and the grid take some off; `fit` trims the rest. */
const OVERDRAW = 1.3;
/** The share of slices and of blocks that come out of the die; the others are cut at its edges. */
const SLICE_SPILL_SHARE = 0.5;
const BLOCK_SPILL_SHARE = 0.4;
/** How far a block's picture is moved, at most, sideways and up or down, in die units. */
const MAX_DX = 0.45;
const MAX_DY = 0.2;

const LOOK_WEIGHTS: readonly (readonly [BlockLook, number])[] = [
	['tint', 0.35],
	['negative', 0.2],
	['posterise', 0.2],
	['smear', 0.25]
];

function pickLook(rng: Rng): BlockLook {
	let roll = rng.next();
	for (const [look, weight] of LOOK_WEIGHTS) {
		if (roll < weight) return look;
		roll -= weight;
	}
	return LOOK_WEIGHTS[LOOK_WEIGHTS.length - 1][0];
}

/** Shares that sum to 1, uneven: a frame has one big fragment and some small ones. */
function shares(rng: Rng, count: number): number[] {
	const weights = Array.from({ length: count }, () => rng.range(0.3, 1.7));
	const total = weights.reduce((sum, w) => sum + w, 0);
	return weights.map((w) => w / total);
}

function makeSlice(rng: Rng, area: number, power: number, source: Shown): Slice {
	const height = Math.max(SLICE_MIN_HEIGHT, floorTo(Math.min(area * OVERDRAW, 0.3), SLICE_GRID));
	const top = Math.min(snap(rng.range(0, 1 - height), SLICE_GRID), 1 - height);
	const magnitude = round4(rng.range(0.06, 0.2 + (MAX_SPILL - 0.2) * power));
	return {
		top,
		height,
		shift: rng.chance(0.5) ? magnitude : -magnitude,
		source,
		tint: rng.pick(TINTS),
		cast: rng.chance(0.45),
		split: rng.chance(0.4),
		spill: rng.chance(SLICE_SPILL_SHARE)
	};
}

function makeBlock(rng: Rng, area: number, source: Shown): Block {
	const aspect = rng.range(1.4, 5);
	const width = clamp(
		floorTo(Math.sqrt(area * OVERDRAW * aspect), BLOCK_GRID),
		BLOCK_MIN_SIDE,
		0.6
	);
	const height = clamp(
		floorTo(Math.sqrt((area * OVERDRAW) / aspect), BLOCK_GRID),
		BLOCK_MIN_SIDE,
		0.28
	);
	// Inside the die, or hanging off its left or its right edge by up to 0.3 of a die.
	const left = rng.chance(BLOCK_SPILL_SHARE)
		? snap(rng.chance(0.5) ? -rng.range(0.05, 0.3) : 1 - width + rng.range(0.05, 0.3), BLOCK_GRID)
		: snap(rng.range(0, 1 - width), BLOCK_GRID);
	const top = Math.min(snap(rng.range(0, 1 - height), BLOCK_GRID), 1 - height);
	// The image is one die across: keep it under the whole window.
	const dxLow = Math.max(left + width - 1, -MAX_DX);
	const dxHigh = Math.min(left, MAX_DX);
	const dyLow = Math.max(top + height - 1, -MAX_DY);
	const dyHigh = Math.min(top, MAX_DY);
	return {
		left,
		top,
		width,
		height,
		dx: clamp(round4(rng.range(dxLow, dxHigh)), dxLow, dxHigh),
		dy: clamp(round4(rng.range(dyLow, dyHigh)), dyLow, dyHigh),
		source,
		look: pickLook(rng),
		tint: rng.pick(TINTS)
	};
}

/**
 * Trims the biggest fragment, a grid step at a time, until the frame is inside `cap`. The drawing
 * is rough on purpose (it overdraws), this is what makes the cap exact.
 */
function fit(frame: Frame, cap: number): Frame {
	for (let guard = 0; guard < 400 && frameArea(frame) > cap; guard++) {
		let target: { area: number; trim: () => void } | undefined;
		for (const s of frame.slices) {
			if (s.height <= SLICE_MIN_HEIGHT) continue;
			if (!target || s.height > target.area) {
				target = { area: s.height, trim: () => (s.height -= 1 / SLICE_GRID) };
			}
		}
		for (const b of frame.blocks) {
			const area = b.width * b.height;
			if (b.height <= BLOCK_MIN_SIDE && b.width <= BLOCK_MIN_SIDE) continue;
			if (!target || area > target.area) {
				target = {
					area,
					trim: () => {
						if (b.width >= b.height && b.width > BLOCK_MIN_SIDE) b.width -= 1 / BLOCK_GRID;
						else if (b.height > BLOCK_MIN_SIDE) b.height -= 1 / BLOCK_GRID;
						// A smaller window needs a smaller reach of the picture behind it.
						b.dx = clamp(b.dx, Math.max(b.left + b.width - 1, -MAX_DX), Math.min(b.left, MAX_DX));
						b.dy = clamp(b.dy, Math.max(b.top + b.height - 1, -MAX_DY), Math.min(b.top, MAX_DY));
					}
				};
			}
		}
		if (!target) break;
		target.trim();
	}
	return frame;
}

interface FrameSpec {
	at: number;
	/** The whole image underneath. */
	show: Shown;
	/** 0 to 1: how many fragments, and how far they reach. */
	power: number;
	/** The most of the die the fragments may cover. */
	cap: number;
	/** The image a fragment is cut from, asked once per fragment. */
	source: () => Shown;
}

function makeFrame(rng: Rng, spec: FrameSpec): Frame {
	const { power, cap } = spec;
	const sliceCount = 2 + Math.round(power * 2);
	const blockCount = 1 + Math.round(power * 2);
	const sliceShares = shares(rng, sliceCount);
	const blockShares = shares(rng, blockCount);
	const frame: Frame = {
		at: spec.at,
		show: spec.show,
		slices: sliceShares.map((share) =>
			makeSlice(rng, cap * SLICE_AREA_SHARE * share, power, spec.source())
		),
		blocks: blockShares.map((share) =>
			makeBlock(rng, cap * (1 - SLICE_AREA_SHARE) * share, spec.source())
		)
	};
	return fit(frame, cap);
}

// ---- Events ------------------------------------------------------------------------------

/** Frame times from `from` while they stay below `until`, `MIN_FRAME_MS` to `MAX_FRAME_MS` apart. */
function frameTimes(rng: Rng, from: number, until: number): number[] {
	const times = [from];
	for (let t = from + rng.int(MIN_FRAME_MS, MAX_FRAME_MS); t < until;) {
		times.push(t);
		t += rng.int(MIN_FRAME_MS, MAX_FRAME_MS);
	}
	return times;
}

/**
 * `count` frame times in [from, until): the first exactly at `from`, the rest evenly spread
 * with a little jitter, `MIN_FRAME_MS` apart and the last `MIN_FRAME_MS` short of `until`.
 */
function spreadTimes(rng: Rng, from: number, until: number, count: number): number[] {
	const slot = (until - from) / count;
	const times = [from];
	for (let i = 1; i < count; i++) {
		const jitter = rng.range(-0.15, 0.15) * slot;
		const wanted = Math.round(from + slot * i + jitter);
		times.push(clamp(wanted, times[i - 1] + MIN_FRAME_MS, until - MIN_FRAME_MS * (count - i)));
	}
	return times;
}

const tearCap = (power: number) => MAX_TEAR_AREA * (0.55 + 0.45 * power);
const swapCap = (power: number) => MAX_SWAP_AREA * (0.35 + 0.65 * power);

const otherOf = (shown: Shown): Shown => (shown === 'photo' ? 'avatar' : 'photo');

/**
 * One frame of a tear or a flash, with `show` underneath: slices thrown sideways and blocks in the
 * wrong colours. With the avatar there, some frames have fragments of the other image leak in,
 * the same for either image underneath.
 */
function tearFrame(rng: Rng, at: number, show: Shown, avatar: boolean): Frame {
	const bleeds = avatar && rng.chance(BLEED_FRAME_SHARE);
	const share = OTHER_FRAGMENT_SHARE / BLEED_FRAME_SHARE;
	const power = rng.range(0.45, 1);
	return makeFrame(rng, {
		at,
		show,
		power,
		cap: tearCap(power),
		source: () => (bleeds && rng.chance(share) ? otherOf(show) : show)
	});
}

/**
 * A tear: the image that holds the signal with slices thrown sideways and blocks in the wrong
 * colours, a new set every 60 to 110 ms. It holds the signal afterwards too.
 */
function tear(rng: Rng, at: number, duration: number, holder: Shown, avatar: boolean): GlitchEvent {
	return {
		at,
		kind: 'tear',
		duration,
		from: holder,
		to: holder,
		frames: frameTimes(rng, 0, duration).map((time) => tearFrame(rng, time, holder, avatar))
	};
}

/**
 * A flash: a tear with the other image whole for exactly `FLASH_MS` in the middle of it, after
 * which the holder is back, still holding the signal.
 */
function flash(rng: Rng, at: number, duration: number, holder: Shown): GlitchEvent {
	// Before, the other image for FLASH_MS exactly in the middle, after: three frames.
	const on = Math.round((duration - FLASH_MS) / 2);
	return {
		at,
		kind: 'flash',
		duration,
		from: holder,
		to: holder,
		frames: [
			tearFrame(rng, 0, holder, true),
			tearFrame(rng, on, otherOf(holder), true),
			tearFrame(rng, on + FLASH_MS, holder, true)
		]
	};
}

/** How hard each of the 5 frames of a swap hits, by how many come before the middle: 2 or 3. */
const SWAP_POWER: Record<number, readonly number[]> = {
	2: [0.55, 0.9, 1, 0.7, 0.4],
	3: [0.4, 0.7, 1, 0.85, 0.5]
};

/**
 * A swap glitch: `SWAP_FRAMES` frames of fragments, the strongest in the middle, where the whole
 * image changes once. Underneath is the image that is going; most fragments are cut from the one
 * that is coming, and before the end that turns round, so each image tears into the other. The
 * image that is coming holds the signal from then on.
 */
function swap(rng: Rng, at: number, duration: number, from: Shown): GlitchEvent {
	const to = otherOf(from);
	const middle = Math.round(duration / 2);
	const before = rng.int(2, 3);
	const times = [
		...spreadTimes(rng, 0, middle, before),
		...spreadTimes(rng, middle, duration, SWAP_FRAMES - before)
	];
	const powers = SWAP_POWER[before];
	const frames = times.map((time, i): Frame => {
		const show = time < middle ? from : to;
		return makeFrame(rng, {
			at: time,
			show,
			power: powers[i],
			cap: swapCap(powers[i]),
			source: () => (rng.chance(SWAP_OTHER_SHARE) ? otherOf(show) : show)
		});
	});
	return { at, kind: 'swap', duration, from, to, frames };
}

/**
 * The next glitch, planned while `holder` holds the signal (the photo, when the glitch has just
 * armed; the image the last glitch left holding it after that). `startMs` is when the wait
 * begins: the glitch arming, or the end of the previous glitch. Every time in the result counts
 * from the same origin as `startMs`.
 *
 * It comes 4 to 8 s after `startMs`, so the first glitch is 4 to 8 s after the glitch arms and
 * two glitches are never closer than 4 s. What it is does not depend on which image holds the
 * signal: a swap, a flash or a tear at 35%, 30% and 35%. Without the avatar it is a tear of the
 * photo, and the photo holds the signal whatever `holder` says.
 */
export function nextGlitch(
	rng: Rng,
	startMs: number,
	holder: Shown,
	options: GlitchOptions = {}
): GlitchEvent {
	const avatar = options.avatar ?? true;
	const at = startMs + rng.int(GLITCH_WAIT_MIN_MS, GLITCH_WAIT_MAX_MS);
	const roll = rng.next();
	const home: Shown = avatar ? holder : 'photo';
	if (!avatar || roll >= SWAP_SHARE + FLASH_SHARE) {
		return tear(rng, at, rng.int(TEAR_MIN_MS, TEAR_MAX_MS), home, avatar);
	}
	if (roll < SWAP_SHARE) {
		return swap(rng, at, rng.int(SWAP_GLITCH_MIN_MS, SWAP_GLITCH_MAX_MS), home);
	}
	return flash(rng, at, rng.int(FLASH_GLITCH_MIN_MS, TEAR_MAX_MS), home);
}

// ---- The budget --------------------------------------------------------------------------

export interface Transition {
	/** In the same ms as the events. */
	at: number;
	/** The image the die shows from then on. */
	to: Shown;
}

/**
 * Every moment the whole image changes, photo to avatar or back, in order. The die starts on
 * `start`, the photo unless the events pick up where an avatar left off. A change of fragments is
 * not one.
 */
export function wholeImageTransitions(
	events: readonly GlitchEvent[],
	start: Shown = 'photo'
): Transition[] {
	const changes: Transition[] = [];
	let shown: Shown = start;
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
 * Every moment the picture changes at all, in order: each frame (the first one is the change from
 * rest) and the end of each event (the change back to rest). Each counts as a change whatever it
 * moves or recolours, which includes the whole-image changes.
 */
export function frameTransitions(events: readonly GlitchEvent[]): number[] {
	return events.flatMap((event) => [
		...event.frames.map((frame) => event.at + frame.at),
		event.at + event.duration
	]);
}

/**
 * The most changes of the picture in any window of `windowMs`. A window holds the changes from its
 * start up to, not including, its end. Two make a flash.
 */
export function maxTransitionsInWindow(events: readonly GlitchEvent[], windowMs: number): number {
	const times = frameTransitions(events);
	let most = 0;
	let from = 0;
	for (let to = 0; to < times.length; to++) {
		while (times[to] - times[from] >= windowMs) from++;
		most = Math.max(most, to - from + 1);
	}
	return most;
}
