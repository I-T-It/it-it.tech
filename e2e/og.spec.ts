import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { variantDefaults } from '../scripts/site-env.mjs';

// The preview cards of each build (og/nl.png, og/en.png), made by scripts/og-images.mjs from the
// prerendered /og/ and /en/og/ pages. Those pages are removed again: the card is a picture, not a
// page of the site.
type Site = 'company' | 'personal';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const LOCALES = ['nl', 'en'] as const;

/** The project under test: the build it runs against. */
const project = (): Site => test.info().project.name as Site;

/** The built folder of the project under test, as scripts/build-variant.mjs leaves it in e2e-out/. */
function builtDir(): string {
	const { basePath } = variantDefaults(project());
	return path.resolve('e2e-out', project(), basePath.replace(/^\//, ''));
}

function size(png: Buffer): { width: number; height: number } {
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test.describe('preview cards', () => {
	for (const locale of LOCALES) {
		test(`og/${locale}.png is a 1200 by 630 PNG under 1 MB`, async () => {
			const png = await readFile(path.join(builtDir(), 'og', `${locale}.png`));
			expect([...png.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
			expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
			expect(size(png)).toEqual({ width: 1200, height: 630 });
			expect(png.length).toBeLessThan(1024 * 1024);
		});
	}

	test('every language has a card; the company cards differ, the personal ones are the same', async () => {
		const [nl, en] = await Promise.all(
			LOCALES.map((locale) => readFile(path.join(builtDir(), 'og', `${locale}.png`)))
		);
		if (project() === 'company') {
			// The line under the logo is set in each language.
			expect(nl.equals(en)).toBe(false);
		} else {
			// Name, English tagline and address read the same in both languages, so the card does too.
			expect(nl.equals(en)).toBe(true);
		}
	});

	test('the card pages are gone from the build, only the pictures are left', async () => {
		const dir = builtDir();
		expect((await readdir(path.join(dir, 'og'))).sort()).toEqual(['en.png', 'nl.png']);
		await expect(stat(path.join(dir, 'en', 'og'))).rejects.toThrow(/ENOENT/);
		expect(await readdir(path.join(dir, 'en'))).toEqual(['index.html']);
	});

	test('/og/ and /en/og/ answer 404', async ({ request }) => {
		expect((await request.get('og/')).status()).toBe(404);
		expect((await request.get('en/og/')).status()).toBe(404);
	});

	for (const [locale, address] of [
		['nl', ''],
		['en', 'en/']
	] as const) {
		test(`the og:image of the ${locale} page is served as image/png`, async ({ page, request }) => {
			const { siteUrl, basePath } = variantDefaults(project());
			await page.goto(address);
			const image = await page.locator('meta[property="og:image"]').getAttribute('content');
			expect(image).toBe(`${siteUrl}/og/${locale}.png`);

			// The tag names the public address of the build; the test server has the same path.
			const response = await request.get(new URL(image!).pathname.slice(basePath.length + 1));
			expect(response.status()).toBe(200);
			expect(response.headers()['content-type']).toContain('image/png');
			expect(size(await response.body())).toEqual({ width: 1200, height: 630 });
		});
	}
});
