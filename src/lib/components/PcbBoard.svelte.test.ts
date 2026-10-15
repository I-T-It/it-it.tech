import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { registerChip, type ChipHandle } from '#lib/pcb/registry.svelte.js';
import PcbBoard from './PcbBoard.svelte';

let cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.reverse()) cleanup();
	cleanups = [];
});

function nextFrame(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function mount() {
	await page.viewport(1200, 800);
	const screen = await render(PcbBoard);
	const canvas = document.querySelector<HTMLCanvasElement>('canvas.pcb-board');
	if (!canvas) throw new Error('no canvas');
	return { screen, canvas };
}

describe('PcbBoard', () => {
	it('is a decorative canvas fixed behind the content', async () => {
		const { canvas } = await mount();
		expect(canvas.getAttribute('aria-hidden')).toBe('true');
		const style = getComputedStyle(canvas);
		expect(style.position).toBe('fixed');
		expect(style.pointerEvents).toBe('none');
		expect(Number(style.zIndex)).toBeLessThan(0);
		expect(canvas.tabIndex).toBe(-1);
		expect(canvas.hasAttribute('tabindex')).toBe(false);
	});

	it('keeps the content under it clickable', async () => {
		await mount();
		let clicks = 0;
		const button = document.createElement('button');
		button.textContent = 'Klik';
		button.style.cssText = 'position:absolute;left:100px;top:100px;width:120px;height:40px';
		button.addEventListener('click', () => clicks++);
		document.body.append(button);
		cleanups.push(() => button.remove());

		expect(document.elementFromPoint(160, 120)).toBe(button);
		await userEvent.click(button);
		expect(clicks).toBe(1);
	});

	it('starts the board runtime', async () => {
		const { canvas } = await mount();
		await expect.poll(() => canvas.dataset.pcbState).toMatch(/^(running|idle)$/);
		expect(canvas.width).toBeGreaterThan(0);
	});

	it('lights a registered chip once the board reaches it', async () => {
		const section = document.createElement('section');
		section.style.cssText = 'width:600px;height:200px;margin:100px auto';
		document.body.append(section);
		const handle: ChipHandle = registerChip(section, {
			id: 'board-test',
			designator: 'U3',
			side: 'both'
		});
		cleanups.push(() => {
			handle.destroy();
			section.remove();
		});
		await mount();
		// No pins: the chip boots on the timer once the front passes its top, then goes on.
		await expect.poll(() => handle.state, { timeout: 4000 }).toBe('on');
	});

	it('stops when unmounted', async () => {
		const { screen, canvas } = await mount();
		await expect.poll(() => canvas.dataset.pcbState).not.toBe('init');
		screen.unmount();
		await nextFrame();
		expect(document.querySelector('canvas.pcb-board')).toBeNull();
	});
});
