import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './axe.js';

// Built from parts: the mail scheme is never written out (see CLAUDE.md).
const scheme = ['mail', 'to'].join('');

const OFFERS = [
	'php-2005-called',
	'frontend-love',
	'flutter-talk',
	'flutter-workshop',
	'svelte-talk'
];

test.describe('talks and workshops', () => {
	test('lists what is ready to give, then when it was given, in Dutch', async ({ page }) => {
		await page.goto('./');
		const talks = page.locator('section#talks');
		await expect(talks.getByRole('heading', { level: 2 })).toHaveText('Talks en workshops');
		await expect(talks.getByRole('heading', { level: 3 })).toHaveText([
			'Klaar om te geven',
			'Gegeven'
		]);
		await expect(talks.locator('[data-offer]')).toHaveCount(OFFERS.length);
		await expect(talks.locator('[data-given]')).toHaveCount(9);
		// Newest first: the PHP talk of June 2024 is on top, the Svelte talk of April 2022 last.
		await expect(talks.locator('[data-given]').first()).toHaveAttribute(
			'data-given',
			'php-2005-called'
		);
		await expect(talks.locator('[data-given]').last()).toHaveAttribute(
			'data-given',
			'svelte-nieuwegein'
		);
	});

	test('says it all in English on the English page', async ({ page }) => {
		await page.goto('en/');
		const talks = page.locator('section#talks');
		await expect(talks.getByRole('heading', { level: 3 })).toHaveText(['Ready to give', 'Given']);
		await expect(talks.locator('[data-offer="flutter-workshop"] h4')).toHaveText(
			'Flutter workshop'
		);
		await expect(talks.locator('[lang]')).toHaveCount(0);
	});

	test('marks the English titles on the Dutch page and nothing else', async ({ page }) => {
		await page.goto('./');
		const marked = page.locator('section#talks [lang]');
		// Two English talks in the catalogue, the three times they were given, and the title of the
		// talk of Remi Appels that is quoted in the history.
		await expect(marked).toHaveCount(2 + 3 + 1);
		for (const lang of await marked.evaluateAll((els) =>
			els.map((el) => el.getAttribute('lang'))
		)) {
			expect(lang).toBe('en');
		}
	});

	test('is information only on both builds: no booking, no address, links to events only', async ({
		page
	}) => {
		for (const path of ['./', 'en/']) {
			await page.goto(path);
			const talks = page.locator('section#talks');
			await expect(talks.locator('button, .cta, .email')).toHaveCount(0);
			await expect(talks.locator(`[href^="${scheme}"]`)).toHaveCount(0);
			await expect(talks.getByText('[at]')).toHaveCount(0);
			await expect(talks.locator('[data-offer] a')).toHaveCount(0);
			await expect(talks.locator('a')).toHaveCount(4);
			await expect(talks.locator('a:not([data-given] a)')).toHaveCount(0);
		}
	});

	test('fits a 320px window without a sideways scroll', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 700 });
		for (const path of ['./', 'en/']) {
			await page.goto(path);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow).toBeLessThanOrEqual(0);
		}
	});

	test('passes axe in NL and EN, the talks in view', async ({ page }) => {
		for (const path of ['./#talks', 'en/#talks']) {
			await page.goto(path);
			await expect(page.locator('section#talks')).toBeVisible();
			await expectNoAxeViolations(page);
		}
	});
});
