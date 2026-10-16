import '../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import { sectionIds } from '#lib/nav.js';
import SiteHeader from './SiteHeader.svelte';

// The variant is a build-time constant: this file runs the personal build. SiteHeader reads `site`
// and the availability order, so the mock holds those. The company build is covered in
// SiteHeader.svelte.test.ts.
vi.mock('../site.js', () => ({
	site: 'personal',
	variant: { availabilityOrder: ['job', 'freelance'] }
}));

const header = () => document.querySelector<HTMLElement>('header')!;

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

afterEach(async () => {
	setLocale('nl');
	await page.viewport(414, 896);
});

describe('personal mark', () => {
	it('is the display name as text, and the link name contains that text', async () => {
		await page.viewport(1280, 800);
		const screen = await render(SiteHeader, {});
		const brand = screen.getByRole('link', { name: 'Robbin "Roboroads" Schepers, naar boven' });
		await expect.element(brand).toBeVisible();
		expect(brand.element().textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Robbin "Roboroads" Schepers'
		);
		expect((brand.element() as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).toBe(
			'Robbin "Roboroads" Schepers'
		);
		expect(header().querySelector('svg.logo')).toBeNull();
	});

	it('shows only the nickname on a narrow window, which the link name still contains', async () => {
		await page.viewport(375, 667);
		const screen = await render(SiteHeader, {});
		const brand = screen.getByRole('link', { name: 'Robbin "Roboroads" Schepers, naar boven' });
		await expect.element(brand).toBeVisible();
		const shown = (brand.element() as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
		expect(shown).toBe('Roboroads');
		// 2.5.3: what is shown is part of the name.
		expect('Robbin "Roboroads" Schepers, naar boven'.includes(shown)).toBe(true);
	});

	it('says the same in English', async () => {
		setLocale('en');
		const screen = await render(SiteHeader, {});
		await expect
			.element(screen.getByRole('link', { name: 'Robbin "Roboroads" Schepers, back to top' }))
			.toBeVisible();
	});

	it('keeps the same menu, Contact and toggle as the company build', async () => {
		await page.viewport(1280, 800);
		const screen = await render(SiteHeader, {});
		await expect.element(screen.getByRole('navigation', { name: 'Hoofdmenu' })).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Contact' })).toBeVisible();
		await expect.element(screen.getByText('Menu', { exact: true })).toBeVisible();
		expect(header().querySelectorAll('a[hreflang]')).toHaveLength(2);
	});

	it('lists every section of the personal page in page order: job before freelance', async () => {
		await render(SiteHeader, {});
		const hrefs = Array.from(
			header().querySelectorAll<HTMLAnchorElement>('details.sections a')
		).map((a) => a.getAttribute('href'));
		expect(hrefs).toEqual(sectionIds(['job', 'freelance']).map((id) => `/#${id}`));
		expect(hrefs.slice(0, 3)).toEqual(['/#hero', '/#job', '/#freelance']);
		expect(hrefs).toContain('/#projects');
		expect(hrefs[hrefs.length - 1]).toBe('/#contact');
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

	it('names the link by the display name, with the photo left out of it', async () => {
		const screen = await render(SiteHeader, {});
		await expect
			.element(screen.getByRole('link', { name: 'Robbin "Roboroads" Schepers, naar boven' }))
			.toBeVisible();
	});

	it('keeps the photo at 320 CSS px too: the short nickname leaves room for it', async () => {
		await page.viewport(320, 640);
		await render(SiteHeader, {});
		const avatar = header().querySelector<HTMLImageElement>('.brand img')!;
		expect(avatar.getBoundingClientRect().width).toBeGreaterThanOrEqual(24);
		expect(header().getBoundingClientRect().height).toBeLessThanOrEqual(58);
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
