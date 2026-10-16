import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { pointAt } from './geometry.js';
import { BOOT_FALLBACK_MS, FRONT_RATIO, HERO_MS, LEAD_MS, SOCKET_MS } from './growth.js';
import { ellipseDistance, type Ellipse } from './hero.js';
import type { Trace } from './layout.js';
import { MAX_DPR } from './renderer.js';
import { boardSeed } from './rng.js';
import {
	registerChip,
	registerHero,
	registerObstacle,
	registerSocket,
	type ChipHandle
} from './registry.svelte.js';
import { BoardRuntime, RELAYOUT_DEBOUNCE_MS, type MotionQuery } from './runtime.svelte.js';

const WIDTH = 1200;
const HEIGHT = 800;
const HERO = 800;
const GAP = 160;
const PIN_PITCH = 48;

interface PageOptions {
	/** Chip heights, top to bottom. */
	chips?: number[];
	/** Indexes of chips that get no pins (they boot on the timer). */
	pinless?: number[];
	socket?: boolean;
	/** Registers the hero, with a text block (an obstacle) under the socket and a link below. */
	hero?: boolean;
}

interface TestPage {
	root: HTMLElement;
	handles: ChipHandle[];
	sections: HTMLElement[];
	/** With `hero`: the text block and the link in the hero. */
	copy?: HTMLElement;
	link?: HTMLElement;
}

let cleanups: (() => void)[] = [];

/** A hero with a socket, then chips with pins down both sides, centred in a 600 px column. */
function buildPage({
	chips = [400, 600, 500, 900, 500],
	pinless = [],
	socket = true,
	hero: withHero = false
}: PageOptions = {}): TestPage {
	document.body.style.margin = '0';
	const root = document.createElement('div');
	const hero = document.createElement('div');
	hero.style.cssText = `position:relative;height:${HERO}px;padding-top:300px;box-sizing:border-box`;
	root.append(hero);
	document.body.append(root);
	cleanups.push(() => root.remove());

	let copy: HTMLElement | undefined;
	let link: HTMLElement | undefined;
	if (withHero) {
		hero.style.paddingTop = '200px';
		copy = document.createElement('div');
		copy.style.cssText = 'position:absolute;left:400px;top:360px;width:400px;height:140px';
		link = document.createElement('a');
		link.setAttribute('href', '#c0');
		link.textContent = 'Next';
		link.style.cssText = 'position:absolute;left:570px;top:700px;width:60px;height:60px';
		hero.append(copy, link);
		cleanups.push(registerObstacle(copy));
		cleanups.push(registerHero(hero));
	}

	if (socket) {
		const el = document.createElement('div');
		el.style.cssText = 'position:relative;width:300px;height:120px;margin:0 auto';
		for (const side of ['left', 'right']) {
			const port = document.createElement('span');
			port.setAttribute('data-port', side);
			// In the hero both ports take a lead trace.
			if (withHero) port.setAttribute('data-lead', '');
			port.style.cssText = `position:absolute;${side}:40px;top:60px;width:2px;height:2px`;
			el.append(port);
		}
		hero.append(el);
		cleanups.push(registerSocket(el));
	}

	const handles: ChipHandle[] = [];
	const sections: HTMLElement[] = [];
	chips.forEach((height, index) => {
		const section = document.createElement('section');
		section.style.cssText = `position:relative;width:600px;height:${height}px;margin:0 auto ${GAP}px`;
		if (!pinless.includes(index)) {
			const count = Math.max(2, Math.floor(height / PIN_PITCH));
			for (const side of ['left', 'right']) {
				for (let k = 0; k < count; k++) {
					const pin = document.createElement('span');
					pin.setAttribute('data-pin', String(side === 'left' ? k : count + k));
					pin.setAttribute('data-pin-side', side);
					pin.style.cssText = `position:absolute;${side}:-10px;top:${24 + k * PIN_PITCH}px;width:10px;height:4px`;
					section.append(pin);
				}
			}
		}
		root.append(section);
		const handle = registerChip(section, {
			id: `c${index}`,
			designator: `U${index}`,
			side: 'both'
		});
		cleanups.push(() => handle.destroy());
		handles.push(handle);
		sections.push(section);
	});

	const footer = document.createElement('div');
	footer.style.height = '400px';
	root.append(footer);
	return { root, handles, sections, copy, link };
}

function makeCanvas(): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.style.cssText =
		'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1';
	canvas.setAttribute('aria-hidden', 'true');
	document.body.prepend(canvas);
	cleanups.push(() => canvas.remove());
	return canvas;
}

/** A clock the test moves by hand. */
function manualClock(start = 1000) {
	let time = start;
	return {
		now: () => time,
		advance(ms: number) {
			time += ms;
		}
	};
}

function fakeMotionQuery(initial: boolean): MotionQuery & { set(matches: boolean): void } {
	const listeners = new Set<() => void>();
	let matches = initial;
	return {
		get matches() {
			return matches;
		},
		addEventListener: (_type: 'change', listener: () => void) => listeners.add(listener),
		removeEventListener: (_type: 'change', listener: () => void) => listeners.delete(listener),
		set(value: boolean) {
			matches = value;
			for (const listener of listeners) listener();
		}
	};
}

function launch(options: ConstructorParameters<typeof BoardRuntime>[1] = {}) {
	const canvas = makeCanvas();
	const runtime = new BoardRuntime(canvas, {
		reducedMotion: fakeMotionQuery(false),
		debug: true,
		...options
	});
	cleanups.push(() => runtime.destroy());
	return { canvas, runtime };
}

function nextFrame(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function frames(count: number): Promise<void> {
	for (let i = 0; i < count; i++) await nextFrame();
}

async function until(condition: () => boolean, timeout = 4000): Promise<void> {
	const start = performance.now();
	while (!condition()) {
		if (performance.now() - start > timeout) throw new Error('timed out');
		await nextFrame();
	}
}

async function scrollTo(y: number): Promise<void> {
	window.scrollTo(0, y);
	await frames(2);
}

/** Layouts (each after three runs of `referenceMs`) the budget test takes the best of. */
const BUDGET_ROUNDS = 5;
/**
 * The layout of a real page may take this many times `referenceMs`. It takes about 2 times as long
 * (25 ms against 12 ms on a laptop), and 1.1 to 2.3 times under a heavy CPU load, where both slow
 * down 2 to 4x. A layout that got 3x slower or more fails; a fixed 100 ms failed on CI at 139 ms.
 */
const BUDGET_RATIO = 6;

/**
 * Milliseconds for a fixed chunk of plain JS (arithmetic, array pushes, a sort): how fast this
 * machine runs scripts right now. The same work every time, so only the machine changes it.
 */
function referenceMs(): number {
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

function tracesOf(runtime: BoardRuntime, kind: Trace['kind']): Trace[] {
	return runtime.board?.traces.filter((t) => t.kind === kind) ?? [];
}

function spineDrawn(runtime: BoardRuntime): number {
	return tracesOf(runtime, 'spine').reduce((sum, t) => sum + runtime.growth!.drawn(t.id), 0);
}

function pointer(type: string, x: number, y: number, pointerType = 'mouse'): void {
	window.dispatchEvent(
		new PointerEvent(type, {
			clientX: x - window.scrollX,
			clientY: y - window.scrollY,
			pointerType,
			bubbles: true
		})
	);
}

beforeEach(async () => {
	await page.viewport(WIDTH, HEIGHT);
	window.scrollTo(0, 0);
});

afterEach(() => {
	for (const cleanup of cleanups.reverse()) cleanup();
	cleanups = [];
	window.scrollTo(0, 0);
	vi.restoreAllMocks();
});

describe('start', () => {
	it('lays out the registered chips and the socket and draws', async () => {
		buildPage();
		const { canvas, runtime } = launch();
		expect(canvas.dataset.pcbState).toBe('init');
		await runtime.start();
		expect(runtime.board?.chips.map((c) => c.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
		expect(tracesOf(runtime, 'socket').length).toBeGreaterThan(0);
		expect(tracesOf(runtime, 'spine').length).toBeGreaterThan(0);
		expect(tracesOf(runtime, 'branch').length).toBeGreaterThan(0);
		expect(runtime.frames).toBeGreaterThanOrEqual(1);
		expect(['running', 'idle']).toContain(canvas.dataset.pcbState);
	});

	it('sizes the canvas to the viewport', async () => {
		buildPage();
		const { canvas, runtime } = launch();
		await runtime.start();
		const rect = canvas.getBoundingClientRect();
		expect(canvas.width).toBe(Math.round(rect.width * Math.min(MAX_DPR, devicePixelRatio)));
		expect(canvas.height).toBe(Math.round(rect.height * Math.min(MAX_DPR, devicePixelRatio)));
	});

	it('caps the device pixel ratio at 2', async () => {
		const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
		Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => 3 });
		cleanups.push(() => {
			if (original) Object.defineProperty(window, 'devicePixelRatio', original);
			else delete (window as { devicePixelRatio?: number }).devicePixelRatio;
		});
		buildPage();
		const { canvas, runtime } = launch();
		await runtime.start();
		expect(canvas.width).toBe(Math.round(canvas.getBoundingClientRect().width * 2));
	});

	it('lays out a real page well within budget', async () => {
		await page.viewport(1440, 900);
		buildPage({ chips: [700, 400, 500, 520, 2600, 900, 700, 420, 380] });
		const layOut = async (): Promise<number> => {
			const { runtime } = launch();
			await runtime.start();
			runtime.destroy();
			return runtime.lastLayoutMs;
		};

		// A shared CI runner swings 4x or more from one run to the next (the same layout took 34 ms
		// and 139 ms there, 24 ms here), and the first layout also pays for compiling the code. So:
		// warm up once, then take the best of several layouts, each next to a fixed chunk of plain
		// work, and hold the layout to a multiple of that work instead of to a fixed time. A slow
		// machine slows both, a layout that really got slower does not slow the reference.
		await layOut();
		let layoutMs = Infinity;
		let reference = Infinity;
		for (let i = 0; i < BUDGET_ROUNDS; i++) {
			for (let j = 0; j < 3; j++) reference = Math.min(reference, referenceMs());
			layoutMs = Math.min(layoutMs, await layOut());
		}
		console.info(
			`layout ${layoutMs.toFixed(1)} ms, reference ${reference.toFixed(1)} ms, ` +
				`ratio ${(layoutMs / reference).toFixed(2)} (limit ${BUDGET_RATIO})`
		);
		expect(layoutMs).toBeLessThan(reference * BUDGET_RATIO);
	});
});

describe('socket load sequence', () => {
	it('grows every socket trace to full within 2 s of the start, then idles', async () => {
		buildPage();
		const { canvas, runtime } = launch();
		await runtime.start();
		const started = performance.now();
		const sockets = tracesOf(runtime, 'socket');
		expect(sockets.every((t) => runtime.growth!.isFull(t.id))).toBe(false);
		await until(() => sockets.every((t) => runtime.growth!.isFull(t.id)), 3000);
		expect(performance.now() - started).toBeLessThanOrEqual(SOCKET_MS + 100);
		await until(() => canvas.dataset.pcbState === 'idle', 500);
	});
});

describe('scroll', () => {
	it('draws the spine by scroll position, both ways', async () => {
		buildPage();
		const clock = manualClock();
		const { canvas, runtime } = launch({ now: clock.now });
		await runtime.start();

		await scrollTo(1500);
		const down = spineDrawn(runtime);
		expect(Number(canvas.dataset.spineFront)).toBe(Math.round(1500 + HEIGHT * FRONT_RATIO));
		expect(down).toBeGreaterThan(0);

		await scrollTo(3000);
		const further = spineDrawn(runtime);
		expect(further).toBeGreaterThan(down);
		expect(Number(canvas.dataset.spineFront)).toBe(Math.round(3000 + HEIGHT * FRONT_RATIO));

		await scrollTo(1500);
		expect(spineDrawn(runtime)).toBeCloseTo(down, 5);
	});

	it('stops the loop one frame after scrolling stops', async () => {
		const { root } = buildPage();
		window.scrollTo(0, root.scrollHeight);
		const clock = manualClock();
		const { canvas, runtime } = launch({ now: clock.now });
		await runtime.start();
		// Let every timed trace and boot finish, then settle.
		clock.advance(10_000);
		await scrollTo(window.scrollY - 10);
		await until(() => canvas.dataset.pcbState === 'idle', 1000);

		const before = runtime.frames;
		window.scrollTo(0, window.scrollY - 200);
		await frames(6);
		expect(runtime.frames).toBe(before + 1);
		expect(canvas.dataset.pcbState).toBe('idle');
	});

	it('requests no frames while nothing moves', async () => {
		buildPage();
		const clock = manualClock();
		const { runtime } = launch({ now: clock.now });
		await runtime.start();
		// Past the socket sequence and any decoration in view.
		clock.advance(10_000);
		await until(() => runtime.state === 'idle', 1000);
		const before = runtime.frames;
		await frames(10);
		expect(runtime.frames).toBe(before);
	});

	it('requests no frame for a scroll that ends where it started', async () => {
		buildPage();
		const clock = manualClock();
		const { runtime } = launch({ now: clock.now });
		await runtime.start();
		clock.advance(10_000);
		await until(() => runtime.state === 'idle', 1000);
		let scrolls = 0;
		const onScroll = () => scrolls++;
		window.addEventListener('scroll', onScroll);
		cleanups.push(() => window.removeEventListener('scroll', onScroll));
		const before = runtime.frames;
		window.scrollTo(0, 400);
		window.scrollTo(0, 0);
		await frames(4);
		expect(scrolls).toBeGreaterThan(0);
		expect(runtime.frames).toBe(before);
	});

	it('snaps the chips above the front on a deep link', async () => {
		const { sections, handles } = buildPage();
		window.scrollTo(0, sections[3].offsetTop);
		const clock = manualClock();
		const { runtime } = launch({ now: clock.now });
		await runtime.start();
		const front = window.scrollY + HEIGHT * FRONT_RATIO;
		for (const [index, handle] of handles.entries()) {
			const above = sections[index].offsetTop <= front;
			expect(handle.state).toBe(above ? 'on' : 'off');
		}
		const wiring = runtime.board!.chips.find((c) => c.id === 'c0')!;
		expect(wiring.feeders.every((id) => runtime.growth!.isFull(id))).toBe(true);
	});

	it('boots a chip without branches on the 2.5 s fallback', async () => {
		const { sections, handles } = buildPage({ pinless: [1] });
		const clock = manualClock();
		const { runtime } = launch({ now: clock.now });
		await runtime.start();
		expect(runtime.board!.chips.find((c) => c.id === 'c1')?.fallback).toBe(true);

		await scrollTo(sections[1].offsetTop);
		expect(handles[1].state).toBe('booting');
		clock.advance(BOOT_FALLBACK_MS - 100);
		await frames(2);
		expect(handles[1].state).toBe('booting');
		clock.advance(200);
		await until(() => handles[1].state === 'on', 1000);
	});

	it('keeps booted chips on and their branches full when scrolling back up', async () => {
		const { root, handles } = buildPage();
		window.scrollTo(0, root.scrollHeight);
		const clock = manualClock();
		const { runtime } = launch({ now: clock.now });
		await runtime.start();
		await scrollTo(0);
		expect(handles.every((h) => h.state === 'on')).toBe(true);
		expect(tracesOf(runtime, 'branch').every((t) => runtime.growth!.isFull(t.id))).toBe(true);
	});

	it('has no long task over 50 ms during a 2 s scripted scroll', async () => {
		await page.viewport(1440, 900);
		const { root } = buildPage({ chips: [700, 400, 500, 520, 2600, 900, 700, 420, 380] });
		const { runtime } = launch();
		await runtime.start();
		await frames(5);

		const longTasks: number[] = [];
		const supported = PerformanceObserver.supportedEntryTypes.includes('longtask');
		const observer = supported
			? new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) longTasks.push(entry.duration);
				})
			: null;
		observer?.observe({ type: 'longtask' });

		const bottom = root.scrollHeight - innerHeight;
		const started = performance.now();
		let elapsed = 0;
		while (elapsed < 2000) {
			await nextFrame();
			elapsed = performance.now() - started;
			const t = Math.min(1, elapsed / 2000);
			// Down to the bottom in the first half, back up in the second.
			window.scrollTo(0, bottom * (t < 0.5 ? t * 2 : 2 - t * 2));
		}
		await frames(3);
		observer?.disconnect();

		console.info(
			`scripted scroll: ${runtime.frames} frames, slowest frame ${runtime.maxFrameMs.toFixed(1)} ms, ` +
				`long tasks: ${supported ? longTasks.length : 'not supported'}`
		);
		expect(longTasks.filter((d) => d > 50)).toEqual([]);
		expect(runtime.maxFrameMs).toBeLessThan(50);
	});
});

describe('relayout', () => {
	it('relays out after a size change, debounced, and keeps chips on', async () => {
		const { root, sections, handles } = buildPage();
		window.scrollTo(0, root.scrollHeight);
		const clock = manualClock();
		const { runtime } = launch({ now: clock.now });
		await runtime.start();
		expect(handles.every((h) => h.state === 'on')).toBe(true);
		expect(runtime.layouts).toBe(1);

		// Like a <details> opening inside a chip.
		sections[1].style.height = '800px';
		await frames(2);
		sections[1].style.height = '900px';
		await frames(2);
		expect(runtime.layouts).toBe(1);
		await until(() => runtime.layouts === 2, RELAYOUT_DEBOUNCE_MS + 1000);
		await frames(3);
		expect(runtime.layouts).toBe(2);

		expect(handles.every((h) => h.state === 'on')).toBe(true);
		for (const wiring of runtime.board!.chips) {
			expect(wiring.feeders.every((id) => runtime.growth!.isFull(id))).toBe(true);
		}
	});

	it('relays out when a chip registers', async () => {
		buildPage({ chips: [400, 500] });
		const clock = manualClock();
		const { runtime } = launch({ now: clock.now });
		await runtime.start();
		const late = document.createElement('section');
		late.style.cssText = 'width:600px;height:300px;margin:0 auto';
		document.body.append(late);
		cleanups.push(() => late.remove());
		const handle = registerChip(late, { id: 'late', designator: 'U9', side: 'both' });
		cleanups.push(() => handle.destroy());
		expect(runtime.layouts).toBe(1);
		await until(() => runtime.board!.chips.some((c) => c.id === 'late'), 1000);
		expect(runtime.layouts).toBe(2);
	});
});

describe('pointer pulses', () => {
	/** Deep link to the first chip, so its branches are drawn, and the branch to aim at. */
	async function aim() {
		const { sections, handles } = buildPage();
		window.scrollTo(0, sections[0].offsetTop - 100);
		const { canvas, runtime } = launch();
		await runtime.start();
		const branch = tracesOf(runtime, 'branch').find(
			(t) => t.chipId === 'c0' && runtime.growth!.isFull(t.id)
		)!;
		const near = pointAt(branch.points, branch.lengths, branch.length - 20);
		return { canvas, runtime, branch, near, handle: handles[0] };
	}

	it('spawns a pulse near a trace and flashes the pin it reaches', async () => {
		const { canvas, branch, near, handle } = await aim();
		pointer('pointermove', near.x, near.y);
		expect(Number(canvas.dataset.pulses)).toBeGreaterThan(0);
		const end = branch.end;
		if (end.kind !== 'pin') throw new Error('expected a pin');
		const pin = handle.pins()[end.pin];
		await until(() => pin.hasAttribute('data-flash'), 1000);
		await until(() => canvas.dataset.pulses === '0', 1000);
	});

	it('ignores touch moves and spawns on a tap', async () => {
		const { canvas, near } = await aim();
		pointer('pointermove', near.x, near.y, 'touch');
		expect(canvas.dataset.pulses ?? '0').toBe('0');
		pointer('pointerdown', near.x, near.y, 'touch');
		expect(Number(canvas.dataset.pulses)).toBeGreaterThan(0);
	});

	it('clears pulses and pauses when the tab is hidden', async () => {
		const { canvas, runtime, near } = await aim();
		const spine = tracesOf(runtime, 'spine')[0];
		const onSpine = pointAt(spine.points, spine.lengths, 40);
		pointer('pointermove', near.x, near.y);
		pointer('pointermove', onSpine.x, onSpine.y);
		expect(Number(canvas.dataset.pulses)).toBeGreaterThan(0);

		const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
		document.dispatchEvent(new Event('visibilitychange'));
		expect(canvas.dataset.pulses).toBe('0');
		const before = runtime.frames;
		await frames(4);
		expect(runtime.frames).toBe(before);

		visibility.mockReturnValue('visible');
		document.dispatchEvent(new Event('visibilitychange'));
		await frames(2);
		expect(runtime.frames).toBeGreaterThan(before);
	});
});

describe('hero field', () => {
	/** Points every 3 px along a trace. */
	function samples(trace: Trace): { x: number; y: number }[] {
		const out = [];
		for (let along = 0; along <= trace.length; along += 3) {
			out.push(pointAt(trace.points, trace.lengths, along));
		}
		return out;
	}

	function docRect(el: Element) {
		const r = el.getBoundingClientRect();
		return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
	}

	function ellipseOf(canvas: HTMLCanvasElement): Ellipse {
		const [cx, cy, rx, ry] = (canvas.dataset.heroEllipse ?? '').split(' ').map(Number);
		return { cx, cy, rx, ry };
	}

	it('fills the hero across the window, round a clear ellipse that holds the socket and the text', async () => {
		const { copy } = buildPage({ hero: true });
		const { canvas, runtime } = launch();
		await runtime.start();
		const field = tracesOf(runtime, 'hero');
		expect(field.length).toBeGreaterThan(20);
		expect(Number(canvas.dataset.heroTraces)).toBe(field.length);
		expect(runtime.board!.hero!.rect.width).toBe(document.documentElement.clientWidth);

		const e = ellipseOf(canvas);
		const socketEl = document.querySelector<HTMLElement>('[data-port]')!.parentElement!;
		for (const el of [socketEl, copy!]) {
			const r = docRect(el);
			for (const [x, y] of [
				[r.x, r.y],
				[r.x + r.w, r.y],
				[r.x, r.y + r.h],
				[r.x + r.w, r.y + r.h]
			]) {
				expect(ellipseDistance(e, { x, y })).toBeLessThan(1);
			}
		}
		// Only the two lead traces enter it.
		for (const trace of runtime.board!.traces.filter((t) => t.kind !== 'socket')) {
			for (const p of samples(trace)) expect(ellipseDistance(e, p), trace.id).toBeGreaterThan(1);
		}
	});

	it('keeps out from under the links in the hero', async () => {
		const { link } = buildPage({ hero: true });
		const { runtime } = launch();
		await runtime.start();
		const r = docRect(link!);
		for (const trace of tracesOf(runtime, 'hero')) {
			for (const p of samples(trace)) {
				const inside = p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
				expect(inside, trace.id).toBe(false);
			}
		}
	});

	it('builds up over a few seconds after the load, then rests', async () => {
		buildPage({ hero: true });
		const clock = manualClock();
		const { canvas, runtime } = launch({ now: clock.now });
		await runtime.start();
		const field = tracesOf(runtime, 'hero');
		clock.advance(1000);
		await frames(2);
		const early = field.filter((t) => runtime.growth!.isFull(t.id)).length;
		expect(early).toBeLessThan(field.length / 2);
		expect(canvas.dataset.pcbState).toBe('running');
		clock.advance(HERO_MS);
		await until(() => canvas.dataset.pcbState === 'idle', 1000);
		expect(field.every((t) => runtime.growth!.isFull(t.id))).toBe(true);
	});

	it('is drawn complete at once under reduced motion', async () => {
		buildPage({ hero: true });
		const { canvas, runtime } = launch({ reducedMotion: fakeMotionQuery(true) });
		await runtime.start();
		expect(canvas.dataset.pcbState).toBe('static');
		expect(tracesOf(runtime, 'hero').every((t) => runtime.growth!.isFull(t.id))).toBe(true);
	});

	it('runs the two lead traces in first and powers the socket when they arrive', async () => {
		buildPage({ hero: true });
		const socketEl = document.querySelector<HTMLElement>('[data-port]')!.parentElement!;
		const clock = manualClock();
		const { runtime } = launch({ now: clock.now });
		await runtime.start();
		expect(tracesOf(runtime, 'socket')).toHaveLength(2);
		expect(socketEl.dataset.power).toBeUndefined();
		clock.advance(LEAD_MS / 2);
		await frames(2);
		expect(socketEl.dataset.power).toBeUndefined();
		clock.advance(LEAD_MS / 2);
		await until(() => socketEl.dataset.power === 'on', 1000);
		expect(tracesOf(runtime, 'socket').every((t) => runtime.growth!.isFull(t.id))).toBe(true);
	});

	it('powers the socket at once under reduced motion', async () => {
		buildPage({ hero: true });
		const socketEl = document.querySelector<HTMLElement>('[data-port]')!.parentElement!;
		const { runtime } = launch({ reducedMotion: fakeMotionQuery(true) });
		await runtime.start();
		expect(socketEl.dataset.power).toBe('on');
	});

	it('powers the socket when the board cannot draw', async () => {
		buildPage({ hero: true });
		const socketEl = document.querySelector<HTMLElement>('[data-port]')!.parentElement!;
		const canvas = makeCanvas();
		vi.spyOn(canvas, 'getContext').mockReturnValue(null);
		const runtime = new BoardRuntime(canvas, { reducedMotion: fakeMotionQuery(false) });
		cleanups.push(() => runtime.destroy());
		await runtime.start();
		expect(socketEl.dataset.power).toBe('on');
	});

	it('builds no field without a registered hero', async () => {
		buildPage();
		const { canvas, runtime } = launch();
		await runtime.start();
		expect(tracesOf(runtime, 'hero')).toHaveLength(0);
		expect(canvas.dataset.heroEllipse).toBeUndefined();
	});
});

describe('reduced motion', () => {
	it('draws once, static, fully grown, with every chip on', async () => {
		const { handles } = buildPage();
		const { canvas, runtime } = launch({ reducedMotion: fakeMotionQuery(true) });
		await runtime.start();
		await frames(10);
		expect(canvas.dataset.pcbState).toBe('static');
		expect(runtime.frames).toBe(1);
		expect(handles.every((h) => h.state === 'on')).toBe(true);
		expect(runtime.board!.traces.every((t) => runtime.growth!.isFull(t.id))).toBe(true);
	});

	it('draws once when the event of a scroll from before the start comes after it', async () => {
		buildPage();
		// The event fires at the next frame, after the first draw, with the view where that draw
		// left it. A scroll that the test before resets in afterEach can do the same.
		window.scrollTo(0, 300);
		const { runtime } = launch({ reducedMotion: fakeMotionQuery(true) });
		const framesAtScroll: number[] = [];
		const onScroll = () => framesAtScroll.push(runtime.frames);
		window.addEventListener('scroll', onScroll);
		cleanups.push(() => window.removeEventListener('scroll', onScroll));
		await runtime.start();
		await frames(10);
		expect(framesAtScroll).toContain(1);
		expect(runtime.frames).toBe(1);
	});

	it('spawns no pulses', async () => {
		buildPage();
		const { canvas, runtime } = launch({ reducedMotion: fakeMotionQuery(true) });
		await runtime.start();
		const branch = tracesOf(runtime, 'branch')[0];
		pointer('pointermove', branch.points[0].x, branch.points[0].y);
		expect(canvas.dataset.pulses ?? '0').toBe('0');
	});

	it('goes static when the setting turns on', async () => {
		const { handles } = buildPage();
		const query = fakeMotionQuery(false);
		const { canvas, runtime } = launch({ reducedMotion: query });
		await runtime.start();
		expect(handles.every((h) => h.state === 'on')).toBe(false);
		query.set(true);
		expect(canvas.dataset.pcbState).toBe('static');
		expect(handles.every((h) => h.state === 'on')).toBe(true);
	});

	it('redraws on scroll only to keep the board in place', async () => {
		const { handles } = buildPage();
		const { runtime } = launch({ reducedMotion: fakeMotionQuery(true) });
		await runtime.start();
		await scrollTo(600);
		expect(runtime.frames).toBe(2);
		await frames(5);
		expect(runtime.frames).toBe(2);
		expect(handles.every((h) => h.state === 'on')).toBe(true);
	});
});

describe('fallbacks', () => {
	it('turns the chips on and does not throw without a 2D context', async () => {
		const { handles } = buildPage();
		const canvas = makeCanvas();
		vi.spyOn(canvas, 'getContext').mockReturnValue(null);
		const runtime = new BoardRuntime(canvas, { reducedMotion: fakeMotionQuery(false) });
		cleanups.push(() => runtime.destroy());
		await expect(runtime.start()).resolves.toBeUndefined();
		expect(canvas.dataset.pcbState).toBe('off');
		expect(handles.every((h) => h.state === 'on')).toBe(true);
		await scrollTo(500);
		expect(runtime.frames).toBe(0);
	});
});

describe('test-run attributes', () => {
	it('exposes the spine front and the pulse count when debugging', async () => {
		buildPage();
		const { canvas, runtime } = launch({ debug: true });
		await runtime.start();
		expect(canvas.dataset.spineFront).toBe(String(Math.round(HEIGHT * FRONT_RATIO)));
		expect(canvas.dataset.pulses).toBe('0');
	});

	it('leaves them out otherwise', async () => {
		buildPage();
		const { canvas, runtime } = launch({ debug: false });
		await runtime.start();
		expect(canvas.dataset.spineFront).toBeUndefined();
		expect(canvas.dataset.pulses).toBeUndefined();
	});

	it('turns them on by default in automated browsers', async () => {
		buildPage();
		const canvas = makeCanvas();
		const runtime = new BoardRuntime(canvas, { reducedMotion: fakeMotionQuery(false) });
		cleanups.push(() => runtime.destroy());
		await runtime.start();
		expect(navigator.webdriver).toBe(true);
		expect(canvas.dataset.spineFront).toBeDefined();
	});
});

describe('seed', () => {
	it('lays the board out from a fresh random seed on every visit', async () => {
		buildPage();
		const values = [0x1234_5678, 0x0bad_cafe];
		vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
			(array as Uint32Array)[0] = values.shift()!;
			return array;
		});
		const first = launch({ debug: false }).runtime;
		const second = launch({ debug: false }).runtime;
		await first.start();
		await second.start();
		expect(first.board!.seed).toBe(0x1234_5678);
		expect(second.board!.seed).toBe(0x0bad_cafe);
	});

	it('keeps that seed for the whole visit, through every relayout', async () => {
		const { sections } = buildPage();
		vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
			(array as Uint32Array)[0] = 4242;
			return array;
		});
		const { runtime } = launch({ debug: false });
		await runtime.start();
		vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
			(array as Uint32Array)[0] = 9999;
			return array;
		});
		await page.viewport(WIDTH - 200, HEIGHT);
		sections[1].style.height = '800px';
		await until(() => runtime.layouts >= 2, RELAYOUT_DEBOUNCE_MS + 1500);
		expect(runtime.board!.seed).toBe(4242);
	});

	it('stays the same in test runs, and takes ?seed= there', async () => {
		buildPage();
		const first = launch({ debug: true }).runtime;
		await first.start();
		expect(first.board!.seed).toBe(boardSeed(window.innerWidth));

		const url = location.href;
		history.replaceState(null, '', `${location.pathname}?seed=1234`);
		cleanups.push(() => history.replaceState(null, '', url));
		const second = launch({ debug: true }).runtime;
		await second.start();
		expect(second.board!.seed).toBe(1234);
	});

	it('takes a seed from its options', async () => {
		buildPage();
		const { runtime } = launch({ debug: false, seed: 77 });
		await runtime.start();
		expect(runtime.board!.seed).toBe(77);
	});
});

describe('destroy', () => {
	it('stops listening', async () => {
		buildPage();
		const { runtime } = launch();
		await runtime.start();
		runtime.destroy();
		const before = runtime.frames;
		await scrollTo(800);
		expect(runtime.frames).toBe(before);
	});

	it('does nothing when destroyed before the fonts are ready', async () => {
		buildPage();
		const { canvas, runtime } = launch();
		const started = runtime.start();
		runtime.destroy();
		await started;
		expect(runtime.board).toBeNull();
		expect(canvas.dataset.pcbState).toBe('init');
	});
});
