import { describe, expect, it } from 'vitest';
import {
	boundsOf,
	cumulativeLengths,
	dirOf,
	DX,
	DY,
	inflateRect,
	isOctilinear,
	lengthAbove,
	nearestOnPolyline,
	pointAt,
	rectContains,
	simplify,
	slicePolyline,
	turnSteps,
	type Point
} from './geometry.js';

// An L with a 45-degree corner: 100 right, a diagonal of 30 down-right, then 50 right.
const path: Point[] = [
	{ x: 0, y: 0 },
	{ x: 100, y: 0 },
	{ x: 130, y: 30 },
	{ x: 180, y: 30 }
];
const diagonal = 30 * Math.SQRT2;
const lengths = cumulativeLengths(path);

describe('directions', () => {
	it('lists the eight headings clockwise from east', () => {
		expect(DX).toEqual([1, 1, 0, -1, -1, -1, 0, 1]);
		expect(DY).toEqual([0, 1, 1, 1, 0, -1, -1, -1]);
	});

	it('finds the heading of an octilinear step and rejects the rest', () => {
		expect(dirOf(12, 0)).toBe(0);
		expect(dirOf(5, 5)).toBe(1);
		expect(dirOf(0, -3)).toBe(6);
		expect(dirOf(-2, 2)).toBe(3);
		expect(dirOf(2, 1)).toBe(-1);
		expect(dirOf(0, 0)).toBe(-1);
	});

	it('counts turns in 45-degree steps', () => {
		expect(turnSteps(0, 0)).toBe(0);
		expect(turnSteps(0, 1)).toBe(1);
		expect(turnSteps(0, 7)).toBe(1);
		expect(turnSteps(0, 2)).toBe(2);
		expect(turnSteps(1, 5)).toBe(4);
	});
});

describe('polylines', () => {
	it('measures cumulative lengths', () => {
		expect(lengths[0]).toBe(0);
		expect(lengths[1]).toBe(100);
		expect(lengths[2]).toBeCloseTo(100 + diagonal);
		expect(lengths[3]).toBeCloseTo(150 + diagonal);
	});

	it('finds the point at a length and clamps outside the line', () => {
		expect(pointAt(path, lengths, 50)).toEqual({ x: 50, y: 0 });
		const mid = pointAt(path, lengths, 100 + diagonal / 2);
		expect(mid.x).toBeCloseTo(115);
		expect(mid.y).toBeCloseTo(15);
		expect(pointAt(path, lengths, -5)).toEqual({ x: 0, y: 0 });
		expect(pointAt(path, lengths, 1e6)).toEqual({ x: 180, y: 30 });
	});

	it('slices the drawn part of a line', () => {
		expect(slicePolyline(path, lengths, 0)).toEqual([]);
		expect(slicePolyline(path, lengths, 40)).toEqual([
			{ x: 0, y: 0 },
			{ x: 40, y: 0 }
		]);
		const cut = slicePolyline(path, lengths, 100 + diagonal);
		expect(cut).toHaveLength(3);
		expect(cut[2].x).toBeCloseTo(130);
		expect(slicePolyline(path, lengths, 1e6)).toEqual(path);
	});

	it('finds the nearest point on a line', () => {
		const near = nearestOnPolyline(path, lengths, { x: 60, y: -20 });
		expect(near.point).toEqual({ x: 60, y: 0 });
		expect(near.along).toBeCloseTo(60);
		expect(near.distance).toBeCloseTo(20);
	});

	it('only looks at the first part of a line when asked', () => {
		const near = nearestOnPolyline(path, lengths, { x: 170, y: 30 }, 50);
		expect(near.point).toEqual({ x: 50, y: 0 });
		expect(near.along).toBeCloseTo(50);
	});

	it('measures the part of a line down to a given y', () => {
		const down: Point[] = [
			{ x: 0, y: 100 },
			{ x: 0, y: 200 },
			{ x: 30, y: 230 },
			{ x: 30, y: 300 }
		];
		const along = cumulativeLengths(down);
		expect(lengthAbove(down, along, 50)).toBe(0);
		expect(lengthAbove(down, along, 100)).toBe(0);
		expect(lengthAbove(down, along, 150)).toBe(50);
		expect(lengthAbove(down, along, 215)).toBeCloseTo(100 + 15 * Math.SQRT2);
		expect(lengthAbove(down, along, 300)).toBe(along[3]);
		expect(lengthAbove(down, along, 9999)).toBe(along[3]);
		// A horizontal run counts whole once the y reaches it.
		expect(lengthAbove(path, lengths, -1)).toBe(0);
		expect(lengthAbove(path, lengths, 0)).toBe(100);
		expect(lengthAbove(path, lengths, 15)).toBeCloseTo(100 + diagonal / 2);
		// A line that turns back up stops at the first point below y.
		const hook: Point[] = [
			{ x: 0, y: 0 },
			{ x: 0, y: 100 },
			{ x: 50, y: 50 },
			{ x: 50, y: 400 }
		];
		expect(lengthAbove(hook, cumulativeLengths(hook), 90)).toBe(90);
		expect(lengthAbove([], [], 10)).toBe(0);
	});

	it('drops repeated and collinear points', () => {
		expect(
			simplify([
				{ x: 0, y: 0 },
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 20, y: 0 },
				{ x: 30, y: 10 },
				{ x: 40, y: 20 }
			])
		).toEqual([
			{ x: 0, y: 0 },
			{ x: 20, y: 0 },
			{ x: 40, y: 20 }
		]);
	});

	it('accepts octilinear lines with 45-degree corners only', () => {
		expect(isOctilinear(path)).toBe(true);
		// A 90-degree corner.
		expect(
			isOctilinear([
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 10, y: 10 }
			])
		).toBe(false);
		// A segment at another angle.
		expect(
			isOctilinear([
				{ x: 0, y: 0 },
				{ x: 10, y: 4 }
			])
		).toBe(false);
	});
});

describe('rects', () => {
	it('bounds points', () => {
		expect(boundsOf(path)).toEqual({ x: 0, y: 0, width: 180, height: 30 });
	});

	it('inflates and tests containment', () => {
		const rect = inflateRect({ x: 10, y: 10, width: 20, height: 20 }, 5);
		expect(rect).toEqual({ x: 5, y: 5, width: 30, height: 30 });
		expect(rectContains(rect, { x: 5, y: 5 })).toBe(true);
		expect(rectContains(rect, { x: 36, y: 20 })).toBe(false);
	});
});
