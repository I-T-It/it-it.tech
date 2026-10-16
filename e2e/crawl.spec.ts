import { expect, test } from '@playwright/test';
import { variantDefaults } from '../scripts/site-env.mjs';

// robots.txt and sitemap.xml of each build, as the static server answers them under the base path.
// The files name the public address of the build (github.io until the domains are live), so
// the sitemap urls are mapped onto the test server before they are requested.
type Site = 'company' | 'personal';

test.describe('crawl files', () => {
	test('robots.txt is plain text, allows everything and names this sitemap', async ({
		request
	}, testInfo) => {
		const { siteUrl } = variantDefaults(testInfo.project.name as Site);
		const response = await request.get('robots.txt');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('text/plain');

		const lines = (await response.text()).split('\n');
		expect(lines).toContain('User-agent: *');
		expect(lines).toContain('Allow: /');
		expect(lines.filter((line) => line.startsWith('Sitemap:'))).toEqual([
			`Sitemap: ${siteUrl}/sitemap.xml`
		]);
		expect(lines.some((line) => /^disallow/i.test(line))).toBe(false);
	});

	test('sitemap.xml parses and lists both home pages with their alternates', async ({
		page,
		request
	}, testInfo) => {
		const { siteUrl } = variantDefaults(testInfo.project.name as Site);
		const response = await request.get('sitemap.xml');
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('xml');

		// The browser's own parser decides whether the file is well-formed.
		await page.goto('about:blank');
		const parsed = await page.evaluate(
			(xml) => {
				const doc = new DOMParser().parseFromString(xml, 'application/xml');
				const xhtml = 'http://www.w3.org/1999/xhtml';
				return {
					broken: doc.getElementsByTagName('parsererror').length,
					root: doc.documentElement.localName,
					locs: [...doc.getElementsByTagName('loc')].map((loc) => loc.textContent),
					alternates: [...doc.getElementsByTagNameNS(xhtml, 'link')].map((link) => ({
						rel: link.getAttribute('rel'),
						hreflang: link.getAttribute('hreflang'),
						href: link.getAttribute('href')
					}))
				};
			},
			await response.text()
		);

		expect(parsed.broken).toBe(0);
		expect(parsed.root).toBe('urlset');
		expect(parsed.locs).toEqual([`${siteUrl}/`, `${siteUrl}/en/`]);
		expect(parsed.alternates).toHaveLength(6);
		for (const alternate of parsed.alternates) {
			expect(alternate.rel).toBe('alternate');
			expect(alternate.href?.startsWith(`${siteUrl}/`)).toBe(true);
		}
		expect(parsed.alternates.map((alternate) => alternate.hreflang)).toEqual([
			'nl',
			'en',
			'x-default',
			'nl',
			'en',
			'x-default'
		]);
	});

	test('every url in the sitemap is a page the build serves', async ({
		request,
		baseURL
	}, testInfo) => {
		const { siteUrl } = variantDefaults(testInfo.project.name as Site);
		const xml = await (await request.get('sitemap.xml')).text();
		const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
		expect(locs).toHaveLength(2);
		for (const loc of locs) {
			expect(loc.startsWith(`${siteUrl}/`)).toBe(true);
			const response = await request.get(baseURL! + loc.slice(siteUrl.length + 1));
			expect(response.status(), loc).toBe(200);
			expect(response.headers()['content-type'], loc).toContain('text/html');
		}
	});
});
