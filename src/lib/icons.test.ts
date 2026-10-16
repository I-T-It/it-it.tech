import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { pruneVariantIcons } from '../../scripts/variant-icons.mjs';

const icons = fileURLToPath(new URL('../../static/icons/', import.meta.url));
const read = (site: string, file: string) => readFile(path.join(icons, site, file));

/** Width and height from the IHDR chunk of a PNG. */
function pngSize(png: Buffer): [number, number] {
	expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
	return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

/** The sizes in the directory of an ICO file. A width or height of 0 means 256. */
function icoSizes(ico: Buffer): [number, number][] {
	expect(ico.readUInt16LE(0)).toBe(0);
	expect(ico.readUInt16LE(2)).toBe(1);
	const count = ico.readUInt16LE(4);
	return Array.from({ length: count }, (_, i) => {
		const at = 6 + i * 16;
		return [ico[at] || 256, ico[at + 1] || 256];
	});
}

describe('the icon sets', () => {
	for (const site of ['company', 'personal']) {
		it(`has an ico, an svg and an apple touch icon for ${site}`, async () => {
			for (const file of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png']) {
				expect((await stat(path.join(icons, site, file))).size, `${site}/${file}`).toBeGreaterThan(
					100
				);
			}
			expect(icoSizes(await read(site, 'favicon.ico')).length).toBeGreaterThanOrEqual(2);
			expect(pngSize(await read(site, 'apple-touch-icon.png'))).toEqual([180, 180]);
		});
	}

	it('gives the personal build its own icons, not the I.T. It ones', async () => {
		for (const file of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png']) {
			const company = await read('company', file);
			const personal = await read('personal', file);
			expect(personal.equals(company), file).toBe(false);
		}
		// The company icons stay the logo: its cyan trace is in the SVG, the hat has none of it.
		expect((await read('company', 'favicon.svg')).toString()).toContain('#00e7ff');
		expect((await read('personal', 'favicon.svg')).toString()).not.toContain('#00e7ff');
	});

	it('draws the personal favicon as a 16 pixel grid hat, in the brand greens, on nothing', async () => {
		const svg = (await read('personal', 'favicon.svg')).toString();
		expect(svg).toContain('viewBox="0 0 16 16"');
		expect(svg).toContain('shape-rendering="crispEdges"');
		// Plain rectangles only: no embedded photo, no gradient, no blur.
		expect(svg).not.toMatch(/<image|<linearGradient|<radialGradient|<filter|<circle|<path/);
		expect(svg).not.toContain('data:');
		const fills = new Set(Array.from(svg.matchAll(/fill="(#[0-9a-f]{6})"/g), (m) => m[1]));
		expect(fills).toContain('#3fd83f');
		expect(fills.size).toBeGreaterThanOrEqual(4);
		expect(fills.size).toBeLessThanOrEqual(8);
		// Every colour is a green or the dark outline (red is always the smallest channel).
		for (const fill of fills) {
			const [r, g, b] = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
			expect(g, fill).toBeGreaterThan(r);
			expect(g, fill).toBeGreaterThanOrEqual(b);
		}
		// No background rectangle covering the grid.
		expect(svg).not.toMatch(/width="16" height="16"/);
	});

	it('has the 16 and the 32 pixel favicon in the personal ico, and the 180 pixel touch icon', async () => {
		expect(icoSizes(await read('personal', 'favicon.ico'))).toEqual([
			[16, 16],
			[32, 32]
		]);
		expect(pngSize(await read('personal', 'apple-touch-icon.png'))).toEqual([180, 180]);
	});
});

describe('pruneVariantIcons', () => {
	let dir: string;

	async function build() {
		dir = await mkdtemp(path.join(tmpdir(), 'icons-build-'));
		await cp(icons, path.join(dir, 'icons'), { recursive: true });
		await writeFile(path.join(dir, 'index.html'), '<html></html>');
		await writeFile(path.join(dir, '.nojekyll'), '');
	}

	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	it('keeps only the icons of the personal build, and answers /favicon.ico with its own', async () => {
		await build();
		await pruneVariantIcons(dir, 'personal');
		await expect(stat(path.join(dir, 'icons', 'company'))).rejects.toThrow();
		expect((await stat(path.join(dir, 'icons', 'personal', 'favicon.svg'))).isFile()).toBe(true);
		const root = await readFile(path.join(dir, 'favicon.ico'));
		expect(root.equals(await read('personal', 'favicon.ico'))).toBe(true);
	});

	it('keeps only the icons of the company build, and answers /favicon.ico with its own', async () => {
		await build();
		await pruneVariantIcons(dir, 'company');
		await expect(stat(path.join(dir, 'icons', 'personal'))).rejects.toThrow();
		expect((await stat(path.join(dir, 'icons', 'company', 'apple-touch-icon.png'))).isFile()).toBe(
			true
		);
		const root = await readFile(path.join(dir, 'favicon.ico'));
		expect(root.equals(await read('company', 'favicon.ico'))).toBe(true);
	});

	it('leaves the rest of the build alone and can run twice', async () => {
		await build();
		await pruneVariantIcons(dir, 'personal');
		await pruneVariantIcons(dir, 'personal');
		expect((await stat(path.join(dir, 'index.html'))).isFile()).toBe(true);
		expect((await stat(path.join(dir, '.nojekyll'))).isFile()).toBe(true);
	});

	it('fails loudly when the icons of the build are missing', async () => {
		dir = await mkdtemp(path.join(tmpdir(), 'icons-build-'));
		await mkdir(path.join(dir, 'icons', 'company'), { recursive: true });
		await expect(pruneVariantIcons(dir, 'personal')).rejects.toThrow();
	});
});
