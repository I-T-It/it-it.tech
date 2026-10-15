import '../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import SiteHeader from './SiteHeader.svelte';

// The variant is a build-time constant: this file runs the personal build. SiteHeader reads only
// `site`, so the mock holds only that. The company build is covered in SiteHeader.svelte.test.ts.
vi.mock('../site.js', () => ({ site: 'personal' }));

const header = () => document.querySelector<HTMLElement>('header')!;

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

afterEach(async () => {
	setLocale('nl');
	await page.viewport(414, 896);
});

describe('personal mark', () => {
	it('is the name as text, and the link name contains that text', async () => {
		const screen = await render(SiteHeader, {});
		const brand = screen.getByRole('link', { name: 'Robbin Schepers, naar boven' });
		await expect.element(brand).toBeVisible();
		expect(brand.element().textContent?.trim()).toBe('Robbin Schepers');
		expect(header().querySelector('svg.logo')).toBeNull();
	});

	it('says the same in English', async () => {
		setLocale('en');
		const screen = await render(SiteHeader, {});
		await expect
			.element(screen.getByRole('link', { name: 'Robbin Schepers, back to top' }))
			.toBeVisible();
	});

	it('keeps the same menu, Contact and toggle as the company build', async () => {
		const screen = await render(SiteHeader, {});
		await expect.element(screen.getByRole('navigation', { name: 'Hoofdmenu' })).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Contact' })).toBeVisible();
		expect(header().querySelectorAll('a[hreflang]')).toHaveLength(2);
	});
});

describe('photo mark', () => {
	it('puts a small round photo of him in front of the name, as decoration', async () => {
		await page.viewport(1280, 800);
		await render(SiteHeader, {});
		const avatar = header().querySelector<HTMLImageElement>('.brand img')!;
		expect(avatar).not.toBeNull();
		// Empty alt: the link is named by the text next to it, the photo adds nothing to say.
		expect(avatar.getAttribute('alt')).toBe('');
		const box = avatar.getBoundingClientRect();
		expect(box.width).toBeGreaterThanOrEqual(24);
		expect(box.width).toBeLessThanOrEqual(40);
		expect(box.width).toBeCloseTo(box.height, 0);
		expect(getComputedStyle(avatar).borderRadius).toBe('50%');
		const name = header().querySelector('.wordmark')!.getBoundingClientRect();
		expect(box.right).toBeLessThanOrEqual(name.right);
		// The mark is the photo, not the logo.
		expect(header().querySelector('svg.logo')).toBeNull();
	});

	it('keeps the link name as it was: the text, with the photo left out of it', async () => {
		const screen = await render(SiteHeader, {});
		await expect
			.element(screen.getByRole('link', { name: 'Robbin Schepers, naar boven' }))
			.toBeVisible();
	});
});

describe('size and spacing', () => {
	it('sets the name small, at most 14px', async () => {
		await page.viewport(1280, 800);
		await render(SiteHeader, {});
		const size = parseFloat(getComputedStyle(header().querySelector('.wordmark')!).fontSize);
		expect(size).toBeLessThanOrEqual(14);
	});

	it('lines up with the content column, same edges as main', async () => {
		const main = document.createElement('main');
		document.body.append(main);
		try {
			for (const width of [320, 414, 1280]) {
				await page.viewport(width, 800);
				await render(SiteHeader, {});
				const column = main.getBoundingClientRect();
				const bar = header().querySelector('.bar')!.getBoundingClientRect();
				expect(bar.left, `left at ${width}`).toBeCloseTo(column.left, 0);
				expect(bar.right, `right at ${width}`).toBeCloseTo(column.right, 0);
			}
		} finally {
			main.remove();
		}
	});

	it('keeps the mark at least 8px from the top and bottom edge', async () => {
		await page.viewport(1280, 800);
		await render(SiteHeader, {});
		const bar = header().getBoundingClientRect();
		const box = header().querySelector('.brand')!.getBoundingClientRect();
		expect(box.top - bar.top).toBeGreaterThanOrEqual(8);
		expect(bar.bottom - box.bottom).toBeGreaterThanOrEqual(8);
	});
});

describe('reflow at 320 CSS px', () => {
	for (const locale of ['nl', 'en'] as const) {
		it(`fits on one row without clipping: personal, ${locale}`, async () => {
			setLocale(locale);
			await page.viewport(320, 640);
			await render(SiteHeader, {});
			expect(header().scrollWidth).toBeLessThanOrEqual(header().clientWidth);
			for (const link of header().querySelectorAll('a')) {
				const rect = link.getBoundingClientRect();
				expect(rect.left).toBeGreaterThanOrEqual(0);
				expect(rect.right).toBeLessThanOrEqual(320);
			}
			const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
			expect(header().getBoundingClientRect().height).toBeLessThanOrEqual(rem * 3.5 + 2);
		});
	}
});
