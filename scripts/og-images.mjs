// Makes the preview cards (Open Graph images) of a finished build: og/nl.png and og/en.png, 1200 by
// 630. The build prerenders the card as two pages, /og/ and /en/og/ (src/routes/og, OgCard.svelte).
// Chromium opens each one, waits for the card to say it is drawn, and screenshots it. Then the two
// pages go again, so on the live site /og/ answers 404 like any other address that does not exist.
//
// No server: the pages are handed to the browser from disk under the base path of the build
// (page.route), so a build needs no free port and no running site. Chromium has to be installed:
// `pnpm run setup` does it locally and the CI build job runs `playwright install --with-deps chromium`.
//
// Any failure throws, and build-variant.mjs lets it fail the build: a deploy then keeps the last
// good site instead of going out with preview cards that are missing or half drawn.
import { access, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

/** CSS px, the same as OG_WIDTH and OG_HEIGHT in src/lib/og.ts (this script is plain node). */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** The card sets this attribute on its root once the fonts are in and the board is drawn. */
const READY = '[data-og-ready]';

/** How long a card may take to get ready. It takes about a second; the rest is a slow machine. */
const READY_TIMEOUT_MS = 30_000;

/** The pages are never fetched from here: every request is answered by `fileForRequest`. */
const ORIGIN = 'http://localhost';

/** The card pages in the build and the pictures made of them, in the folder of the build. */
const CARDS = [
	{ page: 'og/', picture: 'og/nl.png' },
	{ page: 'en/og/', picture: 'og/en.png' }
];

/**
 * The file of the build a request path belongs to, or null for a path outside the base path or
 * outside the build folder.
 * @param {string} dir The output folder of a build, e.g. dist/company.
 * @param {string} base The base path of the build: '' or something like '/it-it.tech'.
 * @param {string} pathname The path of the request, as the URL has it.
 * @returns {string | null}
 */
export function fileForRequest(dir, base, pathname) {
	let decoded;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return null;
	}
	if (base !== '' && !decoded.startsWith(`${base}/`)) return null;
	const inside = decoded.slice(base.length);
	const file = path.resolve(dir, `.${inside.endsWith('/') ? `${inside}index.html` : inside}`);
	return file.startsWith(dir + path.sep) ? file : null;
}

/**
 * The size of a PNG, read from its IHDR chunk.
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number }}
 */
export function pngSize(buffer) {
	const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (buffer.length < 24 || signature.some((byte, i) => buffer[i] !== byte)) {
		throw new Error('The file is not a PNG');
	}
	return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * Removes the prerendered card pages (and anything else the prerender left in og/) and keeps the
 * pictures.
 * @param {string} dir The output folder of a build.
 */
export async function removeOgRoutes(dir) {
	const keep = new Set(CARDS.map((card) => path.basename(card.picture)));
	/** @type {string[]} */
	let names = [];
	try {
		names = await readdir(path.join(dir, 'og'));
	} catch {
		// no og folder: nothing to remove
	}
	for (const name of names) {
		if (!keep.has(name)) await rm(path.join(dir, 'og', name), { recursive: true, force: true });
	}
	await rm(path.join(dir, 'en', 'og'), { recursive: true, force: true });
}

/**
 * Screenshots the card pages of a build into og/nl.png and og/en.png and removes the pages.
 * @param {string} dir The output folder of a build, e.g. dist/company. Absolute.
 * @param {string} base The base path the build was made for: '' or something like '/it-it.tech'.
 */
export async function generateOgImages(dir, base) {
	const { chromium } = await import('playwright');
	let browser;
	try {
		browser = await chromium.launch();
	} catch (error) {
		throw new Error(
			'Cannot make the preview cards: Chromium did not start. Install it with ' +
				'"pnpm exec playwright install --with-deps chromium".',
			{ cause: error }
		);
	}

	try {
		const context = await browser.newContext({
			viewport: { width: OG_WIDTH, height: OG_HEIGHT },
			deviceScaleFactor: 1,
			reducedMotion: 'reduce'
		});
		await context.route(`${ORIGIN}/**`, async (route) => {
			const file = fileForRequest(dir, base, new URL(route.request().url()).pathname);
			let found = false;
			if (file) {
				try {
					await access(file);
					found = true;
				} catch {
					// answered with a 404 below
				}
			}
			if (file && found) await route.fulfill({ path: file });
			else await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
		});

		await mkdir(path.join(dir, 'og'), { recursive: true });
		for (const card of CARDS) {
			const page = await context.newPage();
			/** @type {string[]} */
			const problems = [];
			page.on('console', (message) => {
				if (message.type() === 'error') problems.push(message.text());
			});
			page.on('pageerror', (error) => problems.push(error.message));

			const url = `${ORIGIN}${base}/${card.page}`;
			try {
				await page.goto(url);
				await page.waitForSelector(READY, { timeout: READY_TIMEOUT_MS });
			} catch (error) {
				const detail = problems.length > 0 ? ` Page errors: ${problems.join(' | ')}` : '';
				throw new Error(
					`The preview card ${card.page} (${url}) was not ready after ${READY_TIMEOUT_MS / 1000} s. ` +
						`Is it in the prerender entries, and does the card throw?${detail}`,
					{ cause: error }
				);
			}
			await page
				.locator(READY)
				.screenshot({ path: path.join(dir, card.picture), type: 'png', animations: 'disabled' });
			await page.close();
		}
	} finally {
		await browser.close();
	}

	await removeOgRoutes(dir);

	for (const card of CARDS) {
		const { width, height } = pngSize(await readFile(path.join(dir, card.picture)));
		if (width !== OG_WIDTH || height !== OG_HEIGHT) {
			throw new Error(
				`${card.picture} is ${width}x${height}, expected ${OG_WIDTH}x${OG_HEIGHT}. Does the card have a fixed size?`
			);
		}
	}
	console.log(`Made ${CARDS.map((card) => card.picture).join(' and ')}`);
}
