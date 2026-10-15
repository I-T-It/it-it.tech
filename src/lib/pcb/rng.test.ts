import { describe, expect, it } from 'vitest';
import {
	BASE_SEED,
	boardSeed,
	createRng,
	deriveSeed,
	hashString,
	mulberry32,
	WIDTH_BUCKET
} from './rng.js';

function take(next: () => number, count: number): number[] {
	return Array.from({ length: count }, () => next());
}

describe('mulberry32', () => {
	it('is deterministic for a seed', () => {
		expect(take(mulberry32(42), 20)).toEqual(take(mulberry32(42), 20));
	});

	it('gives another sequence for another seed', () => {
		expect(take(mulberry32(1), 5)).not.toEqual(take(mulberry32(2), 5));
	});

	it('stays in [0, 1)', () => {
		for (const value of take(mulberry32(7), 10_000)) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});
});

describe('createRng', () => {
	it('is deterministic for a seed', () => {
		const a = createRng(99);
		const b = createRng(99);
		const draw = (rng: typeof a) => [rng.next(), rng.int(0, 10), rng.range(5, 6), rng.chance(0.5)];
		expect(draw(a)).toEqual(draw(b));
	});

	it('draws integers inclusive of both bounds', () => {
		const rng = createRng(3);
		const seen = new Set<number>();
		for (let i = 0; i < 2000; i++) seen.add(rng.int(2, 5));
		expect([...seen].sort()).toEqual([2, 3, 4, 5]);
	});

	it('returns min for an empty integer range', () => {
		expect(createRng(3).int(4, 4)).toBe(4);
		expect(createRng(3).int(4, 1)).toBe(4);
	});

	it('draws floats in [min, max)', () => {
		const rng = createRng(5);
		for (let i = 0; i < 1000; i++) {
			const value = rng.range(-3, 3);
			expect(value).toBeGreaterThanOrEqual(-3);
			expect(value).toBeLessThan(3);
		}
	});

	it('picks from a list', () => {
		const rng = createRng(11);
		const items = ['a', 'b', 'c'] as const;
		for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items));
	});
});

describe('seeds', () => {
	it('hashes strings stably and differently', () => {
		expect(hashString('about')).toBe(hashString('about'));
		expect(hashString('about')).not.toBe(hashString('skills'));
		expect(Number.isInteger(hashString('x'))).toBe(true);
		expect(hashString('x')).toBeGreaterThanOrEqual(0);
	});

	it('derives a stable sub-seed per key', () => {
		expect(deriveSeed(1, 'chip')).toBe(deriveSeed(1, 'chip'));
		expect(deriveSeed(1, 'chip')).not.toBe(deriveSeed(2, 'chip'));
		expect(deriveSeed(1, 'chip')).not.toBe(deriveSeed(1, 'other'));
	});

	it('is a constant plus the viewport-width bucket', () => {
		expect(boardSeed(0)).toBe(BASE_SEED);
		expect(boardSeed(1440)).toBe(BASE_SEED + Math.floor(1440 / WIDTH_BUCKET));
		expect(boardSeed(1440)).toBe(boardSeed(1440 + WIDTH_BUCKET - 1 - (1440 % WIDTH_BUCKET)));
		expect(boardSeed(1440)).not.toBe(boardSeed(1440 + WIDTH_BUCKET));
	});
});
