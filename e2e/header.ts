import { expect, type Page } from '@playwright/test';

/**
 * The header waits above the window at the top of the page and slides in after a short scroll.
 * Scrolls far enough and waits until it is there, so a test can click or look at it.
 * The stub page is about 1400px high; the real page is much taller.
 */
export async function revealHeader(page: Page): Promise<void> {
	await page.evaluate(() => window.scrollTo(0, 400));
	const header = page.locator('header');
	await expect(header).not.toHaveAttribute('data-hidden', 'true');
	// The slide takes 0.3 s; the header is settled when it sits at the top of the window.
	await expect.poll(async () => (await header.boundingBox())?.y).toBe(0);
	await expect(header).toHaveCSS('opacity', '1');
}
