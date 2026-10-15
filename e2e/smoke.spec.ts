import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './axe.js';

type Site = 'company' | 'personal';

// DOM order is visual order: the variant decides which availability chip comes first.
const sectionOrder: Record<Site, string[]> = {
	company: [
		'hero',
		'freelance',
		'job',
		'about',
		'competences',
		'experience',
		'skills',
		'talks',
		'education',
		'contact'
	],
	personal: [
		'hero',
		'job',
		'freelance',
		'about',
		'competences',
		'experience',
		'skills',
		'talks',
		'education',
		'contact'
	]
};

function watchConsole(page: Page): string[] {
	const problems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') problems.push(`console: ${message.text()}`);
	});
	page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
	return problems;
}

test.describe('skeleton', () => {
	test('serves the Dutch page with the right variant', async ({ page }, testInfo) => {
		const site = testInfo.project.name as Site;
		const problems = watchConsole(page);

		const response = await page.goto('./');
		expect(response?.status()).toBe(200);

		const html = page.locator('html');
		await expect(html).toHaveAttribute('lang', 'nl');
		await expect(html).toHaveAttribute('data-site', site);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Robbin Schepers');

		const ids = await page.locator('main > section').evaluateAll((els) => els.map((el) => el.id));
		expect(ids).toEqual(sectionOrder[site]);
		await expect(page.locator('main h2')).toHaveCount(9);

		expect(problems).toEqual([]);
	});

	test('serves the English page', async ({ page }, testInfo) => {
		const site = testInfo.project.name as Site;
		const problems = watchConsole(page);

		const response = await page.goto('en/');
		expect(response?.status()).toBe(200);

		const html = page.locator('html');
		await expect(html).toHaveAttribute('lang', 'en');
		await expect(html).toHaveAttribute('data-site', site);
		await expect(page.getByRole('heading', { name: 'Experience' })).toBeVisible();

		expect(problems).toEqual([]);
	});

	test('the language links keep the base path', async ({ page, baseURL }) => {
		await page.goto('./');
		const en = page.locator('nav a[hreflang="en"]');
		const nl = page.locator('nav a[hreflang="nl"]');
		await expect(en).toHaveAttribute('href', `${new URL(baseURL!).pathname}en/`);
		await expect(nl).toHaveAttribute('href', new URL(baseURL!).pathname);

		await en.click();
		await expect(page).toHaveURL(`${baseURL}en/`);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');

		await page.locator('nav a[hreflang="nl"]').click();
		await expect(page).toHaveURL(baseURL!);
		await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
	});

	test('has landmarks, a skip link and one h1', async ({ page }) => {
		await page.goto('./');
		await expect(page.getByRole('main')).toHaveCount(1);
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
		await expect(page.locator('canvas')).toHaveAttribute('aria-hidden', 'true');

		const skipLink = page.locator('a.skip-link');
		await expect(skipLink).toHaveAttribute('href', '#main');
		await page.keyboard.press('Tab');
		await expect(skipLink).toBeFocused();
		await expect(skipLink).toBeVisible();
		await page.keyboard.press('Enter');
		await expect(page.locator('main')).toBeFocused();
	});

	test('passes axe with the WCAG 2.2 AA tags in NL and EN', async ({ page }) => {
		await page.goto('./');
		await expectNoAxeViolations(page);
		await page.goto('en/');
		await expectNoAxeViolations(page);
	});

	test('keeps the variant out of the other build', async ({ page }, testInfo) => {
		const other: Site = testInfo.project.name === 'company' ? 'personal' : 'company';
		await page.goto('./');
		await expect(page.locator(`html[data-site="${other}"]`)).toHaveCount(0);
	});
});
