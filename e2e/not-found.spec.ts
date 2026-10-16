import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './axe.js';

// 404.html is what GitHub Pages serves, with status 404, for every address the site does not have.
// The static server here answers 404.html with a plain 200 when it is asked for by name, and
// has no 404 page of its own, so the unknown-address cases hand the file to the browser through
// a route, with status 404, the way the host does.
const NL_LINK = 'Naar de startpagina in het Nederlands';
const EN_LINK = 'Go to the home page in English';

/** The built file of the project under test. */
function notFoundFile(project: string, baseURL: string): string {
	const base = new URL(baseURL).pathname.replace(/^\/|\/$/g, '');
	return path.resolve('e2e-out', project, base, '404.html');
}

function watchConsole(page: Page): string[] {
	const problems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error')
			problems.push(`console: ${message.text()} ${message.location().url}`);
	});
	page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
	return problems;
}

/** Shows the file at an address that does not exist, with the status the host answers. */
async function serveAsUnknownAddress(page: Page, file: string, address: string): Promise<void> {
	const body = await readFile(file, 'utf8');
	await page.route(address, (route) =>
		route.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body })
	);
}

/** The page is complete: both languages, the header at the top of the window, the way out. */
async function expectNotFoundPage(page: Page): Promise<void> {
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
	const h1 = page.getByRole('heading', { level: 1 });
	await expect(h1).toContainText('Pagina niet gevonden');
	await expect(h1).toContainText('Page not found');
	await expect(h1.locator('[lang="en"]')).toHaveText('Page not found');

	const main = page.getByRole('main');
	await expect(main).toHaveCount(1);
	await expect(main.locator('p[lang="nl"]')).toContainText('Dit adres bestaat niet');
	await expect(main.locator('p[lang="en"]')).toContainText('This address does not exist');
	await expect(main.getByRole('link', { name: NL_LINK })).toBeVisible();
	await expect(main.getByRole('link', { name: EN_LINK })).toBeVisible();

	await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex');
	await expect(page).toHaveTitle('Pagina niet gevonden / Page not found');

	// Short page: the header is part of it from the start, not waiting above the window.
	const header = page.locator('header');
	await expect(header).toBeVisible();
	await expect(header).not.toHaveAttribute('data-hidden', 'true');
	await expect(header).toHaveCSS('opacity', '1');
	expect((await header.boundingBox())?.y).toBe(0);
	await expect(page.locator('footer')).toBeVisible();
}

test.describe('404 page', () => {
	test('is built as 404.html and not as a folder', async ({ baseURL, request }, testInfo) => {
		const file = notFoundFile(testInfo.project.name, baseURL!);
		await access(file);
		await expect(access(path.join(path.dirname(file), 'not-found'))).rejects.toThrow();
		await expect(access(path.join(path.dirname(file), 'en', 'not-found'))).rejects.toThrow();

		const response = await request.get('not-found/');
		expect(response.status()).toBe(404);
	});

	test('is the page itself, not the empty shell of a single-page app', async ({
		baseURL
	}, testInfo) => {
		const html = await readFile(notFoundFile(testInfo.project.name, baseURL!), 'utf8');
		expect(html).toContain('<h1');
		expect(html).toContain('Pagina niet gevonden');
		expect(html).toContain('Page not found');
		expect(html).toContain('noindex');
		// Absolute asset links, so it loads at any depth.
		const base = new URL(baseURL!).pathname.replace(/\/$/, '');
		expect(html).toContain(`href="${base}/_app/immutable/`);
		expect(html).not.toMatch(/(?:href|src)="\.\.?\//);
	});

	test('shows both languages with JavaScript, and the way out works', async ({ page, baseURL }) => {
		const problems = watchConsole(page);
		await page.goto('404.html');
		await expectNotFoundPage(page);
		await expectNoAxeViolations(page);

		await page.getByRole('main').getByRole('link', { name: EN_LINK }).click();
		await expect(page).toHaveURL(`${baseURL}en/`);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');

		await page.goto('404.html');
		await page.getByRole('main').getByRole('link', { name: NL_LINK }).click();
		await expect(page).toHaveURL(baseURL!);
		await expect(page.locator('html')).toHaveAttribute('lang', 'nl');

		expect(problems).toEqual([]);
	});

	for (const address of ['nope/', 'nope/deeper/still.html', 'en/nope/', 'en/nope/deeper/']) {
		test(`works at an unknown address (${address}), served with status 404`, async ({
			page,
			baseURL
		}, testInfo) => {
			const problems = watchConsole(page);
			await serveAsUnknownAddress(
				page,
				notFoundFile(testInfo.project.name, baseURL!),
				`${baseURL}${address}`
			);

			const response = await page.goto(address);
			expect(response?.status()).toBe(404);
			await expectNotFoundPage(page);
			// The styles load from the absolute links, so the card is drawn, not left bare.
			await expect(page.getByRole('main').locator('.card')).toHaveCSS('border-top-style', 'solid');

			// The file is Dutch, but the header and footer follow the address, English ones
			// included. Once the page runs, <html lang> follows too, so the two agree.
			const locale = address.startsWith('en/') ? 'en' : 'nl';
			await expect(page.locator('html')).toHaveAttribute('lang', locale);
			await expect(page.locator(`header a[hreflang="${locale}"]`)).toHaveAttribute(
				'aria-current',
				'true'
			);
			await expectNoAxeViolations(page);

			// The way out leads to the real home pages, from any depth.
			await page.getByRole('main').getByRole('link', { name: NL_LINK }).click();
			await expect(page).toHaveURL(baseURL!);
			await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
			await expect(page.getByRole('heading', { level: 1 })).not.toContainText(
				'Pagina niet gevonden'
			);

			// The browser logs the 404 of the document itself. Nothing else may be logged.
			expect(problems.filter((problem) => !problem.endsWith(` ${baseURL}${address}`))).toEqual([]);
		});
	}
});

test.describe('404 page without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	// axe runs as a script in the page, so it cannot run here. The markup is the same as the one
	// the tests above check, before and after hydration.
	test('shows both languages, the header and the way out', async ({ page, baseURL }) => {
		await page.goto('404.html');
		await expectNotFoundPage(page);

		await page.getByRole('main').getByRole('link', { name: EN_LINK }).click();
		await expect(page).toHaveURL(`${baseURL}en/`);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('works at an unknown address served with status 404', async ({
		page,
		baseURL
	}, testInfo) => {
		await serveAsUnknownAddress(
			page,
			notFoundFile(testInfo.project.name, baseURL!),
			`${baseURL}nope/deeper/`
		);
		const response = await page.goto('nope/deeper/');
		expect(response?.status()).toBe(404);
		await expectNotFoundPage(page);
		await expect(page.getByRole('main').locator('.card')).toHaveCSS('border-top-style', 'solid');
	});
});
