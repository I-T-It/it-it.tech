import { expect, test, type Page } from '@playwright/test';

// `pnpm dev` is not the built site: SvelteKit's own handler answers /_app/env.js, and the page
// hydrates through it. Playwright starts the dev server (playwright.dev.config.ts), once per
// variant and base path.
const site = process.env.PUBLIC_SITE === 'personal' ? 'personal' : 'company';

/** Everything that would show up red in the browser: console errors, page errors, 4xx and 5xx. */
function watchProblems(page: Page): string[] {
	const problems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') problems.push(`console: ${message.text()}`);
	});
	page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
	page.on('response', (response) => {
		if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
	});
	page.on('requestfailed', (request) => problems.push(`failed: ${request.url()}`));
	return problems;
}

for (const [name, path, lang] of [
	['Dutch', './', 'nl'],
	['English', 'en/', 'en']
]) {
	test(`the ${name} page hydrates on the dev server`, async ({ page }) => {
		const problems = watchProblems(page);

		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		const html = page.locator('html');
		await expect(html).toHaveAttribute('lang', lang);
		await expect(html).toHaveAttribute('data-site', site);

		// Only the client can move the header: the server renders it hidden, and it comes in once
		// the visitor has scrolled. If /_app/env.js 404s, nothing hydrates and it stays hidden.
		const header = page.locator('header');
		await expect(header).toHaveAttribute('data-hidden', 'true');
		await page.evaluate(() => window.scrollTo(0, 400));
		await expect(header).not.toHaveAttribute('data-hidden', 'true');

		expect(problems).toEqual([]);
	});
}

test('serves /_app/env.js as a module', async ({ request }) => {
	const response = await request.get('_app/env.js');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('javascript');
	// The variant settings are static and inlined, so the dynamic env can be empty.
	expect(await response.text()).toMatch(/^export const env=/);
});
