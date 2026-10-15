import { describe, expect, it } from 'vitest';
import { BLOCKED, CLEARANCE, FREE, Grid, PITCH, TRACE, walkCells } from './grid.js';

/** A grid of `cols` x `rows` cells. */
function grid(cols: number, rows: number): Grid {
	return new Grid(cols * PITCH, rows * PITCH);
}

describe('Grid', () => {
	it('covers the document at a 12 px pitch, whole cells only', () => {
		const g = new Grid(1440, 8000);
		expect(PITCH).toBe(12);
		expect(g.cols).toBe(120);
		expect(g.rows).toBe(666);
		expect(g.cells).toHaveLength(120 * 666);
	});

	it('maps px to cells and cells to their centres', () => {
		const g = grid(10, 10);
		expect(g.cellAt({ x: 0, y: 0 })).toEqual({ col: 0, row: 0 });
		expect(g.cellAt({ x: 25, y: 13 })).toEqual({ col: 2, row: 1 });
		expect(g.centre(2, 1)).toEqual({ x: 30, y: 18 });
	});

	it('treats cells outside the grid as blocked', () => {
		const g = grid(4, 4);
		expect(g.isFree(0, 0)).toBe(true);
		expect(g.get(-1, 0)).toBe(BLOCKED);
		expect(g.get(4, 0)).toBe(BLOCKED);
		expect(g.isFree(0, 4)).toBe(false);
	});

	it('blocks an obstacle inflated by one cell', () => {
		const g = grid(12, 12);
		// Exactly cells 4..5 in both directions.
		g.blockRect({ x: 48, y: 48, width: 24, height: 24 });
		for (let i = 3; i <= 6; i++) {
			expect(g.get(i, 3)).toBe(BLOCKED);
			expect(g.get(3, i)).toBe(BLOCKED);
			expect(g.get(i, 6)).toBe(BLOCKED);
		}
		expect(g.get(2, 4)).toBe(FREE);
		expect(g.get(7, 4)).toBe(FREE);
		expect(g.get(4, 2)).toBe(FREE);
		expect(g.get(4, 7)).toBe(FREE);
	});

	it('blocks every cell a rect touches, also off the cell lines', () => {
		const g = grid(12, 12);
		g.blockRect({ x: 50, y: 50, width: 1, height: 1 }, 0);
		expect(g.get(4, 4)).toBe(BLOCKED);
		expect(g.get(3, 4)).toBe(FREE);
		expect(g.get(5, 4)).toBe(FREE);
	});

	it('inflates columns and rows separately', () => {
		const g = grid(12, 12);
		g.blockRect({ x: 48, y: 48, width: 24, height: 24 }, 0, 1);
		expect(g.get(3, 4)).toBe(FREE);
		expect(g.get(4, 3)).toBe(BLOCKED);
	});

	it('clips rects that leave the grid', () => {
		const g = grid(4, 4);
		expect(() => g.blockRect({ x: -100, y: -100, width: 1000, height: 1000 })).not.toThrow();
		expect(g.cells.every((state) => state === BLOCKED)).toBe(true);
	});

	it('marks a trace with one cell of clearance and a lane ring for its bus', () => {
		const g = grid(12, 12);
		g.markPath(
			[
				{ col: 2, row: 5 },
				{ col: 8, row: 5 }
			],
			3
		);
		for (let col = 2; col <= 8; col++) expect(g.get(col, 5)).toBe(TRACE);
		expect(g.get(1, 5)).toBe(CLEARANCE);
		expect(g.get(9, 5)).toBe(CLEARANCE);
		expect(g.get(5, 4)).toBe(CLEARANCE);
		expect(g.get(5, 6)).toBe(CLEARANCE);
		expect(g.get(1, 4)).toBe(CLEARANCE);
		// Two cells away: still free, but a lane of bus 3.
		expect(g.get(5, 7)).toBe(FREE);
		expect(g.get(5, 3)).toBe(FREE);
		expect(g.lane[g.index(5, 7)]).toBe(3);
		expect(g.lane[g.index(0, 5)]).toBe(3);
		expect(g.lane[g.index(5, 8)]).toBe(0);
	});

	it('never turns an obstacle into clearance', () => {
		const g = grid(12, 12);
		g.blockRect({ x: 48, y: 72, width: 12, height: 12 }, 0);
		g.markPath([
			{ col: 2, row: 5 },
			{ col: 8, row: 5 }
		]);
		expect(g.get(4, 6)).toBe(BLOCKED);
	});
});

describe('walkCells', () => {
	it('rasterises octilinear corners into every cell on the way', () => {
		expect(
			walkCells([
				{ col: 0, row: 0 },
				{ col: 2, row: 0 },
				{ col: 4, row: 2 }
			])
		).toEqual([
			{ col: 0, row: 0 },
			{ col: 1, row: 0 },
			{ col: 2, row: 0 },
			{ col: 3, row: 1 },
			{ col: 4, row: 2 }
		]);
	});

	it('keeps a single cell', () => {
		expect(walkCells([{ col: 3, row: 3 }])).toEqual([{ col: 3, row: 3 }]);
	});

	it('rejects a segment that is not octilinear', () => {
		expect(() =>
			walkCells([
				{ col: 0, row: 0 },
				{ col: 2, row: 1 }
			])
		).toThrow(/octilinear/);
	});
});
