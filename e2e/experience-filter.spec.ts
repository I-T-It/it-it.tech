import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './axe.js';

// The Experience filter on the built site, in both variants: the link that restores it, the Skills
// links that set it, and the accessibility of the page with it on. Laravel is in seven of the
// twelve roles, Docker in five and Apache (in the long tail) in two.

const ROLES = 12;

const rows = (page: Page) => page.locator('#experience .timeline > li');
const shown = (page: Page) => page.locator('#experience .timeline > li:not([hidden])');
const chip = (page: Page, name: string) =>
	page.locator('#experience [data-filter]').getByRole('button', { name, exact: true });
const status = (page: Page) => page.locator('#experience [role="status"]');

test.describe('Experience filter', () => {
	test('shows every role and no filter without JavaScript', async ({ browser, baseURL }) => {
		const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('./?skill=laravel#experience');
		await expect(shown(page)).toHaveCount(ROLES);
		await expect(page.locator('#experience [data-filter]')).toBeHidden();
		await expect(page.locator('#skills a')).toHaveCount(0);
		await context.close();
	});

	test('starts with every role and nothing announced', async ({ page }) => {
		await page.goto('./');
		await expect(shown(page)).toHaveCount(ROLES);
		await expect(chip(page, `Alles (${ROLES})`)).toHaveAttribute('aria-pressed', 'true');
		await expect(status(page)).toHaveText('');
	});

	test('restores the filter from the address and lands on the roles', async ({ page }) => {
		await page.goto('./?skill=laravel#experience');
		await expect(shown(page)).toHaveCount(7);
		await expect(rows(page)).toHaveCount(ROLES);
		await expect(chip(page, 'Laravel (7)')).toHaveAttribute('aria-pressed', 'true');
		await expect(status(page)).toHaveText('7 rollen met Laravel');
		await expect(page).toHaveURL(/\?skill=laravel#experience$/);

		// The chip is where the address says: its top is near the top of the window.
		await expect
			.poll(async () => (await page.locator('#experience').boundingBox())?.y ?? 9999)
			.toBeLessThan(200);
	});

	test('takes any spelling of the skill from the address', async ({ page }) => {
		await page.goto('./?skill=Vue.js#experience');
		await expect(shown(page)).toHaveCount(6);
		await expect(chip(page, 'Vue.js (6)')).toHaveAttribute('aria-pressed', 'true');
	});

	test('shows every role for an unknown skill in the address', async ({ page }) => {
		await page.goto('./?skill=cobol#experience');
		await expect(shown(page)).toHaveCount(ROLES);
		await expect(chip(page, `Alles (${ROLES})`)).toHaveAttribute('aria-pressed', 'true');
	});

	test('filters on a click, puts the link in the address and gives the same view to a copy of it', async ({
		page,
		context
	}) => {
		await page.goto('./#experience');
		await chip(page, 'Docker (5)').click();
		await expect(shown(page)).toHaveCount(5);
		await expect(status(page)).toHaveText('5 rollen met Docker');
		await expect(page).toHaveURL(/\?skill=docker#experience$/);
		// The tags that matched are marked.
		await expect(page.locator('#experience .tech li[data-match]')).toHaveCount(5);

		const copy = await context.newPage();
		await copy.goto(page.url());
		await expect(shown(copy)).toHaveCount(5);
		await expect(chip(copy, 'Docker (5)')).toHaveAttribute('aria-pressed', 'true');
		await copy.close();
	});

	test('goes back to every role with "Alles", and keeps the section in the address', async ({
		page
	}) => {
		await page.goto('./?skill=laravel#experience');
		await chip(page, `Alles (${ROLES})`).click();
		await expect(shown(page)).toHaveCount(ROLES);
		await expect(status(page)).toHaveText(`Alle ${ROLES} rollen`);
		await expect(page).toHaveURL(/#experience$/);
		expect(new URL(page.url()).search).toBe('');
	});

	test('opens the long tail and keeps a skill from it that is in use', async ({ page }) => {
		await page.goto('./?skill=apache#experience');
		await expect(chip(page, 'Apache (2)')).toHaveAttribute('aria-pressed', 'true');
		const toggle = page.locator('#experience [data-filter] button[aria-expanded]');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(toggle).toHaveText('Minder tonen');
	});

	test('is operated with the keyboard', async ({ page }) => {
		await page.goto('./#experience');
		await chip(page, 'Laravel (7)').focus();
		await page.keyboard.press('Enter');
		await expect(shown(page)).toHaveCount(7);
		await expect(chip(page, 'Laravel (7)')).toBeFocused();
		await page.keyboard.press('Space');
		await expect(shown(page)).toHaveCount(ROLES);
	});

	test('speaks English on the English page', async ({ page }) => {
		await page.goto('en/?skill=laravel#experience');
		await expect(shown(page)).toHaveCount(7);
		await expect(status(page)).toHaveText('7 roles with Laravel');
		await expect(chip(page, `All (${ROLES})`)).toHaveAttribute('aria-pressed', 'false');
	});

	test('fits a 320 CSS px window with the long tail open', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 700 });
		await page.goto('./?skill=laravel#experience');
		await page.locator('#experience [data-filter] button[aria-expanded]').click();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});

test.describe('Skills links', () => {
	test('filter the roles and bring the visitor to them', async ({ page }) => {
		await page.goto('./');
		const link = page.locator('#skills [data-skill="laravel"] a');
		await link.scrollIntoViewIfNeeded();
		await expect(link).toHaveAttribute('href', '?skill=laravel#experience');
		await link.click();

		await expect(shown(page)).toHaveCount(7);
		await expect(page).toHaveURL(/\?skill=laravel#experience$/);
		await expect(status(page)).toHaveText('7 rollen met Laravel');
		await expect(chip(page, 'Laravel (7)')).toBeFocused();
		// The Experience chip is in view, below the header.
		await expect
			.poll(async () => (await page.locator('#experience').boundingBox())?.y ?? 9999)
			.toBeLessThan(200);
		await expect
			.poll(async () => (await page.locator('#experience').boundingBox())?.y ?? -9999)
			.toBeGreaterThanOrEqual(0);
	});

	test('link only the skills that a role has', async ({ page }) => {
		await page.goto('./');
		await expect(page.locator('#skills [data-skill="php"] a')).toHaveCount(1);
		await expect(page.locator('#skills [data-skill="cobol"] a')).toHaveCount(0);
		await expect(page.locator('#skills [data-skill="programming"] a')).toHaveCount(0);
	});
});

test.describe('Experience filter accessibility', () => {
	for (const [language, path] of [
		['Dutch', './'],
		['English', 'en/']
	]) {
		test(`passes axe in ${language}: no filter, one on, the long tail and the roles open`, async ({
			page
		}) => {
			test.setTimeout(90_000);
			await page.goto(path);
			await expectNoAxeViolations(page);

			await page.goto(`${path}?skill=laravel#experience`);
			await expect(shown(page)).toHaveCount(7);
			await expectNoAxeViolations(page);

			await page.locator('#experience [data-filter] button[aria-expanded]').click();
			await page.evaluate(() => {
				for (const details of document.querySelectorAll('#experience details')) {
					(details as HTMLDetailsElement).open = true;
				}
			});
			await expectNoAxeViolations(page);
		});
	}

	test('passes axe at 320 CSS px with a filter on and a control focused', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 700 });
		await page.goto('./?skill=vue#experience');
		await chip(page, 'Vue.js (6)').focus();
		await expectNoAxeViolations(page);
	});

	test('gives every filter control a target of at least 24 CSS px', async ({ page }) => {
		await page.goto('./#experience');
		for (const button of await page.locator('#experience [data-filter] button').all()) {
			const box = await button.boundingBox();
			expect(box?.width, await button.innerText()).toBeGreaterThanOrEqual(24);
			expect(box?.height, await button.innerText()).toBeGreaterThanOrEqual(24);
		}
	});
});
