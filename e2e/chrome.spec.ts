import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './axe.js';
import { revealHeader } from './header.js';

type Site = 'company' | 'personal';

// Built from parts: the mail scheme is never written out (see CLAUDE.md).
const scheme = ['mail', 'to'].join('');

test.describe('header', () => {
	test('shows the mark of its variant', async ({ page }, testInfo) => {
		const site = testInfo.project.name as Site;
		await page.goto('./');
		await revealHeader(page);
		const brand = page.locator('header a.brand');
		if (site === 'company') {
			await expect(brand).toHaveAccessibleName('I.T. It, naar boven');
			await expect(brand.locator('svg.logo')).toBeVisible();
			await expect(brand.locator('.wordmark')).toHaveCount(0);
		} else {
			await expect(brand).toHaveAccessibleName('Robbin "Roboroads" Schepers, naar boven');
			await expect(brand.locator('.wordmark')).toHaveText('Robbin "Roboroads" Schepers');
			await expect(brand.locator('svg')).toHaveCount(0);
		}
	});

	test('names the menu and the toggle in English on the English page', async ({ page }) => {
		await page.goto('en/');
		await revealHeader(page);
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
		await revealHeader(page);
		await page.getByRole('link', { name: 'Contact' }).first().click();
		await expect(page).toHaveURL(/#contact$/);
		const english = page.locator('header a[hreflang="en"]');
		await expect(english).toHaveAttribute('href', `${new URL(baseURL!).pathname}en/#contact`);

		await revealHeader(page);
		await english.click();
		await expect(page).toHaveURL(`${baseURL}en/#contact`);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('is fixed with JS and writes its height for scroll-padding once it shows', async ({
		page
	}) => {
		await page.goto('./');
		await revealHeader(page);
		const header = page.locator('header');
		await expect(header).toHaveCSS('position', 'fixed');
		const height = (await header.boundingBox())!.height;
		await expect
			.poll(() =>
				page.evaluate(() => document.documentElement.style.getPropertyValue('--header-height'))
			)
			.toBe(`${height}px`);
		await expect(page.locator('html')).toHaveCSS('scroll-padding-top', `${height}px`);
	});

	test('waits above the window at the top, still in the accessibility tree', async ({ page }) => {
		await page.goto('./');
		const header = page.locator('header');
		await expect(header).toHaveAttribute('data-hidden', 'true');
		await expect
			.poll(async () => (await header.boundingBox())!.y + (await header.boundingBox())!.height)
			.toBeLessThanOrEqual(0);
		await expect(header).toHaveCSS('opacity', '0');
		// Hidden to the eye only: the banner, its links and the toggle are still there.
		await expect(page.getByRole('banner')).toHaveCount(1);
		await expect(page.getByRole('link', { name: 'Contact' })).toHaveCount(1);
		await expect(page.locator('header a[hreflang="en"]')).toHaveCount(1);
		// 0 while hidden, so scroll-padding-top does not leave a gap at the top.
		await expect(page.locator('html')).toHaveCSS('scroll-padding-top', '0px');
	});

	test('slides in after a short scroll and out again at the top', async ({ page }) => {
		await page.goto('./');
		const header = page.locator('header');
		await revealHeader(page);
		await page.evaluate(() => window.scrollTo(0, 0));
		await expect(header).toHaveAttribute('data-hidden', 'true');
		await expect(header).toHaveCSS('opacity', '0');
	});

	test('moves nothing on the page when it appears', async ({ page }) => {
		await page.goto('./');
		const mainTop = () => page.evaluate(() => document.querySelector('main')!.offsetTop);
		const before = await mainTop();
		await revealHeader(page);
		expect(await mainTop()).toBe(before);
	});

	test('comes down when Tab reaches it, after the skip link', async ({ page }) => {
		await page.goto('./');
		await page.keyboard.press('Tab');
		await expect(page.locator('a.skip-link')).toBeFocused();
		await expect(page.locator('header')).toHaveAttribute('data-hidden', 'true');

		await page.keyboard.press('Tab');
		await expect(page.locator('header a.brand')).toBeFocused();
		await expect(page.locator('header')).not.toHaveAttribute('data-hidden', 'true');
		await expect.poll(async () => (await page.locator('header').boundingBox())!.y).toBe(0);
		await expect(page.locator('header')).toHaveCSS('opacity', '1');
		// Focus is visible on it.
		await expect(page.locator('header a.brand')).toHaveCSS('outline-width', '2px');
	});

	test('only shows and hides under reduced motion, with no slide', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('./');
		await expect(page.locator('header')).toHaveCSS('transition-duration', '0s');
		await revealHeader(page);
		await expect(page.locator('header')).toHaveCSS('transition-duration', '0s');
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
		// The stub page has nothing to focus. Add two links and room above and below them, then
		// scroll so the first link sits behind the header: still inside the window, so the browser
		// would not scroll to it. Shift+Tab from the second link moves focus to it. scroll-padding-top
		// is what makes the browser bring it below the header.
		await page.evaluate(() => {
			const lead = document.createElement('div');
			lead.style.height = '1000px';
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
			document.querySelector('main')!.prepend(lead, first, second, spacer);
			window.scrollTo(0, first.getBoundingClientRect().top + window.scrollY - 20);
		});
		const first = page.locator('#first');
		const header = page.locator('header');
		await expect(header).not.toHaveAttribute('data-hidden', 'true');
		await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
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

test.describe('menu', () => {
	test('has an entry for every section of the page, in page order, in both languages', async ({
		page
	}) => {
		for (const path of ['./', 'en/']) {
			await page.goto(path);
			const sections = await page
				.locator('main section')
				.evaluateAll((els) => els.map((el) => el.id));
			const entries = await page
				.locator('header details.sections a')
				.evaluateAll((links) => links.map((a) => new URL((a as HTMLAnchorElement).href).hash));
			expect(entries, path).toEqual(sections.map((id) => `#${id}`));
			// Every entry has a name of its own.
			const names = await page
				.locator('header details.sections a')
				.evaluateAll((links) => links.map((a) => a.textContent?.trim()));
			expect(new Set(names).size, path).toBe(names.length);
			expect(names.every((name) => name && name.length > 1)).toBe(true);
		}
	});

	test('keeps the entries inside the language of the page', async ({ page, baseURL }) => {
		const base = new URL(baseURL!).pathname;
		await page.goto('en/');
		const hrefs = await page
			.locator('header nav.menu a')
			.evaluateAll((links) => links.map((a) => a.getAttribute('href')));
		expect(hrefs.length).toBeGreaterThan(10);
		for (const href of hrefs) expect(href).toMatch(new RegExp(`^${base}en/#`));
		await page.goto('./');
		const nl = await page
			.locator('header nav.menu a')
			.evaluateAll((links) => links.map((a) => a.getAttribute('href')));
		for (const href of nl) expect(href).toMatch(new RegExp(`^${base}#`));
	});

	test('opens, takes you to a section and closes again', async ({ page }) => {
		await page.goto('./');
		await revealHeader(page);
		const menu = page.locator('header details.sections');
		await expect(menu).not.toHaveAttribute('open', '');
		await menu.locator('summary').click();
		await expect(menu).toHaveAttribute('open', '');
		const entries = menu.getByRole('link');
		await expect(entries).toHaveCount(11);
		for (const entry of await entries.all()) await expect(entry).toBeVisible();

		await menu.getByRole('link', { name: 'Projecten', exact: true }).click();
		await expect(page).toHaveURL(/#projects$/);
		await expect(menu).not.toHaveAttribute('open', '');
		await expect(page.locator('#projects')).toBeInViewport();
	});

	test('opens from the keyboard and closes on Escape', async ({ page }) => {
		await page.goto('./');
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await expect(page.locator('header a.brand')).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(page.locator('header details.sections summary')).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.locator('header details.sections')).toHaveAttribute('open', '');
		await page.keyboard.press('Tab');
		await expect(page.locator('header details.sections a').first()).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(page.locator('header details.sections')).not.toHaveAttribute('open', '');
		await expect(page.locator('header details.sections summary')).toBeFocused();
	});

	test('is reachable without JavaScript', async ({ browser, baseURL }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto(baseURL!);
		await page.locator('header details.sections summary').click();
		await expect(page.locator('header details.sections')).toHaveAttribute('open', '');
		await page.locator('header details.sections').getByRole('link', { name: 'Talks' }).click();
		await expect(page).toHaveURL(/#talks$/);
		await context.close();
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
	const files = ['apple-touch-icon.png', 'favicon.ico', 'favicon.svg'];

	for (const path of ['./', 'en/']) {
		test(`links an ico, an svg and an apple touch icon of its own variant, which load: ${path}`, async ({
			page,
			request
		}, testInfo) => {
			const site = testInfo.project.name;
			await page.goto(path);
			const hrefs = await page.evaluate(() =>
				Array.from(
					document.querySelectorAll<HTMLLinkElement>(
						'link[rel~="icon"], link[rel="apple-touch-icon"]'
					)
				).map((link) => link.href)
			);
			expect(hrefs.map((href) => href.split('/icons/')[1]).sort()).toEqual(
				files.map((file) => `${site}/${file}`)
			);
			for (const href of hrefs) {
				const response = await request.get(href);
				expect(response.status(), href).toBe(200);
				// A real file, not an error page (the test server sends no type for an ico).
				expect((await response.body()).length, href).toBeGreaterThan(100);
			}
		});
	}

	test('has only the icons of its own variant in the build, and answers /favicon.ico with them', async ({
		page,
		request,
		baseURL
	}, testInfo) => {
		const site = testInfo.project.name;
		const other = site === 'company' ? 'personal' : 'company';
		for (const file of files) {
			const response = await request.get(new URL(`icons/${other}/${file}`, baseURL).href);
			expect(response.status(), `icons/${other}/${file}`).toBe(404);
		}
		const own = await request.get(new URL(`icons/${site}/favicon.ico`, baseURL).href);
		const root = await request.get(new URL('favicon.ico', baseURL).href);
		expect(root.status()).toBe(200);
		expect((await root.body()).equals(await own.body())).toBe(true);
		await page.goto('./');
	});
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('keeps the header, the toggle as plain links and the footer', async ({ page, baseURL }) => {
		await page.goto('./');
		await expect(page.getByRole('banner')).toBeVisible();
		// Always there: sticky in the flow of the page, never moved or faded.
		await expect(page.locator('header')).toHaveCSS('position', 'sticky');
		await expect(page.locator('header')).toHaveCSS('opacity', '1');
		expect((await page.locator('header').boundingBox())!.y).toBe(0);
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
			await revealHeader(page);
			await expectNoAxeViolations(page);
		}
	});

	test('passes axe with the menu open, in NL and EN at 320 and 1280 CSS px', async ({ page }) => {
		for (const width of [320, 1280]) {
			await page.setViewportSize({ width, height: 800 });
			for (const path of ['./', 'en/']) {
				await page.goto(path);
				await revealHeader(page);
				await page.locator('header details.sections summary').click();
				await expect(page.locator('header details.sections')).toHaveAttribute('open', '');
				await expectNoAxeViolations(page);
				const overflow = await page.evaluate(
					() => document.documentElement.scrollWidth - document.documentElement.clientWidth
				);
				expect(overflow, `${path} at ${width}`).toBeLessThanOrEqual(0);
			}
		}
	});
});
