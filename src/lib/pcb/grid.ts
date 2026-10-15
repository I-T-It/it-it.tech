/**
 * Occupancy grid over the document at a 12 CSS px pitch. Pure data, no DOM.
 *
 * Every cell holds one state:
 * - `FREE`: open board.
 * - `BLOCKED`: an obstacle (chip, logo, photo) inflated by one cell, or content traces stay out of.
 * - `TRACE`: a routed trace runs through it.
 * - `CLEARANCE`: next to a trace (one cell, all eight neighbours), so traces keep 24 px apart.
 *
 * Next to that, `lane` holds the bus number of the ring two cells around a trace. A trace of the
 * same bus is cheaper there (see `router.ts`), which is what makes a bus run in parallel.
 *
 * Cell (col, row) covers px [col * 12, col * 12 + 12) and has its centre at col * 12 + 6. Only whole
 * cells are part of the grid; cells outside it count as `BLOCKED`.
 */

import { dirOf, DX, DY, type Point, type Rect } from './geometry.js';

/** Grid pitch in CSS px. */
export const PITCH = 12;

export const FREE = 0;
export const BLOCKED = 1;
export const CLEARANCE = 2;
export const TRACE = 3;
export type CellState = typeof FREE | typeof BLOCKED | typeof CLEARANCE | typeof TRACE;

export interface Cell {
	col: number;
	row: number;
}

export class Grid {
	readonly cols: number;
	readonly rows: number;
	readonly pitch: number;
	/** One `CellState` per cell, row-major (`index(col, row)`). */
	readonly cells: Uint8Array;
	/** Bus number of the lane ring a cell is part of; 0 for none. */
	readonly lane: Int32Array;

	/** A grid over a document of `width` x `height` CSS px. */
	constructor(width: number, height: number, pitch = PITCH) {
		this.pitch = pitch;
		this.cols = Math.max(0, Math.floor(width / pitch));
		this.rows = Math.max(0, Math.floor(height / pitch));
		this.cells = new Uint8Array(this.cols * this.rows);
		this.lane = new Int32Array(this.cols * this.rows);
	}

	index(col: number, row: number): number {
		return row * this.cols + col;
	}

	inBounds(col: number, row: number): boolean {
		return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
	}

	/** The state of a cell; `BLOCKED` outside the grid. */
	get(col: number, row: number): CellState {
		return this.inBounds(col, row) ? (this.cells[row * this.cols + col] as CellState) : BLOCKED;
	}

	isFree(col: number, row: number): boolean {
		return this.inBounds(col, row) && this.cells[row * this.cols + col] === FREE;
	}

	/** The cell that holds a px point. It can lie outside the grid. */
	cellAt(p: Point): Cell {
		return { col: Math.floor(p.x / this.pitch), row: Math.floor(p.y / this.pitch) };
	}

	/** The px centre of a cell. */
	centre(col: number, row: number): Point {
		return { x: col * this.pitch + this.pitch / 2, y: row * this.pitch + this.pitch / 2 };
	}

	/** Sets every cell in the inclusive range to `BLOCKED`, clipped to the grid. */
	blockCells(col0: number, row0: number, col1: number, row1: number): void {
		const c0 = Math.max(0, col0);
		const r0 = Math.max(0, row0);
		const c1 = Math.min(this.cols - 1, col1);
		const r1 = Math.min(this.rows - 1, row1);
		for (let row = r0; row <= r1; row++) {
			this.cells.fill(BLOCKED, row * this.cols + c0, row * this.cols + c1 + 1);
		}
	}

	/**
	 * Blocks every cell the px rect touches after inflating it by `inflateCols` cells left and right
	 * and `inflateRows` cells top and bottom (default: one cell all round).
	 */
	blockRect(rect: Rect, inflateCols = 1, inflateRows = inflateCols): void {
		const p = this.pitch;
		const x0 = rect.x - inflateCols * p;
		const y0 = rect.y - inflateRows * p;
		const x1 = rect.x + rect.width + inflateCols * p;
		const y1 = rect.y + rect.height + inflateRows * p;
		if (x1 <= x0 || y1 <= y0) return;
		this.blockCells(
			Math.floor(x0 / p),
			Math.floor(y0 / p),
			Math.ceil(x1 / p) - 1,
			Math.ceil(y1 / p) - 1
		);
	}

	/**
	 * Marks a routed trace: its cells become `TRACE`, the free cells around them `CLEARANCE`, and the
	 * free ring two cells out becomes a lane of `bus` (when `bus` > 0).
	 */
	markPath(corners: readonly Cell[], bus = 0): void {
		const path = walkCells(corners);
		for (const { col, row } of path) {
			if (this.inBounds(col, row)) this.cells[this.index(col, row)] = TRACE;
		}
		for (const { col, row } of path) {
			for (let dr = -2; dr <= 2; dr++) {
				for (let dc = -2; dc <= 2; dc++) {
					const c = col + dc;
					const r = row + dr;
					if (!this.inBounds(c, r)) continue;
					const i = this.index(c, r);
					if (this.cells[i] !== FREE) continue;
					if (Math.abs(dc) <= 1 && Math.abs(dr) <= 1) this.cells[i] = CLEARANCE;
					else if (bus > 0) this.lane[i] = bus;
				}
			}
		}
	}
}

/** Every cell on an octilinear corner path, both ends included. Throws on any other angle. */
export function walkCells(corners: readonly Cell[]): Cell[] {
	if (corners.length === 0) return [];
	const out: Cell[] = [{ col: corners[0].col, row: corners[0].row }];
	for (let i = 1; i < corners.length; i++) {
		const a = corners[i - 1];
		const b = corners[i];
		const d = dirOf(b.col - a.col, b.row - a.row);
		if (d === -1) {
			if (a.col === b.col && a.row === b.row) continue;
			throw new Error(`Segment ${a.col},${a.row} to ${b.col},${b.row} is not octilinear`);
		}
		const steps = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
		for (let s = 1; s <= steps; s++) out.push({ col: a.col + DX[d] * s, row: a.row + DY[d] * s });
	}
	return out;
}
