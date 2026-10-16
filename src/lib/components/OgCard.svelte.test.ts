import '../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import { OG_HEIGHT, OG_WIDTH } from '#lib/og.js';
import OgCard from './OgCard.svelte';

// This file runs the company build; OgCard.personal.svelte.test.ts runs the personal one. The
// variant is a build-time constant, and the real site.ts needs the SvelteKit dev runtime, which a
// component test does not have, so it is mocked either way.
vi.mock('../site.js', () => ({
	site: 'company',
	siteUrl: 'https://it-it.tech'
}));

afterEach(() => overwriteGetLocale(() => 'nl'));

const card = () => document.querySelector<HTMLElement>('.og')!;
const canvas = () => card().querySelector<HTMLCanvasElement>('canvas')!;

/** The card is done: fonts in, board drawn. This is the flag the build script waits for. */
async function ready(locale: Locale = 'nl'): Promise<void> {
	overwriteGetLocale(() => locale);
	await render(OgCard, {});
	await vi.waitFor(() => expect(card().hasAttribute('data-og-ready')).toBe(true), {
		timeout: 10_000
	});
}

/** How many canvas pixels have any ink. */
function inkedPixels(): number {
	const c = canvas();
	const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
	let count = 0;
	for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
	return count;
}

describe('company card', () => {
	it('is 1200 by 630 CSS px', async () => {
		await ready();
		const box = card().getBoundingClientRect();
		expect(box.width).toBe(OG_WIDTH);
		expect(box.height).toBe(OG_HEIGHT);
		expect(OG_WIDTH).toBe(1200);
		expect(OG_HEIGHT).toBe(630);
	});

	it('shows the logo, the line of the title and the web address, in Dutch', async () => {
		await ready('nl');
		expect(card().querySelector('svg.logo')).not.toBeNull();
		expect(card().querySelector('img')).toBeNull();
		expect(card().querySelector('h1')!.textContent!.trim()).toBe('Voor alles met stekkers');
		expect(card().querySelector('.host')!.textContent!.trim()).toBe('it-it.tech');
	});

	it('says the same in English', async () => {
		await ready('en');
		expect(card().querySelector('h1')!.textContent!.trim()).toBe('For everything with a plug');
	});

	it('sets data-og-ready once the board is drawn: the build script screenshots then', async () => {
		await ready();
		expect(inkedPixels()).toBeGreaterThan(5_000);
	});

	it('draws the board on a canvas that is decoration', async () => {
		await ready();
		expect(canvas().getAttribute('aria-hidden')).toBe('true');
		expect(canvas().hasAttribute('tabindex')).toBe(false);
	});

	it('keeps all of its content inside the card', async () => {
		await ready();
		const box = card().getBoundingClientRect();
		expect(card().scrollWidth).toBeLessThanOrEqual(OG_WIDTH);
		expect(card().scrollHeight).toBeLessThanOrEqual(OG_HEIGHT);
		for (const el of card().querySelectorAll('h1, .host, svg.logo')) {
			const r = el.getBoundingClientRect();
			expect(r.left, el.className.toString()).toBeGreaterThanOrEqual(box.left);
			expect(r.right, el.className.toString()).toBeLessThanOrEqual(box.right);
			expect(r.top, el.className.toString()).toBeGreaterThanOrEqual(box.top);
			expect(r.bottom, el.className.toString()).toBeLessThanOrEqual(box.bottom);
		}
	});

	it('draws the same board every time', async () => {
		await ready();
		const first = canvas().toDataURL();
		document.body.innerHTML = '';
		await ready();
		expect(canvas().toDataURL()).toBe(first);
	});

	it('does not cover the logo or the text with traces', async () => {
		await ready();
		const c = canvas();
		const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
		const scale = c.width / OG_WIDTH;
		const box = card().getBoundingClientRect();
		const inked = (x: number, y: number) =>
			data[(Math.round(y * scale) * c.width + Math.round(x * scale)) * 4 + 3] > 0;
		// The middle of the h1 line: the board keeps clear of the text.
		const h1 = card().querySelector('h1')!.getBoundingClientRect();
		for (let x = h1.left + 8; x < h1.right - 8; x += 24) {
			expect(inked(x - box.left, (h1.top + h1.bottom) / 2 - box.top), `x ${x}`).toBe(false);
		}
	});
});
