import '../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import { OG_HEIGHT, OG_WIDTH } from '#lib/og.js';
import OgCard from './OgCard.svelte';

// The variant is a build-time constant: this file runs the personal build. OgCard reads `site` and
// `siteUrl`. The company card is in OgCard.svelte.test.ts.
vi.mock('../site.js', () => ({
	site: 'personal',
	siteUrl: 'https://deschepers.nl'
}));

afterEach(() => overwriteGetLocale(() => 'nl'));

const card = () => document.querySelector<HTMLElement>('.og')!;
const canvas = () => card().querySelector<HTMLCanvasElement>('canvas')!;

async function ready(locale: Locale = 'nl'): Promise<void> {
	overwriteGetLocale(() => locale);
	await render(OgCard, {});
	await vi.waitFor(() => expect(card().hasAttribute('data-og-ready')).toBe(true), {
		timeout: 10_000
	});
}

describe('personal card', () => {
	it('is 1200 by 630 CSS px', async () => {
		await ready();
		const box = card().getBoundingClientRect();
		expect(box.width).toBe(OG_WIDTH);
		expect(box.height).toBe(OG_HEIGHT);
	});

	it('shows the photo, the name, the tagline in English and the web address', async () => {
		await ready('nl');
		const photo = card().querySelector('img')!;
		expect(photo).not.toBeNull();
		expect(photo.alt).toBe('Portret van Robbin Schepers');
		expect(card().querySelector('svg.logo')).toBeNull();
		expect(card().querySelector('h1')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
			'Robbin "Roboroads" Schepers'
		);
		const tagline = card().querySelector('.tagline')!;
		expect(tagline.textContent!.trim()).toBe('Professional Computer Nerd');
		// An English phrase on a Dutch card says so.
		expect(tagline.getAttribute('lang')).toBe('en');
		expect(card().querySelector('.host')!.textContent!.trim()).toBe('deschepers.nl');
	});

	it('says the same in English', async () => {
		await ready('en');
		expect(card().querySelector('img')!.alt).toBe('Portrait of Robbin Schepers');
		expect(card().querySelector('.tagline')!.textContent!.trim()).toBe(
			'Professional Computer Nerd'
		);
	});

	it('has loaded the photo before it is ready: the screenshot must not show a hole', async () => {
		await ready();
		const photo = card().querySelector('img')!;
		expect(photo.complete).toBe(true);
		expect(photo.naturalWidth).toBeGreaterThan(0);
	});

	it('draws the board', async () => {
		await ready();
		const c = canvas();
		const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
		let inked = 0;
		for (let i = 3; i < data.length; i += 4) if (data[i] > 0) inked++;
		expect(inked).toBeGreaterThan(5_000);
		expect(c.getAttribute('aria-hidden')).toBe('true');
	});

	it('keeps all of its content inside the card', async () => {
		await ready();
		const box = card().getBoundingClientRect();
		expect(card().scrollWidth).toBeLessThanOrEqual(OG_WIDTH);
		expect(card().scrollHeight).toBeLessThanOrEqual(OG_HEIGHT);
		for (const el of card().querySelectorAll('h1, .tagline, .host, img')) {
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

	it('carries none of the company details', async () => {
		await ready();
		// The KvK and VAT numbers, the town and their labels, as in e2e/build-output.spec.ts.
		const text = card().innerHTML + card().textContent;
		for (const detail of ['86738852', 'NL002333708B14', 'Zwaag', 'KvK', 'BTW', 'VAT', 'I.T. It']) {
			expect(text, detail).not.toContain(detail);
		}
	});
});
