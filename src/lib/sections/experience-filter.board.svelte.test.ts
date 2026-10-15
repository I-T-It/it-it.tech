import '../../app.css';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { BoardRuntime, RELAYOUT_DEBOUNCE_MS } from '#lib/pcb/runtime.svelte.js';
import Experience from './Experience.svelte';
import Skills from './Skills.svelte';
import { skillFilter } from './skillFilter.svelte.js';

// The board is drawn from the chips on the page. A filter changes the height of the Experience
// chip and of the whole page, so the board must be laid out again, or its traces would end where
// the chips used to be.

const root = document.documentElement;
const canvases: HTMLCanvasElement[] = [];
const extras: HTMLElement[] = [];
const runtimes: BoardRuntime[] = [];

function setAddress(search: string) {
	History.prototype.replaceState.call(history, null, '', location.pathname + search);
}

const frames = async (count: number) => {
	for (let i = 0; i < count; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
};

async function launch() {
	const canvas = document.createElement('canvas');
	canvas.style.cssText =
		'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1';
	canvas.setAttribute('aria-hidden', 'true');
	document.body.prepend(canvas);
	canvases.push(canvas);
	const runtime = new BoardRuntime(canvas, { debug: true });
	runtimes.push(runtime);
	await runtime.start();
	return runtime;
}

/** The Experience and Skills chips in a <main>, like the page, under a hero-high gap. */
async function mountPage() {
	const main = document.createElement('main');
	main.style.paddingTop = '600px';
	document.body.append(main);
	extras.push(main);
	await render(Experience, { target: main });
	await render(Skills, { target: main });
	return main;
}

beforeEach(() => {
	root.classList.add('js');
	setAddress('');
	skillFilter.restore(new Set());
	window.scrollTo({ top: 0, behavior: 'instant' });
});

afterEach(async () => {
	for (const runtime of runtimes.splice(0)) runtime.destroy();
	for (const el of [...canvases.splice(0), ...extras.splice(0)]) el.remove();
	root.classList.remove('js', 'reduced');
	setAddress('');
	skillFilter.restore(new Set());
	await page.viewport(414, 896);
});

const docHeight = () => document.documentElement.scrollHeight;

describe('Experience filter and the board', () => {
	it('lays the board out again when a filter makes the page shorter, and again when it goes', async () => {
		await page.viewport(1200, 800);
		await mountPage();
		const runtime = await launch();
		expect(runtime.layouts).toBe(1);
		const tall = docHeight();
		expect(Math.abs(runtime.board!.height - tall)).toBeLessThanOrEqual(1);

		const filter = document.querySelector<HTMLButtonElement>('[data-skill="laravel"]')!;
		filter.click();
		await expect.poll(() => docHeight()).toBeLessThan(tall - 500);
		await expect.poll(() => runtime.layouts, { timeout: RELAYOUT_DEBOUNCE_MS + 2000 }).toBe(2);
		// The board is as tall as the page now, not as tall as it was.
		expect(Math.abs(runtime.board!.height - docHeight())).toBeLessThanOrEqual(1);
		const short = docHeight();

		document.querySelector<HTMLButtonElement>('[data-filter] ul button')!.click();
		await expect.poll(() => docHeight()).toBeGreaterThan(short + 500);
		await expect.poll(() => runtime.layouts, { timeout: RELAYOUT_DEBOUNCE_MS + 2000 }).toBe(3);
		expect(Math.abs(runtime.board!.height - docHeight())).toBeLessThanOrEqual(1);
	});

	it('keeps the chips of the page on the board after a filter', async () => {
		await page.viewport(1200, 800);
		await mountPage();
		const runtime = await launch();
		const ids = runtime.board!.chips.map((c) => c.id);
		expect(ids).toEqual(['experience', 'skills']);

		await userEvent.click(document.querySelector<HTMLButtonElement>('[data-skill="docker"]')!);
		await expect.poll(() => runtime.layouts, { timeout: RELAYOUT_DEBOUNCE_MS + 2000 }).toBe(2);
		await frames(3);
		expect(runtime.board!.chips.map((c) => c.id)).toEqual(ids);

		// The Skills chip moved up with the page: its top on the board is its top in the document.
		const skills = document.getElementById('skills')!;
		const top = skills.getBoundingClientRect().top + window.scrollY;
		const wiring = runtime.board!.chips.find((c) => c.id === 'skills')!;
		expect(Math.abs(wiring.top - top)).toBeLessThanOrEqual(2);
	});

	it('gives the Experience chip fewer pins when it is shorter, and the same count back', async () => {
		await page.viewport(1200, 800);
		await mountPage();
		const pins = () => document.querySelectorAll('#experience [data-pin-side="left"]').length;
		const before = pins();
		expect(before).toBeGreaterThan(4);

		document.querySelector<HTMLButtonElement>('[data-skill="laravel"]')!.click();
		await expect.poll(pins).toBeLessThan(before);

		document.querySelector<HTMLButtonElement>('[data-filter] ul button')!.click();
		await expect.poll(pins).toBe(before);
	});
});
