import '../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import SiteHeader from './SiteHeader.svelte';

// This file runs the company build. SiteHeader.personal.svelte.test.ts runs the personal one: the
// variant is a build-time constant, so one file cannot hold both. The real site.ts needs the
// SvelteKit dev runtime, which a component test does not have, so it is mocked either way.
vi.mock('../site.js', () => ({ site: 'company' }));

const root = document.documentElement;

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

const header = () => document.querySelector<HTMLElement>('header')!;

afterEach(async () => {
	setLocale('nl');
	root.style.removeProperty('--header-height');
	await page.viewport(414, 896);
});

describe('landmarks', () => {
	it('is the banner with a main menu and the language toggle', async () => {
		const screen = await render(SiteHeader, {});
		await expect.element(screen.getByRole('banner')).toBeVisible();
		await expect.element(screen.getByRole('navigation', { name: 'Hoofdmenu' })).toBeVisible();
		await expect.element(screen.getByRole('navigation', { name: 'Taal' })).toBeVisible();
		expect(header().querySelectorAll('a[hreflang]')).toHaveLength(2);
	});

	it('labels the navigation in English on an English page', async () => {
		setLocale('en');
		const screen = await render(SiteHeader, {});
		await expect.element(screen.getByRole('navigation', { name: 'Main menu' })).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'I.T. It, back to top' })).toBeVisible();
	});
});

describe('company mark', () => {
	it('is the small static logo, named by the link', async () => {
		const screen = await render(SiteHeader, {});
		const brand = screen.getByRole('link', { name: 'I.T. It, naar boven' });
		await expect.element(brand).toBeVisible();
		const logo = brand.element().querySelector('svg.logo')!;
		expect(logo).not.toBeNull();
		expect(logo.getAttribute('aria-hidden')).toBe('true');
		expect(logo.classList.contains('animate')).toBe(false);
		expect(header().querySelector('.wordmark')).toBeNull();
	});
});

describe('links', () => {
	it('anchors to the sections of the page in the current locale', async () => {
		await render(SiteHeader, {});
		const hrefs = Array.from(
			header().querySelectorAll<HTMLAnchorElement>('nav a:not([hreflang])')
		).map((a) => a.getAttribute('href'));
		expect(hrefs).toEqual(['/#about', '/#experience', '/#skills', '/#talks', '/#contact']);
	});

	it('links the mark to the top of the page in the current locale', async () => {
		await render(SiteHeader, {});
		expect(header().querySelector('.brand')?.getAttribute('href')).toBe('/');
	});

	it('uses the English home in English', async () => {
		setLocale('en');
		await render(SiteHeader, {});
		expect(header().querySelector('.brand')?.getAttribute('href')).toBe('/en/');
		expect(header().querySelector('a[href$="#contact"]')?.getAttribute('href')).toBe(
			'/en/#contact'
		);
	});

	it('has a Contact anchor that reads the same in both locales', async () => {
		const screen = await render(SiteHeader, {});
		await expect.element(screen.getByRole('link', { name: 'Contact' })).toBeVisible();
	});

	it('has pointer targets of at least 24 by 24 CSS pixels', async () => {
		await page.viewport(1280, 800);
		await render(SiteHeader, {});
		for (const link of header().querySelectorAll('a')) {
			const box = link.getBoundingClientRect();
			expect(box.width, link.textContent ?? '').toBeGreaterThanOrEqual(24);
			expect(box.height, link.textContent ?? '').toBeGreaterThanOrEqual(24);
		}
	});
});

describe('desktop anchors', () => {
	it('shows Over, Ervaring, Vaardigheden and Talks on a wide screen', async () => {
		await page.viewport(1280, 800);
		const screen = await render(SiteHeader, {});
		for (const name of ['Over', 'Ervaring', 'Vaardigheden', 'Talks', 'Contact']) {
			await expect.element(screen.getByRole('link', { name, exact: true })).toBeVisible();
		}
	});

	it('keeps only the mark, Contact and the toggle on a narrow screen', async () => {
		await page.viewport(414, 800);
		const screen = await render(SiteHeader, {});
		await expect.element(screen.getByRole('link', { name: 'Contact' })).toBeVisible();
		for (const name of ['Over', 'Ervaring', 'Vaardigheden', 'Talks']) {
			await expect.element(screen.getByRole('link', { name, exact: true })).not.toBeInTheDocument();
		}
	});
});

describe('reflow at 320 CSS px', () => {
	for (const locale of ['nl', 'en'] as const) {
		it(`fits on one row without clipping: company, ${locale}`, async () => {
			setLocale(locale);
			await page.viewport(320, 640);
			await render(SiteHeader, {});
			expect(header().scrollWidth).toBeLessThanOrEqual(header().clientWidth);
			for (const link of header().querySelectorAll('a')) {
				const rect = link.getBoundingClientRect();
				expect(rect.left).toBeGreaterThanOrEqual(0);
				expect(rect.right).toBeLessThanOrEqual(320);
			}
			// One row: the header keeps its minimum height.
			const rem = parseFloat(getComputedStyle(root).fontSize);
			expect(header().getBoundingClientRect().height).toBeLessThanOrEqual(rem * 3.5 + 2);
		});
	}
});

describe('sticky header and focus', () => {
	it('sticks to the top, above the content and the skip link target', async () => {
		await render(SiteHeader, {});
		const style = getComputedStyle(header());
		expect(style.position).toBe('sticky');
		expect(style.top).toBe('0px');
		expect(Number(style.zIndex)).toBeGreaterThan(0);
	});

	it('writes its own height to --header-height, and scroll-padding-top follows', async () => {
		await page.viewport(414, 800);
		await render(SiteHeader, {});
		await expect
			.poll(() => root.style.getPropertyValue('--header-height'))
			.toBe(`${header().getBoundingClientRect().height}px`);
		expect(getComputedStyle(root).scrollPaddingTop).toBe(
			`${header().getBoundingClientRect().height}px`
		);
	});

	it('has the header height as the default scroll-padding-top before any script runs', () => {
		expect(getComputedStyle(root).scrollPaddingTop).toBe(
			`${parseFloat(getComputedStyle(root).fontSize) * 3.5}px`
		);
	});

	it('stops using the sticky header on a very short window, where it would hide the page', async () => {
		await page.viewport(320, 200);
		await render(SiteHeader, {});
		expect(getComputedStyle(header()).position).toBe('static');
		await expect.poll(() => root.style.getPropertyValue('--header-height')).toBe('0px');
		expect(getComputedStyle(root).scrollPaddingTop).toBe('0px');
	});

	it('clears --header-height when it goes away', async () => {
		const screen = await render(SiteHeader, {});
		await expect.poll(() => root.style.getPropertyValue('--header-height')).not.toBe('');
		screen.unmount();
		expect(root.style.getPropertyValue('--header-height')).toBe('');
	});
});
