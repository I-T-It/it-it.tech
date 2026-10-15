/**
 * Seeded randomness for the PCB board. Same seed, same board: the engine never calls Math.random().
 *
 * The board seed is a constant plus the viewport-width bucket (`boardSeed(width)`). A relayout
 * inside one bucket (a `<details>` toggle, a font swap, a small resize) draws the same board again.
 * Layout derives a sub-seed per chip and per gutter band (`deriveSeed`), so a change in one chip
 * does not reshuffle the random choices of the others.
 *
 * ```ts
 * const rng = createRng(deriveSeed(boardSeed(innerWidth), 'about:left'));
 * rng.int(2, 5); // bus size
 * ```
 */

/** The constant part of every board seed. */
export const BASE_SEED = 0x1717_7ec4;

/** Viewport widths are bucketed per this many CSS px before they go into the seed. */
export const WIDTH_BUCKET = 160;

/** mulberry32: a tiny, fast 32-bit PRNG. Returns a function that yields floats in [0, 1). */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface Rng {
	/** A float in [0, 1). */
	next(): number;
	/** An integer in [min, max], both inclusive. Returns `min` when `max <= min`. */
	int(min: number, max: number): number;
	/** A float in [min, max). */
	range(min: number, max: number): number;
	/** True with probability `p`. */
	chance(p: number): boolean;
	/** One item of a non-empty list. */
	pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
	const next = mulberry32(seed);
	return {
		next,
		int: (min, max) => (max <= min ? min : min + Math.floor(next() * (max - min + 1))),
		range: (min, max) => min + next() * (max - min),
		chance: (p) => next() < p,
		pick: (items) => items[Math.floor(next() * items.length)]
	};
}

/** FNV-1a, 32 bit. A stable, unsigned hash of a string. */
export function hashString(text: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** A sub-seed for one part of the board, stable per `(seed, key)`. */
export function deriveSeed(seed: number, key: string): number {
	return (hashString(key) ^ Math.imul(seed >>> 0, 0x9e3779b1)) >>> 0;
}

/** The board seed for a viewport width: `BASE_SEED` plus the width bucket. */
export function boardSeed(viewportWidth: number): number {
	return BASE_SEED + Math.floor(Math.max(0, viewportWidth) / WIDTH_BUCKET);
}
