/**
 * Geometry shared by the PCB engine and the renderer. Pure functions, no DOM.
 *
 * Units: document CSS px, y pointing down. A trace is a polyline (`Point[]`) plus its cumulative
 * lengths (`cumulativeLengths`). Growth and pulses talk in "along" values: px along the line from
 * its first point. The renderer draws `slicePolyline(points, lengths, drawn)` and places a pulse at
 * `pointAt(points, lengths, along)`. The spine's drawn length is `lengthAbove(points, lengths, y)`.
 *
 * Headings (`Dir`) are the eight octilinear directions, clockwise from east:
 * 0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE. Traces only turn by one step (45 degrees) per corner.
 */

export interface Point {
	x: number;
	y: number;
}

/** Same shape as a DOMRect, so a measured rect plus the scroll offset fits straight in. */
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** An octilinear heading, 0 (east) to 7 (north-east), clockwise. */
export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DX: readonly number[] = [1, 1, 0, -1, -1, -1, 0, 1];
export const DY: readonly number[] = [0, 1, 1, 1, 0, -1, -1, -1];

export const EAST: Dir = 0;
export const WEST: Dir = 4;

/** The heading of a step, or -1 when the step is empty or not a multiple of 45 degrees. */
export function dirOf(dx: number, dy: number): Dir | -1 {
	const ax = Math.abs(dx);
	const ay = Math.abs(dy);
	const eps = 1e-6 * Math.max(ax, ay, 1);
	if (ax <= eps && ay <= eps) return -1;
	const sx = ax <= eps ? 0 : Math.sign(dx);
	const sy = ay <= eps ? 0 : Math.sign(dy);
	if (sx !== 0 && sy !== 0 && Math.abs(ax - ay) > eps) return -1;
	for (let d = 0; d < 8; d++) {
		if (DX[d] === sx && DY[d] === sy) return d as Dir;
	}
	return -1;
}

/** How many 45-degree steps lie between two headings: 0 (straight) to 4 (reverse). */
export function turnSteps(a: Dir, b: Dir): number {
	const diff = Math.abs(a - b) % 8;
	return Math.min(diff, 8 - diff);
}

/** Cumulative length at every point. The first entry is 0, the last the total length. */
export function cumulativeLengths(points: readonly Point[]): number[] {
	const lengths = new Array<number>(points.length);
	let total = 0;
	for (let i = 0; i < points.length; i++) {
		if (i > 0) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
		lengths[i] = total;
	}
	return lengths;
}

/** Index of the segment that holds `along`: the last i with lengths[i] <= along. */
function segmentIndex(lengths: readonly number[], along: number): number {
	let lo = 0;
	let hi = lengths.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (lengths[mid] <= along) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

/** The point `along` px down the line, clamped to its ends. */
export function pointAt(
	points: readonly Point[],
	lengths: readonly number[],
	along: number
): Point {
	const last = points.length - 1;
	if (last < 0) return { x: 0, y: 0 };
	if (along <= 0) return { ...points[0] };
	if (along >= lengths[last]) return { ...points[last] };
	const i = segmentIndex(lengths, along);
	const span = lengths[i + 1] - lengths[i];
	const t = span > 0 ? (along - lengths[i]) / span : 0;
	return {
		x: points[i].x + (points[i + 1].x - points[i].x) * t,
		y: points[i].y + (points[i + 1].y - points[i].y) * t
	};
}

/** The first `along` px of the line, ready to stroke. Empty when nothing is drawn yet. */
export function slicePolyline(
	points: readonly Point[],
	lengths: readonly number[],
	along: number
): Point[] {
	const last = points.length - 1;
	if (last < 1 || along <= 0) return [];
	if (along >= lengths[last]) return points.slice();
	const i = segmentIndex(lengths, along);
	const out = points.slice(0, i + 1);
	if (along > lengths[i]) out.push(pointAt(points, lengths, along));
	return out;
}

/**
 * How much of the line, from its first point, stays on or above document y `y` (y points down):
 * the drawn length of a trace that grows downward to a front at `y`. It stops where the line
 * first goes below `y`, and a horizontal run counts whole once `y` reaches it.
 */
export function lengthAbove(
	points: readonly Point[],
	lengths: readonly number[],
	y: number
): number {
	if (points.length === 0 || points[0].y > y) return 0;
	for (let i = 0; i + 1 < points.length; i++) {
		const a = points[i];
		const b = points[i + 1];
		if (b.y <= y) continue;
		// a is on or above y and b below it, so the segment goes down and crosses y.
		return lengths[i] + ((lengths[i + 1] - lengths[i]) * (y - a.y)) / (b.y - a.y);
	}
	return lengths[lengths.length - 1];
}

export interface Nearest {
	/** Px along the line to the nearest point. */
	along: number;
	/** Distance from the query point to the line. Infinity for an empty line. */
	distance: number;
	point: Point;
}

/**
 * The point of the line closest to `p`. With `maxAlong`, only the first `maxAlong` px count (the
 * part of a trace that is drawn so far).
 */
export function nearestOnPolyline(
	points: readonly Point[],
	lengths: readonly number[],
	p: Point,
	maxAlong = Infinity
): Nearest {
	if (points.length === 0) return { along: 0, distance: Infinity, point: { x: 0, y: 0 } };
	let best: Nearest = {
		along: 0,
		distance: Math.hypot(p.x - points[0].x, p.y - points[0].y),
		point: { ...points[0] }
	};
	for (let i = 0; i + 1 < points.length && lengths[i] < maxAlong; i++) {
		const a = points[i];
		const span = lengths[i + 1] - lengths[i];
		if (span <= 0) continue;
		const usable = Math.min(span, maxAlong - lengths[i]);
		const ux = (points[i + 1].x - a.x) / span;
		const uy = (points[i + 1].y - a.y) / span;
		const t = Math.max(0, Math.min(usable, (p.x - a.x) * ux + (p.y - a.y) * uy));
		const x = a.x + ux * t;
		const y = a.y + uy * t;
		const distance = Math.hypot(p.x - x, p.y - y);
		if (distance < best.distance) best = { along: lengths[i] + t, distance, point: { x, y } };
	}
	return best;
}

/** Drops repeated points and points in the middle of a straight run. */
export function simplify(points: readonly Point[]): Point[] {
	const out: Point[] = [];
	for (const p of points) {
		const prev = out[out.length - 1];
		if (prev && prev.x === p.x && prev.y === p.y) continue;
		if (out.length >= 2) {
			const a = out[out.length - 2];
			const d1 = dirOf(prev.x - a.x, prev.y - a.y);
			const d2 = dirOf(p.x - prev.x, p.y - prev.y);
			if (d1 !== -1 && d1 === d2) out.pop();
		}
		out.push({ x: p.x, y: p.y });
	}
	return out;
}

/** True when every segment is octilinear and every corner turns by at most 45 degrees. */
export function isOctilinear(points: readonly Point[]): boolean {
	let prev: Dir | -1 = -1;
	for (let i = 1; i < points.length; i++) {
		const d = dirOf(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
		if (d === -1) return false;
		if (prev !== -1 && turnSteps(prev, d) > 1) return false;
		prev = d;
	}
	return true;
}

/** The smallest rect around the points. */
export function boundsOf(points: readonly Point[]): Rect {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const p of points) {
		if (p.x < x0) x0 = p.x;
		if (p.y < y0) y0 = p.y;
		if (p.x > x1) x1 = p.x;
		if (p.y > y1) y1 = p.y;
	}
	if (x0 > x1) return { x: 0, y: 0, width: 0, height: 0 };
	return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Grows a rect by `dx` left and right and `dy` (default `dx`) top and bottom. */
export function inflateRect(rect: Rect, dx: number, dy = dx): Rect {
	return {
		x: rect.x - dx,
		y: rect.y - dy,
		width: rect.width + 2 * dx,
		height: rect.height + 2 * dy
	};
}

/** True when `p` lies inside the rect or on its border. */
export function rectContains(rect: Rect, p: Point): boolean {
	return (
		p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height
	);
}
