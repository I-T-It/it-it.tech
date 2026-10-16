import '../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import { sectionIds } from '#lib/nav.js';
import SiteHeader from './SiteHeader.svelte';

// This file runs the company build. SiteHeader.personal.svelte.test.ts runs the personal one: the
// variant is a build-time constant, so one file cannot hold both. The real site.ts needs the
// SvelteKit dev runtime, which a component test does not have, so it is mocked either way.
vi.mock('../site.js', () => ({
	site: 'company',
	variant: { availabilityOrder: ['freelance', 'job'] }
}));

const root = document.documentElement;

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

const header = () => document.querySelector<HTMLElement>('header')!;
const frame = () =>
	new Promise<void>((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	);

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

	it('has no photo: the company mark stays the logo', async () => {
		await render(SiteHeader, {});
		expect(header().querySelector('img, picture')).toBeNull();
	});
});

const menu = () => header().querySelector<HTMLDetailsElement>('details.sections')!;
const summary = () => menu().querySelector<HTMLElement>('summary')!;
const sectionLinks = () => Array.from(menu().querySelectorAll<HTMLAnchorElement>('a'));
const text = (links: HTMLElement[]) => links.map((a) => a.textContent?.trim());

/** A click on a link would load another page into the test frame: stop it, keep the handlers. */
function keepOnPage() {
	menu().addEventListener('click', (event) => {
		if ((event.target as Element).closest('a')) event.preventDefault();
	});
}

describe('links', () => {
	it('anchors to every section of the page in the current locale, in page order', async () => {
		await render(SiteHeader, {});
		const hrefs = sectionLinks().map((a) => a.getAttribute('href'));
		expect(hrefs).toEqual([
			'/#hero',
			'/#freelance',
			'/#job',
			'/#about',
			'/#competences',
			'/#experience',
			'/#projects',
			'/#skills',
			'/#talks',
			'/#education',
			'/#contact'
		]);
		expect(hrefs).toEqual(sectionIds(['freelance', 'job']).map((id) => `/#${id}`));
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
		expect(sectionLinks().every((a) => a.getAttribute('href')!.startsWith('/en/#'))).toBe(true);
	});

	it('has a Contact button next to the menu on a wide window, reading the same in both locales', async () => {
		await page.viewport(1280, 800);
		const screen = await render(SiteHeader, {});
		const contact = screen.getByRole('link', { name: 'Contact' }).first();
		await expect.element(contact).toBeVisible();
		expect(header().querySelector('.contact')?.getAttribute('href')).toBe('/#contact');
		setLocale('en');
		screen.unmount();
		await render(SiteHeader, {});
		expect(header().querySelector('.contact')?.textContent?.trim()).toBe('Contact');
		expect(header().querySelector('.contact')?.getAttribute('href')).toBe('/en/#contact');
	});

	it('leaves Contact to the menu on a narrow window, where the bar has no room for it', async () => {
		await page.viewport(414, 800);
		await render(SiteHeader, {});
		expect(header().querySelector('.contact')!.getBoundingClientRect().width).toBe(0);
		expect(text(sectionLinks()).at(-1)).toBe('Contact');
	});

	it('has pointer targets of at least 24 by 24 CSS pixels, with the menu open', async () => {
		await page.viewport(1280, 800);
		await render(SiteHeader, {});
		menu().open = true;
		for (const link of header().querySelectorAll('a')) {
			const box = link.getBoundingClientRect();
			expect(box.width, link.textContent ?? '').toBeGreaterThanOrEqual(24);
			expect(box.height, link.textContent ?? '').toBeGreaterThanOrEqual(24);
		}
		const button = summary().getBoundingClientRect();
		expect(button.width).toBeGreaterThanOrEqual(24);
		expect(button.height).toBeGreaterThanOrEqual(24);
	});
});

describe('size and spacing', () => {
	it('draws a small mark, not a banner', async () => {
		await page.viewport(1280, 800);
		await render(SiteHeader, {});
		const logo = header().querySelector('svg.logo')!.getBoundingClientRect();
		expect(logo.width).toBeLessThanOrEqual(80);
		expect(logo.height).toBeLessThanOrEqual(28);
	});

	it('keeps every control at least 8px from the top and bottom edge of the header', async () => {
		for (const width of [320, 1280]) {
			await page.viewport(width, 800);
			await render(SiteHeader, {});
			const bar = header().getBoundingClientRect();
			for (const el of header().querySelectorAll(
				'.brand, .menu summary, .menu .contact, .language a'
			)) {
				const box = el.getBoundingClientRect();
				if (box.width === 0) continue;
				expect(box.top - bar.top, `${el.className} top at ${width}`).toBeGreaterThanOrEqual(8);
				expect(
					bar.bottom - box.bottom,
					`${el.className} bottom at ${width}`
				).toBeGreaterThanOrEqual(8);
			}
		}
	});

	it('lines up with the content column at every width: same left and right edge as main', async () => {
		const main = document.createElement('main');
		document.body.append(main);
		try {
			for (const width of [320, 414, 800, 1280, 1920]) {
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
});

describe('menu', () => {
	it('is a Menu button with every section behind it, closed at first', async () => {
		const screen = await render(SiteHeader, {});
		expect(summary().textContent?.trim()).toBe('Menu');
		expect(menu().open).toBe(false);
		await expect.element(screen.getByText('Menu', { exact: true })).toBeVisible();
		expect(sectionLinks()).toHaveLength(11);
		// Closed, none of its links can be seen or reached.
		for (const link of sectionLinks()) expect(link.checkVisibility()).toBe(false);
		await userEvent.click(summary());
		for (const link of sectionLinks()) expect(link.checkVisibility()).toBe(true);
	});

	it('names the sections in Dutch', async () => {
		await render(SiteHeader, {});
		expect(text(sectionLinks())).toEqual([
			'Start',
			'Freelance',
			'Loondienst',
			'Over',
			'Competenties',
			'Ervaring',
			'Projecten',
			'Vaardigheden',
			'Talks',
			'Opleiding',
			'Contact'
		]);
	});

	it('names the sections in English', async () => {
		setLocale('en');
		await render(SiteHeader, {});
		expect(text(sectionLinks())).toEqual([
			'Start',
			'Freelance',
			'Employed',
			'About',
			'Competences',
			'Experience',
			'Projects',
			'Skills',
			'Talks',
			'Education',
			'Contact'
		]);
		expect(summary().textContent?.trim()).toBe('Menu');
	});

	it('opens on a click and shows every section', async () => {
		await page.viewport(1280, 800);
		const screen = await render(SiteHeader, {});
		await userEvent.click(summary());
		expect(menu().open).toBe(true);
		for (const name of ['Start', 'Over', 'Competenties', 'Projecten', 'Opleiding']) {
			await expect.element(screen.getByRole('link', { name, exact: true })).toBeVisible();
		}
	});

	it('opens with Enter and Space from the keyboard, as a button does', async () => {
		await render(SiteHeader, {});
		summary().focus();
		await userEvent.keyboard('{Enter}');
		expect(menu().open).toBe(true);
		await userEvent.keyboard(' ');
		expect(menu().open).toBe(false);
	});

	it('closes on Escape and puts focus back on the button', async () => {
		await render(SiteHeader, {});
		await userEvent.click(summary());
		sectionLinks()[3].focus();
		await userEvent.keyboard('{Escape}');
		expect(menu().open).toBe(false);
		expect(document.activeElement).toBe(summary());
	});

	it('closes when a section is chosen', async () => {
		await render(SiteHeader, {});
		keepOnPage();
		await userEvent.click(summary());
		await userEvent.click(sectionLinks()[5]);
		expect(menu().open).toBe(false);
	});

	it('closes when focus moves out of it', async () => {
		await render(SiteHeader, {});
		await userEvent.click(summary());
		sectionLinks()[0].focus();
		header().querySelector<HTMLAnchorElement>('.brand')!.focus();
		await expect.poll(() => menu().open).toBe(false);
	});

	it('stays open while focus moves between its own links', async () => {
		await render(SiteHeader, {});
		await userEvent.click(summary());
		sectionLinks()[0].focus();
		sectionLinks()[1].focus();
		await frame();
		expect(menu().open).toBe(true);
	});

	it('is a native disclosure, so it opens and closes without script', async () => {
		await render(SiteHeader, {});
		expect(menu().tagName).toBe('DETAILS');
		expect(summary().tagName).toBe('SUMMARY');
		// Its links sit in the nav landmark, inside the details.
		expect(menu().closest('nav')?.getAttribute('aria-label')).toBe('Hoofdmenu');
	});

	it('shows the focus ring on the button when the keyboard reaches it', async () => {
		await render(SiteHeader, {});
		header().querySelector<HTMLAnchorElement>('.brand')!.focus();
		await userEvent.keyboard('{Tab}');
		expect(document.activeElement).toBe(summary());
		expect(getComputedStyle(summary()).outlineWidth).toBe('2px');
		expect(getComputedStyle(summary()).outlineStyle).toBe('solid');
	});

	it('draws the open panel inside the window, with no sideways scroll, from 320px up', async () => {
		for (const width of [320, 414, 1280]) {
			await page.viewport(width, 700);
			await render(SiteHeader, {});
			menu().open = true;
			await frame();
			const html = document.documentElement;
			expect(html.scrollWidth, `scroll at ${width}`).toBeLessThanOrEqual(html.clientWidth);
			for (const link of sectionLinks()) {
				const box = link.getBoundingClientRect();
				expect(box.left, `${link.textContent} left at ${width}`).toBeGreaterThanOrEqual(0);
				expect(box.right, `${link.textContent} right at ${width}`).toBeLessThanOrEqual(width);
			}
			// Every entry is on the screen at once: the panel never needs a scroll of its own.
			const last = sectionLinks()[sectionLinks().length - 1].getBoundingClientRect();
			expect(last.bottom, `bottom at ${width}`).toBeLessThanOrEqual(700);
			document.body.replaceChildren();
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
