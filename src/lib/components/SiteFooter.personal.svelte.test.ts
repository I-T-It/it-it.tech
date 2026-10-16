import '../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import SiteFooter from './SiteFooter.svelte';

// The variant is a build-time constant: this file runs the personal build. SiteFooter reads `site`
// only. The company build is covered in SiteFooter.svelte.test.ts.
vi.mock('../site.js', () => ({
	site: 'personal',
	variant: { site: 'personal' }
}));

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

const footer = () => document.querySelector('footer')!;

afterEach(async () => {
	setLocale('nl');
	await page.viewport(414, 896);
});

describe('no company details', () => {
	it('shows no KvK number and no BTW number, in Dutch', async () => {
		await render(SiteFooter, {});
		expect(footer().textContent).not.toContain('86738852');
		expect(footer().textContent).not.toContain('NL002333708B14');
		expect(footer().textContent).not.toContain('KvK');
		expect(footer().textContent).not.toContain('BTW');
	});

	it('shows no KvK number and no VAT number, in English', async () => {
		setLocale('en');
		await render(SiteFooter, {});
		expect(footer().textContent).not.toContain('86738852');
		expect(footer().textContent).not.toContain('NL002333708B14');
		expect(footer().textContent).not.toContain('KvK');
		expect(footer().textContent).not.toContain('VAT');
	});

	it('has no description list, so no label without a value is left behind', async () => {
		await render(SiteFooter, {});
		expect(footer().querySelectorAll('dl, dt, dd')).toHaveLength(0);
	});

	it('does not name the company or its town', async () => {
		await render(SiteFooter, {});
		expect(footer().textContent).not.toContain('I.T. It');
		expect(footer().textContent).not.toContain('Zwaag');
	});
});

describe('personal footer', () => {
	it('is the contentinfo landmark', async () => {
		const screen = await render(SiteFooter, {});
		await expect.element(screen.getByRole('contentinfo')).toBeVisible();
	});

	it('names the owner as he is known, and the year', async () => {
		await render(SiteFooter, {});
		expect(footer().textContent).toContain('Robbin "Roboroads" Schepers');
		expect(footer().textContent).toContain(
			`© ${new Date().getFullYear()} Robbin "Roboroads" Schepers`
		);
	});

	it('keeps LinkedIn and GitHub, each saying that it leaves the site', async () => {
		const screen = await render(SiteFooter, {});
		await expect
			.element(screen.getByRole('link', { name: 'LinkedIn (externe site)' }))
			.toHaveAttribute('href', 'https://www.linkedin.com/in/roboroads');
		await expect
			.element(screen.getByRole('link', { name: 'GitHub (externe site)' }))
			.toHaveAttribute('href', 'https://github.com/Roboroads');
	});

	it('holds no email', async () => {
		await render(SiteFooter, {});
		expect(footer().textContent).not.toContain('@');
		expect(footer().querySelectorAll('a[href^="mail"]')).toHaveLength(0);
	});

	it('fits at 320 CSS px without sideways scroll', async () => {
		await page.viewport(320, 640);
		await render(SiteFooter, {});
		expect(footer().scrollWidth).toBeLessThanOrEqual(footer().clientWidth);
		for (const el of footer().querySelectorAll('*')) {
			expect(el.getBoundingClientRect().right).toBeLessThanOrEqual(320);
		}
	});
});
