import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './axe.js';

type Site = 'company' | 'personal';

// Built from parts: the mail scheme is never written out (see CLAUDE.md).
const scheme = ['mail', 'to'].join('');

test.describe('header', () => {
	test('shows the mark of its variant', async ({ page }, testInfo) => {
		const site = testInfo.project.name as Site;
		await page.goto('./');
		const brand = page.locator('header a.brand');
		if (site === 'company') {
			await expect(brand).toHaveAccessibleName('I.T. It, naar boven');
			await expect(brand.locator('svg.logo')).toBeVisible();
			await expect(brand.locator('.wordmark')).toHaveCount(0);
		} else {
			await expect(brand).toHaveAccessibleName('Robbin Schepers, naar boven');
			await expect(brand.locator('.wordmark')).toHaveText('Robbin Schepers');
			await expect(brand.locator('svg')).toHaveCount(0);
		}
	});

	test('names the menu and the toggle in English on the English page', async ({ page }) => {
		await page.goto('en/');
		await expect(page.getByRole('navigation', { name: 'Main menu' })).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Language' })).toBeVisible();
		const english = page.locator('header a[hreflang="en"]');
		await expect(english).toHaveAttribute('aria-current', 'true');
		await expect(english).toHaveAccessibleName('English (EN)');
		await expect(page.locator('header a[hreflang="nl"]')).toHaveAccessibleName(
			'Naar Nederlands (NL)'
		);
	});

	test('the toggle keeps the section you are on', async ({ page, baseURL }) => {
		await page.goto('./');
		await page.getByRole('link', { name: 'Contact' }).first().click();
		await expect(page).toHaveURL(/#contact$/);
		const english = page.locator('header a[hreflang="en"]');
		await expect(english).toHaveAttribute('href', `${new URL(baseURL!).pathname}en/#contact`);

		await english.click();
		await expect(page).toHaveURL(`${baseURL}en/#contact`);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('sticks to the top and writes its height for scroll-padding', async ({ page }) => {
		await page.goto('./');
		const header = page.locator('header');
		await expect(header).toHaveCSS('position', 'sticky');
		const height = (await header.boundingBox())!.height;
		await expect
			.poll(() =>
				page.evaluate(() => document.documentElement.style.getPropertyValue('--header-height'))
			)
			.toBe(`${height}px`);
		await expect(page.locator('html')).toHaveCSS('scroll-padding-top', `${height}px`);
	});

	test('never covers the element that takes focus', async ({ page }) => {
		// Reduced motion turns smooth scrolling off, so the scroll position is settled when we look.
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('./');
		// The header writes --header-height on hydration. Wait for it: nodes added before hydration
		// ends are removed again.
		await page.waitForFunction(
			() => document.documentElement.style.getPropertyValue('--header-height') !== ''
		);
		// The stub page has nothing to focus. Add two links and room below them, then scroll so the
		// first link sits behind the header: still inside the window, so the browser would not scroll
		// to it. Shift+Tab from the second link moves focus to it. scroll-padding-top is what makes
		// the browser bring it below the header.
		await page.evaluate(() => {
			const first = document.createElement('a');
			first.id = 'first';
			first.href = '#first';
			first.textContent = 'first';
			const second = document.createElement('a');
			second.id = 'second';
			second.href = '#second';
			second.textContent = 'second';
			const spacer = document.createElement('div');
			spacer.style.height = '150vh';
			document.querySelector('main')!.prepend(first, second, spacer);
			window.scrollTo(0, first.getBoundingClientRect().top + window.scrollY - 20);
		});
		const first = page.locator('#first');
		const header = page.locator('header');
		expect((await first.boundingBox())!.y).toBeLessThan((await header.boundingBox())!.height);

		await page.locator('#second').focus();
		await page.keyboard.press('Shift+Tab');
		await expect(first).toBeFocused();
		await expect
			.poll(async () => {
				const link = (await first.boundingBox())!;
				const bar = (await header.boundingBox())!;
				return link.y - (bar.y + bar.height);
			})
			.toBeGreaterThanOrEqual(0);
	});

	test('fits a 320 CSS px window without sideways scroll, in both languages', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 700 });
		for (const path of ['./', 'en/']) {
			await page.goto(path);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow, path).toBeLessThanOrEqual(0);
			await expect(page.locator('header')).toHaveCSS('height', '56px');
		}
	});
});

test.describe('footer', () => {
	test('shows the KvK and BTW numbers and no email', async ({ page }) => {
		await page.goto('./');
		const footer = page.getByRole('contentinfo');
		await expect(footer).toContainText('KvK-nummer');
		await expect(footer).toContainText('86738852');
		await expect(footer).toContainText('BTW-nummer');
		await expect(footer).toContainText('NL002333708B14');
		await expect(footer.getByRole('link', { name: /LinkedIn/ })).toBeVisible();
		await expect(footer.getByRole('link', { name: /GitHub/ })).toBeVisible();
		await expect(footer.locator(`a[href^="${scheme}"]`)).toHaveCount(0);
		await expect(footer).not.toContainText('@');
	});

	test('says it in English', async ({ page }) => {
		await page.goto('en/');
		const footer = page.getByRole('contentinfo');
		await expect(footer).toContainText('KvK number');
		await expect(footer).toContainText('VAT number');
		await expect(footer.getByRole('link', { name: 'LinkedIn (external site)' })).toBeVisible();
	});

	test('sits below the content on a short page', async ({ page }) => {
		await page.goto('./');
		const footer = (await page.getByRole('contentinfo').boundingBox())!;
		const viewport = page.viewportSize()!;
		expect(footer.y + footer.height).toBeGreaterThanOrEqual(viewport.height - 1);
	});
});

test.describe('icons', () => {
	test('links an ico, an svg and an apple touch icon that all load', async ({ page, request }) => {
		await page.goto('./');
		const hrefs = await page.evaluate(() =>
			Array.from(
				document.querySelectorAll<HTMLLinkElement>(
					'link[rel~="icon"], link[rel="apple-touch-icon"]'
				)
			).map((link) => link.href)
		);
		expect(hrefs.map((href) => href.split('/').pop()).sort()).toEqual([
			'apple-touch-icon.png',
			'favicon.ico',
			'favicon.svg'
		]);
		for (const href of hrefs) {
			const response = await request.get(href);
			expect(response.status(), href).toBe(200);
		}
	});
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('keeps the header, the toggle as plain links and the footer', async ({ page, baseURL }) => {
		await page.goto('./');
		await expect(page.getByRole('banner')).toBeVisible();
		await expect(page.locator('header a[hreflang="en"]')).toHaveAttribute(
			'href',
			`${new URL(baseURL!).pathname}en/`
		);
		await expect(page.getByRole('contentinfo')).toContainText('86738852');

		await page.locator('header a[hreflang="en"]').click();
		await expect(page).toHaveURL(`${baseURL}en/`);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});
});

test.describe('accessibility', () => {
	test('passes axe at 320 CSS px and with a focused control', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 700 });
		for (const path of ['./', 'en/']) {
			await page.goto(path);
			await page.keyboard.press('Tab');
			await expectNoAxeViolations(page);
		}
	});
});
