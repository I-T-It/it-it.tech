import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './axe.js';

type Site = 'company' | 'personal';

// Built from parts: the address and the mail scheme are never written out (see CLAUDE.md).
const address = ['info', '@', 'it-it', '.', 'tech'].join('');
const scheme = ['mail', 'to'].join('');

const OFFERS = [
	'php-2005-called',
	'frontend-love',
	'services-pocket',
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
		// Three English talks in the catalogue, and the four times they were given.
		await expect(marked).toHaveCount(3 + 4);
		for (const lang of await marked.evaluateAll((els) =>
			els.map((el) => el.getAttribute('lang'))
		)) {
			expect(lang).toBe('en');
		}
	});

	test('books by mail on the company build and by I.T. It on the personal build', async ({
		page
	}, testInfo) => {
		const site = testInfo.project.name as Site;
		await page.goto('./');
		const talks = page.locator('section#talks');

		if (site === 'company') {
			const cta = talks.locator('[data-offer="svelte-talk"] a.email.cta');
			await expect(cta).toHaveText('Boek deze talk');
			await expect(cta).toHaveAttribute(
				'href',
				`${scheme}:${address}?subject=${encodeURIComponent('Talk/workshop: Svelte-talk')}`
			);
			await expect(talks.locator('a.email.cta')).toHaveCount(OFFERS.length);
		} else {
			await expect(talks.locator(`a.email, [href^="${scheme}"]`)).toHaveCount(0);
			await expect(talks.getByText('[at]')).toHaveCount(0);
			const link = talks.locator('[data-offer="svelte-talk"] a');
			await expect(link).toHaveAccessibleName('Boek via I.T. It (externe site)');
			// The company site, not this one: until the domains are live that is its github.io address.
			expect(await link.getAttribute('href')).toMatch(/\/it-it\.tech\/#offer-svelte-talk$/);
		}
	});

	test('gives every offer an anchor to jump to', async ({ page }) => {
		await page.goto('./#offer-flutter-workshop');
		const offer = page.locator('#offer-flutter-workshop');
		await expect(offer).toHaveAttribute('data-offer', 'flutter-workshop');
		await expect(offer).toBeInViewport();
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
