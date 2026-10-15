import '../../app.css';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Leds from './Leds.svelte';

const root = document.documentElement;
afterEach(() => root.classList.remove('js', 'reduced'));

describe('Leds', () => {
	it('lights as many LEDs as the level, out of five', async () => {
		await render(Leds, { level: 4, text: 'niveau 4 van 5, 8 jaar' });
		const leds = document.querySelectorAll('.led');
		expect(leds).toHaveLength(5);
		expect(document.querySelectorAll('.led[data-lit="true"]')).toHaveLength(4);
		expect(document.querySelectorAll('.led[data-lit="false"]')).toHaveLength(1);
	});

	it('takes another maximum', async () => {
		await render(Leds, { level: 2, max: 3, text: 'x' });
		expect(document.querySelectorAll('.led')).toHaveLength(3);
		expect(document.querySelectorAll('.led[data-lit="true"]')).toHaveLength(2);
	});

	it('clamps a level outside the range', async () => {
		await render(Leds, { level: 9, text: 'x' });
		expect(document.querySelectorAll('.led[data-lit="true"]')).toHaveLength(5);
	});

	it('is visual only: the LEDs are hidden and a text carries the meaning', async () => {
		const screen = await render(Leds, { level: 4, text: 'niveau 4 van 5, 8 jaar' });
		const visual = document.querySelector('.leds-visual')!;
		expect(visual.getAttribute('aria-hidden')).toBe('true');
		const text = document.querySelector<HTMLElement>('.sr-only')!;
		expect(text.textContent).toBe('niveau 4 van 5, 8 jaar');
		expect(visual.contains(text)).toBe(false);
		await expect.element(screen.getByText('niveau 4 van 5, 8 jaar')).toBeInTheDocument();
		expect(text.getBoundingClientRect().width).toBeLessThanOrEqual(1);
	});

	it('draws a lit LED differently from an unlit one', async () => {
		await render(Leds, { level: 1, text: 'x' });
		const lit = getComputedStyle(document.querySelector('.led[data-lit="true"]')!);
		const unlit = getComputedStyle(document.querySelector('.led[data-lit="false"]')!);
		expect(lit.backgroundColor).not.toBe(unlit.backgroundColor);
	});
});

// With `sequence` the LEDs wait, dark, until a parent (the Skills group) sets data-lit on itself.
// Then the ones that belong to the level light up one after another, once. The parent decides
// when, and never takes the attribute away again, so there is no replay.
describe('sequence', () => {
	const CYAN = 'rgb(0, 231, 255)';
	const DARK = 'rgba(0, 0, 0, 0)';
	const leds = () => Array.from(document.querySelectorAll<HTMLElement>('.led'));
	const fill = (el: HTMLElement) => getComputedStyle(el).backgroundColor;
	const delay = (el: HTMLElement) => parseFloat(getComputedStyle(el).transitionDelay);

	it('is flagged on the row, and the text for screen readers does not change', async () => {
		const screen = await render(Leds, { level: 3, sequence: true, text: 'niveau 3 van 5' });
		expect(document.querySelector('.leds')?.getAttribute('data-sequence')).toBe('true');
		await expect.element(screen.getByText('niveau 3 van 5')).toBeInTheDocument();
		expect(document.querySelector('.leds-visual')?.getAttribute('aria-hidden')).toBe('true');
	});

	it('keeps every LED dark until the parent says data-lit', async () => {
		root.classList.add('js');
		await render(Leds, { level: 3, sequence: true, text: 'x' });
		expect(leds().map(fill)).toEqual([DARK, DARK, DARK, DARK, DARK]);
		// They are still the level LEDs, only waiting.
		expect(document.querySelectorAll('.led[data-lit="true"]')).toHaveLength(3);
	});

	it('lights the level LEDs in order once the parent sets data-lit', async () => {
		root.classList.add('js');
		const screen = await render(Leds, { level: 3, sequence: true, text: 'x' });
		screen.container.setAttribute('data-lit', 'true');

		// One after another: each delay is longer than the one before, from 0.
		const delays = leds().slice(0, 3).map(delay);
		expect(delays[0]).toBe(0);
		expect(delays[1]).toBeGreaterThan(delays[0]);
		expect(delays[2]).toBeGreaterThan(delays[1]);

		await expect.poll(() => leds().map(fill)).toEqual([CYAN, CYAN, CYAN, DARK, DARK]);
	});

	it('lights them in a second or less in all', async () => {
		root.classList.add('js');
		const screen = await render(Leds, { level: 5, sequence: true, text: 'x' });
		screen.container.setAttribute('data-lit', 'true');
		const last = leds()[4];
		const total = delay(last) + parseFloat(getComputedStyle(last).transitionDuration);
		expect(total).toBeLessThanOrEqual(1);
	});

	it('is lit at once under reduced motion, with no transition and no wait for the parent', async () => {
		root.classList.add('js', 'reduced');
		await render(Leds, { level: 3, sequence: true, text: 'x' });
		expect(leds().map(fill)).toEqual([CYAN, CYAN, CYAN, DARK, DARK]);
		for (const led of leds()) {
			expect(delay(led)).toBe(0);
			expect(parseFloat(getComputedStyle(led).transitionDuration)).toBe(0);
		}
	});

	it('is lit without JS: no html.js, no wait', async () => {
		await render(Leds, { level: 3, sequence: true, text: 'x' });
		expect(leds().map(fill)).toEqual([CYAN, CYAN, CYAN, DARK, DARK]);
	});

	it('does not wait without the prop: a plain row is lit whatever the parent says', async () => {
		root.classList.add('js');
		await render(Leds, { level: 2, text: 'x' });
		expect(leds().map(fill)).toEqual([CYAN, CYAN, DARK, DARK, DARK]);
		expect(document.querySelector('.leds')?.getAttribute('data-sequence')).toBe('false');
	});
});
