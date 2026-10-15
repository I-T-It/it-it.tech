import '../../app.css';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Leds from './Leds.svelte';

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
