/**
 * Timing budgets for tests that run on a shared CI runner. The same work takes 4x or more as long
 * there from one run to the next, and the first runs also pay for compiling the code, so a fixed
 * number of milliseconds fails at random. Instead the work is timed best-of-N next to a fixed chunk
 * of plain JS, and held to a multiple of that chunk: a slow machine slows both, a change that
 * really makes the work slower does not slow the reference.
 */

/**
 * Milliseconds for a fixed chunk of plain JS (arithmetic, array pushes, a sort): how fast this
 * machine runs scripts right now. The same work every time, so only the machine changes it.
 */
export function referenceMs(): number {
	const start = performance.now();
	const values: number[] = [];
	let x = 1;
	for (let i = 0; i < 50_000; i++) {
		x = (x * 1664525 + 1013904223) >>> 0;
		values.push(x);
	}
	values.sort((a, b) => a - b);
	return performance.now() - start;
}

export interface BudgetMeasure {
	/** The fastest run of the work, in ms. */
	ms: number;
	/** The fastest run of `referenceMs`, taken between the runs. */
	reference: number;
	/** `ms` over `reference`. */
	ratio: number;
}

/**
 * Runs the work once to warm up, then `rounds` times, each after three runs of `referenceMs`, and
 * returns the best of each. `run` does the work once and returns how long it took in ms.
 */
export async function measureAgainstReference(
	run: () => number | Promise<number>,
	rounds = 5
): Promise<BudgetMeasure> {
	await run();
	let ms = Infinity;
	let reference = Infinity;
	for (let i = 0; i < rounds; i++) {
		for (let j = 0; j < 3; j++) reference = Math.min(reference, referenceMs());
		ms = Math.min(ms, await run());
	}
	return { ms, reference, ratio: ms / reference };
}

/** One line for the CI log, so a budget that creeps up shows before it fails. */
export function describeMeasure(name: string, measure: BudgetMeasure, limit: number): string {
	return (
		`${name} ${measure.ms.toFixed(1)} ms, reference ${measure.reference.toFixed(1)} ms, ` +
		`ratio ${measure.ratio.toFixed(2)} (limit ${limit})`
	);
}
