import { describe, expect, it } from 'vitest';
import { makeTrace, type Board, type Side, type Trace, type TraceKind } from './layout.js';
import {
	CORE_WIDTH,
	DEFAULT_PALETTE,
	HALO_ALPHA,
	HALO_WIDTH,
	HERO_CORE_ALPHA,
	HERO_HALO_ALPHA,
	MAX_DPR,
	Renderer,
	capDpr,
	type FrameInput,
	type View
} from './renderer.js';

/** Records what the renderer asks of a 2D context. Enough of the API for the renderer. */
class RecordingContext {
	calls: { name: string; args: unknown[]; state: Record<string, unknown> }[] = [];
	lineWidth = 1;
	globalAlpha = 1;
	globalCompositeOperation = 'source-over';
	strokeStyle: unknown = '#000';
	fillStyle: unknown = '#000';
	lineCap = 'butt';
	lineJoin = 'miter';
	gradients: { stops: [number, string][] }[] = [];

	#record(name: string, args: unknown[]) {
		this.calls.push({
			name,
			args,
			state: {
				lineWidth: this.lineWidth,
				globalAlpha: this.globalAlpha,
				globalCompositeOperation: this.globalCompositeOperation,
				strokeStyle: this.strokeStyle,
				fillStyle: this.fillStyle
			}
		});
	}

	setTransform(...args: number[]) {
		this.#record('setTransform', args);
	}
	clearRect(...args: number[]) {
		this.#record('clearRect', args);
	}
	beginPath() {
		this.#record('beginPath', []);
	}
	moveTo(...args: number[]) {
		this.#record('moveTo', args);
	}
	lineTo(...args: number[]) {
		this.#record('lineTo', args);
	}
	arc(...args: number[]) {
		this.#record('arc', args);
	}
	closePath() {
		this.#record('closePath', []);
	}
	stroke() {
		this.#record('stroke', []);
	}
	fill() {
		this.#record('fill', []);
	}
	save() {
		this.#record('save', []);
	}
	restore() {
		this.#record('restore', []);
	}
	createLinearGradient(...args: number[]) {
		this.#record('createLinearGradient', args);
		const gradient = {
			stops: [] as [number, string][],
			addColorStop(offset: number, color: string) {
				gradient.stops.push([offset, color]);
			}
		};
		this.gradients.push(gradient);
		return gradient;
	}

	named(name: string) {
		return this.calls.filter((call) => call.name === name);
	}

	/** Every point passed to moveTo or lineTo, in document px once the transform is undone. */
	pathPoints() {
		return this.calls
			.filter((call) => call.name === 'moveTo' || call.name === 'lineTo')
			.map((call) => ({ x: call.args[0] as number, y: call.args[1] as number }));
	}

	reset() {
		this.calls = [];
		this.gradients = [];
	}
}

function trace(
	id: string,
	points: { x: number; y: number }[],
	kind: TraceKind = 'branch',
	side: Side = 'left',
	end: Trace['end'] = kind === 'branch' ? { kind: 'pin', chipId: 'about', pin: 0 } : { kind: 'via' }
): Trace {
	return makeTrace({
		id,
		kind,
		side,
		bus: id,
		points,
		end,
		chipId: kind === 'branch' ? 'about' : null,
		triggerY: points[0].y
	});
}

function board(traces: Trace[]): Board {
	return {
		seed: 1,
		width: 1200,
		height: 6000,
		narrow: false,
		heroBottom: 900,
		hero: null,
		traces,
		chips: []
	};
}

const VIEW: View = { scrollX: 0, scrollY: 0, width: 1200, height: 800 };

function frame(view: View, drawn: (id: string) => number = () => Infinity): FrameInput {
	return { view, drawn, pulses: [] };
}

function setup(traces: Trace[], dpr = 1) {
	const canvas = { width: 0, height: 0 };
	const ctx = new RecordingContext();
	const renderer = new Renderer(canvas, ctx as unknown as CanvasRenderingContext2D);
	renderer.resize(VIEW.width, VIEW.height, dpr);
	renderer.setBoard(board(traces));
	return { canvas, ctx, renderer };
}

describe('DPR', () => {
	it('caps the device pixel ratio at 2', () => {
		expect(MAX_DPR).toBe(2);
		expect(capDpr(3)).toBe(2);
		expect(capDpr(1.5)).toBe(1.5);
		expect(capDpr(0)).toBe(1);
		expect(capDpr(Number.NaN)).toBe(1);
	});

	it('sizes the backing store by the capped ratio', () => {
		const { canvas, renderer } = setup([], 3);
		expect(renderer.dpr).toBe(2);
		expect(canvas.width).toBe(2400);
		expect(canvas.height).toBe(1600);
	});

	it('reports whether a resize changed anything', () => {
		const { canvas, renderer } = setup([], 1);
		expect(renderer.resize(1200, 800, 1)).toBe(false);
		expect(renderer.resize(1000, 800, 1)).toBe(true);
		expect(canvas.width).toBe(1000);
	});

	it('draws in CSS px, scaled by the ratio and moved by the scroll offset', () => {
		const { ctx, renderer } = setup([], 2);
		renderer.draw(frame({ ...VIEW, scrollY: 300 }));
		const transforms = ctx.named('setTransform').map((call) => call.args);
		expect(transforms).toContainEqual([2, 0, 0, 2, 0, -600]);
	});
});

describe('viewport culling', () => {
	const inView = trace('in', [
		{ x: 40, y: 100 },
		{ x: 200, y: 100 }
	]);
	const below = trace('below', [
		{ x: 40, y: 3000 },
		{ x: 200, y: 3000 }
	]);
	const above = trace('above', [
		{ x: 40, y: 1000 },
		{ x: 200, y: 1000 }
	]);

	it('draws only the traces that cross the viewport', () => {
		const { ctx, renderer } = setup([inView, below]);
		const stats = renderer.draw(frame(VIEW));
		expect(stats.traces).toBe(1);
		const ys = new Set(ctx.pathPoints().map((p) => p.y));
		expect(ys.has(100)).toBe(true);
		expect(ys.has(3000)).toBe(false);
	});

	it('follows the scroll position', () => {
		const { ctx, renderer } = setup([inView, below, above]);
		const stats = renderer.draw(frame({ ...VIEW, scrollY: 2600 }));
		expect(stats.traces).toBe(1);
		const ys = new Set(ctx.pathPoints().map((p) => p.y));
		expect(ys.has(3000)).toBe(true);
		expect(ys.has(100)).toBe(false);
		expect(ys.has(1000)).toBe(false);
	});

	it('keeps a long trace that spans the viewport', () => {
		const spine = trace(
			'spine:L0',
			[
				{ x: 30, y: 900 },
				{ x: 30, y: 6000 }
			],
			'spine'
		);
		const { renderer } = setup([spine]);
		expect(renderer.draw(frame({ ...VIEW, scrollY: 3000 })).traces).toBe(1);
	});

	it('skips traces with nothing drawn yet', () => {
		const { ctx, renderer } = setup([inView]);
		const stats = renderer.draw(frame(VIEW, () => 0));
		expect(stats.traces).toBe(0);
		expect(ctx.named('stroke')).toHaveLength(0);
	});

	it('clears the whole canvas every frame', () => {
		const { canvas, ctx, renderer } = setup([inView], 2);
		renderer.draw(frame(VIEW));
		expect(ctx.named('clearRect')[0].args).toEqual([0, 0, canvas.width, canvas.height]);
	});
});

describe('drawing', () => {
	const branch = trace('about:L0.0', [
		{ x: 40, y: 100 },
		{ x: 80, y: 140 },
		{ x: 300, y: 140 }
	]);

	it('draws a halo pass and then a core pass, without shadowBlur', () => {
		const { ctx, renderer } = setup([branch]);
		renderer.draw(frame(VIEW));
		const strokes = ctx.named('stroke');
		const halo = strokes.find((s) => s.state.lineWidth === HALO_WIDTH);
		const core = strokes.find((s) => s.state.lineWidth === CORE_WIDTH);
		expect(halo?.state.globalAlpha).toBeCloseTo(HALO_ALPHA);
		expect(core).toBeDefined();
		expect(strokes.indexOf(halo!)).toBeLessThan(strokes.indexOf(core!));
		expect('shadowBlur' in ctx).toBe(false);
	});

	it('colours the core with a gradient toward the pad colour', () => {
		const { ctx, renderer } = setup([branch]);
		renderer.draw(frame(VIEW));
		const stops = ctx.gradients[0].stops;
		expect(stops[0][1]).toBe(DEFAULT_PALETTE.left.trace);
		expect(stops.at(-1)?.[1]).toBe(DEFAULT_PALETTE.left.pad);
	});

	it('reuses the gradient of a trace on the next frame', () => {
		const { ctx, renderer } = setup([branch]);
		renderer.draw(frame(VIEW));
		renderer.draw(frame({ ...VIEW, scrollY: 10 }));
		expect(ctx.named('createLinearGradient')).toHaveLength(1);
	});

	it('uses cyan on the left and green on the right', () => {
		const right = trace(
			'about:R0.0',
			[
				{ x: 1100, y: 100 },
				{ x: 900, y: 100 }
			],
			'branch',
			'right'
		);
		const { ctx, renderer } = setup([branch, right]);
		renderer.draw(frame(VIEW));
		const haloColours = ctx
			.named('stroke')
			.filter((s) => s.state.lineWidth === HALO_WIDTH)
			.map((s) => s.state.strokeStyle);
		expect(haloColours).toContain(DEFAULT_PALETTE.left.trace);
		expect(haloColours).toContain(DEFAULT_PALETTE.right.trace);
	});

	it('draws only the drawn part of a growing trace', () => {
		const { ctx, renderer } = setup([branch]);
		const firstRun = Math.hypot(40, 40);
		renderer.draw(frame(VIEW, () => firstRun + 60));
		const xs = ctx.named('lineTo').map((call) => call.args[0] as number);
		expect(Math.max(...xs)).toBeCloseTo(140);
	});

	it('puts a pad on a pin once the trace arrives, not before', () => {
		const { ctx, renderer } = setup([branch]);
		renderer.draw(frame(VIEW, () => 100));
		const padAt = (call: { args: unknown[] }) => call.args[0] === 300 && call.args[1] === 140;
		expect(ctx.named('arc').some(padAt)).toBe(false);
		ctx.reset();
		renderer.draw(frame(VIEW));
		expect(ctx.named('arc').some(padAt)).toBe(true);
	});

	it('ends a via trace in a filled circle', () => {
		const decor = trace(
			'decor:L0.0',
			[
				{ x: 0, y: 300 },
				{ x: 120, y: 300 }
			],
			'decor'
		);
		const { ctx, renderer } = setup([decor]);
		renderer.draw(frame(VIEW));
		const arcs = ctx.named('arc').filter((call) => call.args[0] === 120 && call.args[1] === 300);
		expect(arcs.length).toBeGreaterThan(0);
		expect(ctx.named('fill').length).toBeGreaterThan(0);
	});

	it('gives the spine a brighter head at the front', () => {
		const spine = trace(
			'spine:L0',
			[
				{ x: 30, y: 0 },
				{ x: 30, y: 2000 }
			],
			'spine'
		);
		const { ctx, renderer } = setup([spine]);
		renderer.draw(frame(VIEW, () => 480));
		const head = ctx
			.named('arc')
			.filter((call) => call.args[0] === 30 && Math.abs((call.args[1] as number) - 480) < 0.01);
		expect(head.length).toBeGreaterThan(0);
		const padStrokes = ctx
			.named('stroke')
			.filter((s) => s.state.strokeStyle === DEFAULT_PALETTE.left.pad);
		expect(padStrokes.length).toBeGreaterThan(0);
	});

	it('draws no head once the spine is complete', () => {
		const spine = trace(
			'spine:L0',
			[
				{ x: 30, y: 0 },
				{ x: 30, y: 600 }
			],
			'spine'
		);
		const { ctx, renderer } = setup([spine]);
		renderer.draw(frame(VIEW));
		const atEnd = ctx.named('arc').filter((call) => call.args[1] === 600);
		// Only the via at the end, no head glow.
		expect(atEnd.every((call) => (call.args[2] as number) <= 4)).toBe(true);
	});

	it('gives socket traces a wider glow than the halo', () => {
		const socketTrace = trace(
			'socket:L0',
			[
				{ x: 0, y: 400 },
				{ x: 400, y: 400 }
			],
			'socket',
			'left',
			{ kind: 'port', port: 0 }
		);
		const { ctx, renderer } = setup([socketTrace]);
		renderer.draw(frame(VIEW));
		const widths = ctx.named('stroke').map((s) => s.state.lineWidth as number);
		expect(Math.max(...widths)).toBeGreaterThan(HALO_WIDTH);
		// No pad on a port: the socket's own artwork carries the line on.
		expect(ctx.named('arc').some((call) => call.args[0] === 400 && call.args[1] === 400)).toBe(
			false
		);
	});

	describe('hero traces', () => {
		const fromEdge = trace(
			'hero:0.0',
			[
				{ x: 0, y: 200 },
				{ x: 160, y: 200 },
				{ x: 200, y: 240 }
			],
			'hero'
		);
		const fromVia = makeTrace({
			id: 'hero:1.0',
			kind: 'hero',
			side: 'right',
			bus: 'hero:1',
			points: [
				{ x: 900, y: 300 },
				{ x: 1000, y: 300 }
			],
			end: { kind: 'via' },
			chipId: null,
			triggerY: 300,
			startVia: true
		});
		const viaAt = (ctx: RecordingContext, x: number, y: number) =>
			ctx.named('arc').filter((call) => call.args[0] === x && call.args[1] === y);

		it('draws them a little quieter than the spine and branches', () => {
			const { ctx, renderer } = setup([fromEdge]);
			renderer.draw(frame(VIEW));
			const strokes = ctx.named('stroke');
			const halo = strokes.find((s) => s.state.lineWidth === HALO_WIDTH);
			const core = strokes.find((s) => s.state.lineWidth === CORE_WIDTH);
			expect(halo?.state.globalAlpha).toBeCloseTo(HERO_HALO_ALPHA);
			expect(core?.state.globalAlpha).toBeCloseTo(HERO_CORE_ALPHA);
			expect(HERO_HALO_ALPHA).toBeLessThan(HALO_ALPHA);
		});

		it('gives a growing hero trace a bright head and its via on the rim once it arrives', () => {
			const { ctx, renderer } = setup([fromEdge]);
			renderer.draw(frame(VIEW, () => 100));
			expect(viaAt(ctx, 100, 200).length).toBeGreaterThan(0);
			expect(viaAt(ctx, 200, 240)).toHaveLength(0);
			ctx.reset();
			renderer.draw(frame(VIEW));
			expect(viaAt(ctx, 200, 240).length).toBeGreaterThan(0);
		});

		it('puts a via where a trace starts on the board, from its first px on', () => {
			const { ctx, renderer } = setup([fromVia]);
			renderer.draw(frame(VIEW, () => 0));
			expect(viaAt(ctx, 900, 300)).toHaveLength(0);
			ctx.reset();
			renderer.draw(frame(VIEW, () => 10));
			expect(viaAt(ctx, 900, 300).length).toBeGreaterThan(0);
		});

		it('puts no via at the start of a trace that comes in from the edge', () => {
			const { ctx, renderer } = setup([fromEdge]);
			renderer.draw(frame(VIEW));
			expect(viaAt(ctx, 0, 200)).toHaveLength(0);
		});
	});

	it('draws pulses with lighter compositing and resets it after', () => {
		const { ctx, renderer } = setup([branch]);
		renderer.draw({
			view: VIEW,
			drawn: () => Infinity,
			pulses: [{ point: { x: 200, y: 140 }, trace: branch }]
		});
		const pulseArcs = ctx
			.named('arc')
			.filter((call) => call.args[0] === 200 && call.args[1] === 140);
		expect(pulseArcs.length).toBeGreaterThan(0);
		expect(pulseArcs.every((call) => call.state.globalCompositeOperation === 'lighter')).toBe(true);
		expect(ctx.globalCompositeOperation).toBe('source-over');
	});

	it('skips pulses outside the viewport', () => {
		const { ctx, renderer } = setup([branch]);
		renderer.draw({
			view: VIEW,
			drawn: () => Infinity,
			pulses: [{ point: { x: 200, y: 4000 }, trace: branch }]
		});
		expect(ctx.named('arc').some((call) => call.args[1] === 4000)).toBe(false);
	});

	it('draws nothing but the clear without a board', () => {
		const canvas = { width: 0, height: 0 };
		const ctx = new RecordingContext();
		const renderer = new Renderer(canvas, ctx as unknown as CanvasRenderingContext2D);
		renderer.resize(800, 600, 1);
		expect(renderer.draw(frame(VIEW)).traces).toBe(0);
		expect(ctx.named('stroke')).toHaveLength(0);
		expect(ctx.named('clearRect')).toHaveLength(1);
	});
});
