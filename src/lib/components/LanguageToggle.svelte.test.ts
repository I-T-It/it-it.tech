import '../../app.css';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import LanguageToggle from './LanguageToggle.svelte';

// The base path is empty in the unit tests; the e2e smoke test proves /it-it.tech/ and /deschepers.nl/.
function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

const link = (hreflang: string) =>
	document.querySelector<HTMLAnchorElement>(`a[hreflang="${hreflang}"]`)!;

beforeEach(() => {
	history.replaceState(null, '', location.pathname + location.search);
});

afterEach(() => {
	setLocale('nl');
	history.replaceState(null, '', location.pathname + location.search);
});

describe('on a Dutch page', () => {
	beforeEach(() => setLocale('nl'));

	it('is a navigation landmark named after the language', async () => {
		const screen = await render(LanguageToggle, {});
		await expect.element(screen.getByRole('navigation', { name: 'Taal' })).toBeVisible();
	});

	it('links to both locales with hreflang, lang and a full page load', async () => {
		await render(LanguageToggle, {});
		expect(link('nl').getAttribute('href')).toBe('/');
		expect(link('en').getAttribute('href')).toBe('/en/');
		for (const code of ['nl', 'en']) {
			expect(link(code).getAttribute('lang')).toBe(code);
			expect(link(code).hasAttribute('data-sveltekit-reload')).toBe(true);
		}
	});

	it('marks the active locale with aria-current and nothing else', async () => {
		await render(LanguageToggle, {});
		expect(link('nl').getAttribute('aria-current')).toBe('true');
		expect(link('en').hasAttribute('aria-current')).toBe(false);
	});

	it('names the links in their own language and keeps the visible code in the name', async () => {
		const screen = await render(LanguageToggle, {});
		await expect.element(screen.getByRole('link', { name: 'Nederlands (NL)' })).toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 'Switch to English (EN)' }))
			.toBeVisible();
		for (const [code, visible] of [
			['nl', 'NL'],
			['en', 'EN']
		]) {
			expect(link(code).textContent?.trim()).toBe(visible);
			expect(link(code).getAttribute('aria-label')).toContain(visible);
		}
	});
});

describe('on an English page', () => {
	beforeEach(() => setLocale('en'));

	it('flips the current link and the names', async () => {
		const screen = await render(LanguageToggle, {});
		expect(link('en').getAttribute('aria-current')).toBe('true');
		expect(link('nl').hasAttribute('aria-current')).toBe(false);
		await expect.element(screen.getByRole('navigation', { name: 'Language' })).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'English (EN)' })).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Naar Nederlands (NL)' })).toBeVisible();
	});
});

describe('hash', () => {
	it('keeps the hash of the current page in both links', async () => {
		history.replaceState(null, '', `${location.pathname}${location.search}#experience`);
		await render(LanguageToggle, {});
		await expect.poll(() => link('en').getAttribute('href')).toBe('/en/#experience');
		expect(link('nl').getAttribute('href')).toBe('/#experience');
	});

	it('follows the hash when it changes', async () => {
		await render(LanguageToggle, {});
		expect(link('en').getAttribute('href')).toBe('/en/');
		location.hash = '#skills';
		await expect.poll(() => link('en').getAttribute('href')).toBe('/en/#skills');
		location.hash = '';
		await expect.poll(() => link('en').getAttribute('href')).toBe('/en/');
	});
});

describe('controls', () => {
	it('has targets of at least 24 by 24 CSS pixels', async () => {
		await render(LanguageToggle, {});
		for (const code of ['nl', 'en']) {
			const box = link(code).getBoundingClientRect();
			expect(box.width).toBeGreaterThanOrEqual(24);
			expect(box.height).toBeGreaterThanOrEqual(24);
		}
	});

	it('shows a 2px focus ring', async () => {
		await render(LanguageToggle, {});
		link('en').focus();
		expect(document.activeElement).toBe(link('en'));
		const style = getComputedStyle(link('en'));
		expect(style.outlineStyle).toBe('solid');
		expect(style.outlineWidth).toBe('2px');
	});
});
