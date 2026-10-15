import '../../app.css';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import SiteFooter from './SiteFooter.svelte';

// Built from parts: the mail scheme is never written out (see CLAUDE.md).
const scheme = ['mail', 'to'].join('');

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

afterEach(async () => {
	setLocale('nl');
	await page.viewport(414, 896);
});

describe('company facts', () => {
	it('is the contentinfo landmark', async () => {
		const screen = await render(SiteFooter, {});
		await expect.element(screen.getByRole('contentinfo')).toBeVisible();
	});

	it('shows the KvK number', async () => {
		const screen = await render(SiteFooter, {});
		await expect.element(screen.getByText('86738852', { exact: true })).toBeVisible();
	});

	it('shows the BTW number', async () => {
		const screen = await render(SiteFooter, {});
		await expect.element(screen.getByText('NL002333708B14', { exact: true })).toBeVisible();
	});

	it('names the numbers in Dutch', async () => {
		const screen = await render(SiteFooter, {});
		await expect.element(screen.getByText('KvK-nummer')).toBeVisible();
		await expect.element(screen.getByText('BTW-nummer')).toBeVisible();
	});

	it('names the numbers in English', async () => {
		setLocale('en');
		const screen = await render(SiteFooter, {});
		await expect.element(screen.getByText('KvK number')).toBeVisible();
		await expect.element(screen.getByText('VAT number')).toBeVisible();
	});

	it('pairs each number with its label in a description list', async () => {
		await render(SiteFooter, {});
		const terms = Array.from(document.querySelectorAll('dt')).map((dt) => dt.textContent);
		const values = Array.from(document.querySelectorAll('dd')).map((dd) => dd.textContent);
		expect(terms).toEqual(['KvK-nummer', 'BTW-nummer']);
		expect(values).toEqual(['86738852', 'NL002333708B14']);
	});

	it('names the company, its town and the year', async () => {
		const screen = await render(SiteFooter, {});
		await expect.element(screen.getByText('Zwaag')).toBeVisible();
		const footer = document.querySelector('footer')!;
		expect(footer.textContent).toContain('I.T. It');
		expect(footer.textContent).toContain(`© ${new Date().getFullYear()} I.T. It`);
	});
});

describe('links', () => {
	it('has LinkedIn and GitHub, each saying that it leaves the site', async () => {
		const screen = await render(SiteFooter, {});
		const linkedin = screen.getByRole('link', { name: 'LinkedIn (externe site)' });
		const github = screen.getByRole('link', { name: 'GitHub (externe site)' });
		await expect.element(linkedin).toHaveAttribute('href', 'https://www.linkedin.com/in/roboroads');
		await expect.element(github).toHaveAttribute('href', 'https://github.com/Roboroads');
	});

	it('says it in English too', async () => {
		setLocale('en');
		const screen = await render(SiteFooter, {});
		await expect
			.element(screen.getByRole('link', { name: 'LinkedIn (external site)' }))
			.toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 'GitHub (external site)' }))
			.toBeVisible();
	});

	it('keeps the visible text inside the name (2.5.3)', async () => {
		await render(SiteFooter, {});
		for (const link of document.querySelectorAll('footer a')) {
			const visible = Array.from(link.childNodes)
				.filter((node) => node.nodeType === Node.TEXT_NODE)
				.map((node) => node.textContent)
				.join('')
				.trim();
			expect(visible.length).toBeGreaterThan(0);
			expect(link.textContent).toContain(visible);
		}
	});

	it('does not open new tabs, so no surprise for anyone', async () => {
		await render(SiteFooter, {});
		expect(document.querySelectorAll('footer a[target]')).toHaveLength(0);
	});

	it('has targets of at least 24 by 24 CSS pixels', async () => {
		await render(SiteFooter, {});
		for (const link of document.querySelectorAll('footer a')) {
			const box = link.getBoundingClientRect();
			expect(box.width).toBeGreaterThanOrEqual(24);
			expect(box.height).toBeGreaterThanOrEqual(24);
		}
	});
});

describe('no email', () => {
	it('holds no address, no mail link and no spelled-out fallback', async () => {
		await render(SiteFooter, {});
		const footer = document.querySelector('footer')!;
		expect(footer.querySelectorAll(`a[href^="${scheme}"]`)).toHaveLength(0);
		expect(footer.innerHTML.toLowerCase()).not.toContain(scheme);
		expect(footer.textContent).not.toContain('@');
		expect(footer.textContent).not.toContain('[at]');
		expect(footer.querySelector('.email')).toBeNull();
	});
});

describe('reflow', () => {
	it('fits at 320 CSS px without sideways scroll', async () => {
		await page.viewport(320, 640);
		await render(SiteFooter, {});
		const footer = document.querySelector('footer')!;
		expect(footer.scrollWidth).toBeLessThanOrEqual(footer.clientWidth);
		for (const el of footer.querySelectorAll('*')) {
			expect(el.getBoundingClientRect().right).toBeLessThanOrEqual(320);
		}
	});
});
