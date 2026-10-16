import { describe, expect, it } from 'vitest';
import { dirOf, turnSteps, type Dir } from './geometry.js';
import { FREE, Grid, PITCH, walkCells, type Cell } from './grid.js';
import { createRng } from './rng.js';
import { route } from './router.js';

const E: Dir = 0;
const SE: Dir = 1;

function grid(cols: number, rows: number): Grid {
	return new Grid(cols * PITCH, rows * PITCH);
}

/** Blocks the inclusive cell range without inflation. */
function wall(g: Grid, col0: number, row0: number, col1: number, row1: number): void {
	g.blockCells(col0, row0, col1, row1);
}

/** A grid with a few random rectangular obstacles, the same per seed. */
function randomGrid(seed: number): Grid {
	const g = grid(60, 40);
	const rng = createRng(seed);
	for (let i = 0; i < 14; i++) {
		const col = rng.int(4, 54);
		const row = rng.int(0, 36);
		wall(g, col, row, col + rng.int(0, 4), row + rng.int(0, 5));
	}
	return g;
}

function headings(path: Cell[]): Dir[] {
	const dirs: Dir[] = [];
	for (let i = 1; i < path.length; i++) {
		const d = dirOf(path[i].col - path[i - 1].col, path[i].row - path[i - 1].row);
		expect(d).not.toBe(-1);
		dirs.push(d as Dir);
	}
	return dirs;
}

describe('route', () => {
	it('reaches a reachable pin around a wall', () => {
		const g = grid(30, 20);
		wall(g, 10, 0, 11, 14);
		const path = route(g, { col: 2, row: 2 }, { col: 25, row: 2 });
		expect(path).not.toBeNull();
		expect(path![0]).toEqual({ col: 2, row: 2 });
		expect(path!.at(-1)).toEqual({ col: 25, row: 2 });
		expect(walkCells(path!).some((cell) => cell.row > 14)).toBe(true);
	});

	it('never enters obstacle cells', () => {
		for (let seed = 1; seed <= 20; seed++) {
			const g = randomGrid(seed);
			const from = { col: 0, row: 20 };
			const to = { col: 59, row: 20 };
			if (!g.isFree(from.col, from.row) || !g.isFree(to.col, to.row)) continue;
			const path = route(g, from, to, { startDir: E });
			if (!path) continue;
			for (const cell of walkCells(path)) expect(g.get(cell.col, cell.row)).toBe(FREE);
		}
	});

	it('moves octilinearly and turns at most 45 degrees per corner', () => {
		let routed = 0;
		for (let seed = 1; seed <= 20; seed++) {
			const g = randomGrid(seed);
			const path = route(g, { col: 0, row: 5 }, { col: 59, row: 33 }, { startDir: E, endDir: E });
			if (!path) continue;
			routed++;
			const dirs = headings(path);
			expect(turnSteps(E, dirs[0])).toBeLessThanOrEqual(1);
			expect(dirs.at(-1)).toBe(E);
			for (let i = 1; i < dirs.length; i++) {
				// Corners only: a straight run is one segment.
				expect(dirs[i]).not.toBe(dirs[i - 1]);
				expect(turnSteps(dirs[i - 1], dirs[i])).toBe(1);
			}
		}
		expect(routed).toBeGreaterThan(10);
	});

	it('takes the fewest corners on open board', () => {
		const path = route(
			grid(40, 20),
			{ col: 0, row: 2 },
			{ col: 30, row: 10 },
			{
				startDir: E,
				endDir: E
			}
		);
		// One diagonal and straight runs: at most two corners.
		const dirs = headings(path!);
		expect(path!.length).toBeLessThanOrEqual(4);
		expect(dirs.filter((d) => d === SE)).toHaveLength(1);
		expect(dirs.every((d) => d === E || d === SE)).toBe(true);
		expect(dirs.at(-1)).toBe(E);
	});

	it('takes a dearer turn cost into account', () => {
		// A lane of bus 1 two rows down: cheap enough to detour onto at the default turn cost.
		const g = grid(30, 6);
		for (let col = 0; col < 30; col++) g.lane[g.index(col, 2)] = 1;
		const from = { col: 0, row: 0 };
		const to = { col: 20, row: 0 };
		const detour = route(g, from, to, { startDir: E, endDir: E, bus: 1 });
		const straight = route(g, from, to, { startDir: E, endDir: E, bus: 1, turnCost: 1.5 });
		expect(detour!.length).toBeGreaterThan(2);
		expect(straight).toEqual([from, to]);
	});

	it('returns null when the pin is enclosed', () => {
		const g = grid(20, 20);
		wall(g, 9, 9, 11, 11);
		g.cells[g.index(10, 10)] = FREE;
		expect(route(g, { col: 1, row: 1 }, { col: 10, row: 10 })).toBeNull();
	});

	it('returns null when the start or the goal is not free', () => {
		const g = grid(10, 10);
		wall(g, 5, 5, 5, 5);
		expect(route(g, { col: 5, row: 5 }, { col: 0, row: 0 })).toBeNull();
		expect(route(g, { col: 0, row: 0 }, { col: 5, row: 5 })).toBeNull();
	});

	it('returns the single cell when start and goal match', () => {
		expect(route(grid(5, 5), { col: 2, row: 2 }, { col: 2, row: 2 })).toEqual([{ col: 2, row: 2 }]);
	});

	it('is deterministic', () => {
		const a = route(randomGrid(4), { col: 0, row: 3 }, { col: 59, row: 30 }, { startDir: E });
		const b = route(randomGrid(4), { col: 0, row: 3 }, { col: 59, row: 30 }, { startDir: E });
		expect(a).not.toBeNull();
		expect(a).toEqual(b);
	});

	it('keeps clear of traces that are already routed', () => {
		const g = grid(40, 20);
		const first = route(g, { col: 0, row: 4 }, { col: 39, row: 12 }, { startDir: E })!;
		g.markPath(first, 1);
		const second = route(g, { col: 0, row: 8 }, { col: 39, row: 17 }, { startDir: E })!;
		expect(second).not.toBeNull();
		for (const cell of walkCells(second)) expect(g.get(cell.col, cell.row)).toBe(FREE);
	});

	it('prefers running parallel within a bus', () => {
		// The first trace of bus 1 runs along row 5. Its lane is row 7, one row above the
		// second trace's start: hugging it costs two extra corners.
		const setup = () => {
			const g = grid(40, 20);
			g.markPath(
				[
					{ col: 0, row: 5 },
					{ col: 36, row: 5 }
				],
				1
			);
			return g;
		};
		const from = { col: 0, row: 8 };
		const to = { col: 30, row: 13 };
		const options = { startDir: E, endDir: E } as const;
		const inLane = (path: Cell[] | null) => walkCells(path!).filter((c) => c.row === 7).length;

		expect(inLane(route(setup(), from, to, { ...options, bus: 1 }))).toBeGreaterThanOrEqual(15);
		expect(inLane(route(setup(), from, to, { ...options, bus: 2 }))).toBe(0);
		expect(inLane(route(setup(), from, to, options))).toBe(0);
	});

	it('stays inside its search window', () => {
		const g = grid(30, 30);
		wall(g, 10, 0, 10, 20);
		const from = { col: 2, row: 2 };
		const to = { col: 20, row: 2 };
		expect(route(g, from, to, { window: { col0: 0, row0: 0, col1: 29, row1: 15 } })).toBeNull();
		expect(route(g, from, to, { window: { col0: 0, row0: 0, col1: 29, row1: 29 } })).not.toBeNull();
	});

	it('returns the way to the closest reachable cell when asked for a partial route', () => {
		const g = grid(30, 10);
		wall(g, 15, 0, 15, 9);
		const path = route(g, { col: 0, row: 4 }, { col: 25, row: 4 }, { startDir: E, partial: true });
		expect(path).not.toBeNull();
		expect(path![0]).toEqual({ col: 0, row: 4 });
		expect(path!.at(-1)).toEqual({ col: 14, row: 4 });
	});
});
