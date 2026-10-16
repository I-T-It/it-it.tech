import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './axe.js';

// The head of each build, as the prerender wrote it. scripts/e2e-serve.mjs clears the address
// variables, so every build says its github.io address, whatever the shell has set.
type Site = 'company' | 'personal';
type Locale = 'nl' | 'en';

const siteUrls: Record<Site, string> = {
	company: 'https://i-t-it.github.io/it-it.tech',
	personal: 'https://roboroads.github.io/deschepers.nl'
};
const personalSiteLink = 'https://roboroads.github.io/deschepers.nl/';
const companyHost = 'i-t-it.github.io';
const personalHost = 'roboroads.github.io';

const pages: [Locale, string][] = [
	['nl', './'],
	['en', 'en/']
];

const titles: Record<Site, Record<Locale, string>> = {
	company: {
		nl: 'I.T. It - Voor alles met stekkers',
		en: 'I.T. It - For everything with a plug'
	},
	personal: {
		nl: 'Robbin "Roboroads" Schepers - Professionele Computer Nerd',
		en: 'Robbin "Roboroads" Schepers - Professional Computer Nerd'
	}
};

const meta = (page: Page, key: string) =>
	page.locator(`head meta[name="${key}"], head meta[property="${key}"]`);

/** Every address in the head outside the JSON-LD. */
async function headAddresses(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const out: string[] = [];
		for (const el of document.head.querySelectorAll('link[href], meta[content]')) {
			const value = el.getAttribute('href') ?? el.getAttribute('content') ?? '';
			if (/^https?:\/\//.test(value)) out.push(value);
		}
		return out;
	});
}

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
	const scripts = page.locator('head script[type="application/ld+json"]');
	await expect(scripts).toHaveCount(1);
	const data = JSON.parse((await scripts.textContent())!);
	expect(data['@context']).toBe('https://schema.org');
	return data['@graph'];
}

test.describe('head', () => {
	for (const [locale, path] of pages) {
		test.describe(locale, () => {
			test('canonical, hreflang and Open Graph point at this build only', async ({
				page
			}, testInfo) => {
				const site = testInfo.project.name as Site;
				const siteUrl = siteUrls[site];
				const url = locale === 'en' ? `${siteUrl}/en/` : `${siteUrl}/`;
				await page.goto(path);

				await expect(page).toHaveTitle(titles[site][locale]);
				await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
				await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', url);
				const alternates = await page
					.locator('head link[rel="alternate"][hreflang]')
					.evaluateAll((els) =>
						els.map((el) => [el.getAttribute('hreflang'), el.getAttribute('href')])
					);
				expect(alternates).toEqual([
					['nl', `${siteUrl}/`],
					['en', `${siteUrl}/en/`],
					['x-default', `${siteUrl}/`]
				]);

				await expect(meta(page, 'description')).toHaveCount(1);
				await expect(meta(page, 'og:url')).toHaveAttribute('content', url);
				await expect(meta(page, 'og:title')).toHaveAttribute('content', titles[site][locale]);
				await expect(meta(page, 'og:site_name')).toHaveAttribute(
					'content',
					site === 'company' ? 'I.T. It' : 'Robbin Schepers'
				);
				await expect(meta(page, 'og:type')).toHaveAttribute(
					'content',
					site === 'company' ? 'website' : 'profile'
				);
				await expect(meta(page, 'og:locale')).toHaveAttribute(
					'content',
					locale === 'en' ? 'en_US' : 'nl_NL'
				);
				await expect(meta(page, 'og:image')).toHaveAttribute(
					'content',
					`${siteUrl}/og/${locale}.png`
				);
				await expect(meta(page, 'og:image:width')).toHaveAttribute('content', '1200');
				await expect(meta(page, 'og:image:height')).toHaveAttribute('content', '630');
				await expect(meta(page, 'og:image:alt')).not.toHaveAttribute('content', '');
				await expect(meta(page, 'twitter:card')).toHaveAttribute('content', 'summary_large_image');
				await expect(meta(page, 'twitter:image:alt')).not.toHaveAttribute('content', '');
				await expect(meta(page, 'theme-color')).toHaveAttribute('content', '#001333');
				await expect(meta(page, 'generator')).toHaveCount(0);

				// No tag mentions the other domain.
				const other = site === 'company' ? personalHost : companyHost;
				for (const address of await headAddresses(page)) {
					expect(new URL(address).host, address).not.toBe(other);
				}
			});

			test('JSON-LD has the types of this build and no email', async ({ page }, testInfo) => {
				const site = testInfo.project.name as Site;
				const siteUrl = siteUrls[site];
				await page.goto(path);
				const graph = await jsonLd(page);
				const types = graph.map((n) => n['@type']).sort();

				if (site === 'company') {
					expect(types).toEqual(['Person', 'ProfessionalService', 'WebSite']);
					const org = graph.find((n) => n['@type'] === 'ProfessionalService')!;
					const person = graph.find((n) => n['@type'] === 'Person')!;
					expect(org.url).toBe(`${siteUrl}/`);
					expect(org.founder).toEqual({ '@id': person['@id'] });
					expect(person['@id']).toBe(`${personalSiteLink}#person`);
					expect(org.vatID).toBeTruthy();
				} else {
					expect(types).toEqual(['Person', 'ProfilePage', 'WebSite']);
					const profile = graph.find((n) => n['@type'] === 'ProfilePage')!;
					const person = graph.find((n) => n['@type'] === 'Person')!;
					expect(profile.mainEntity).toEqual({ '@id': person['@id'] });
					expect(person['@id']).toBe(`${siteUrl}/#person`);
				}

				const text = JSON.stringify(graph);
				expect(text).not.toMatch(/[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
				expect(text).not.toContain('worksFor');
				expect(text).not.toContain('areaServed');
				expect(text).not.toContain('"address"');
			});
		});
	}

	test('a query or a hash folds into the clean canonical', async ({ page }, testInfo) => {
		const site = testInfo.project.name as Site;
		const url = `${siteUrls[site]}/`;
		await page.goto('./?skill=laravel');
		await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
		await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', url);
		await expect(meta(page, 'og:url')).toHaveAttribute('content', url);
		await page.goto('./#talks');
		await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', url);
	});
});

test.describe('cross-link', () => {
	test('the company contact chip links to the personal site, in the language of the page', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'company', 'the company build links out');
		await page.goto('./');
		const nl = page.locator('#contact a[href="' + personalSiteLink + '"]');
		await expect(nl).toHaveCount(1);
		await expect(nl).toContainText('Persoonlijke site van Robbin');
		await expect(nl.locator('.sr-only')).toHaveText('(externe site)');

		await page.goto('en/');
		const en = page.locator('#contact a[href="' + personalSiteLink + 'en/"]');
		await expect(en).toHaveCount(1);
		await expect(en).toContainText("Robbin's personal site");
		await expect(en.locator('.sr-only')).toHaveText('(external site)');
	});

	test('the personal contact chip has no link to itself and keeps the one to I.T. It', async ({
		page
	}, testInfo) => {
		test.skip(testInfo.project.name !== 'personal', 'the personal build links to I.T. It');
		await page.goto('./');
		await expect(page.locator('#contact a[href^="' + personalSiteLink + '"]')).toHaveCount(0);
		await expect(
			page.locator('#contact a[href^="https://i-t-it.github.io/it-it.tech/"]')
		).toHaveCount(1);
	});
});

test.describe('photo', () => {
	test('the personal hero photo is fetched first', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'personal', 'only the personal hero has the photo');
		await page.goto('./');
		const photo = page.locator('#hero img.photo');
		await expect(photo).toHaveCount(1);
		await expect(photo).toHaveAttribute('fetchpriority', 'high');
	});
});

test.describe('accessibility', () => {
	test('has no axe violations in NL and EN with the new contact row', async ({ page }) => {
		for (const [, path] of pages) {
			await page.goto(path);
			await page.locator('#contact').scrollIntoViewIfNeeded();
			await expectNoAxeViolations(page);
		}
	});
});
