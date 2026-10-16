import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileForRequest, pngSize, removeOgRoutes } from '../../scripts/og-images.mjs';
import { titleLine } from './og.js';

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'og-images-'));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

async function put(file: string, content: string | Buffer = file): Promise<void> {
	await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
	await writeFile(path.join(dir, file), content);
}

describe('fileForRequest', () => {
	it('maps a path under the base path to a file of the build', () => {
		expect(fileForRequest(dir, '/it-it.tech', '/it-it.tech/og/')).toBe(
			path.join(dir, 'og', 'index.html')
		);
		expect(fileForRequest(dir, '/it-it.tech', '/it-it.tech/en/og/')).toBe(
			path.join(dir, 'en', 'og', 'index.html')
		);
		expect(fileForRequest(dir, '/it-it.tech', '/it-it.tech/_app/immutable/entry/start.js')).toBe(
			path.join(dir, '_app', 'immutable', 'entry', 'start.js')
		);
	});

	it('serves from the root when the base path is empty', () => {
		expect(fileForRequest(dir, '', '/og/')).toBe(path.join(dir, 'og', 'index.html'));
		expect(fileForRequest(dir, '', '/icons/personal/favicon.svg')).toBe(
			path.join(dir, 'icons', 'personal', 'favicon.svg')
		);
	});

	it('knows nothing outside the base path', () => {
		expect(fileForRequest(dir, '/it-it.tech', '/favicon.ico')).toBeNull();
		expect(fileForRequest(dir, '/it-it.tech', '/it-it.techno/og/')).toBeNull();
		expect(fileForRequest(dir, '/it-it.tech', '/it-it.tech')).toBeNull();
	});

	it('never leaves the build folder', () => {
		expect(fileForRequest(dir, '/it-it.tech', '/it-it.tech/../secret')).toBeNull();
		expect(fileForRequest(dir, '', '/%2e%2e/secret')).toBeNull();
		expect(fileForRequest(dir, '', '/a/../../secret')).toBeNull();
	});
});

describe('pngSize', () => {
	function png(width: number, height: number): Buffer {
		const buffer = Buffer.alloc(33);
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer);
		buffer.write('IHDR', 12, 'ascii');
		buffer.writeUInt32BE(width, 16);
		buffer.writeUInt32BE(height, 20);
		return buffer;
	}

	it('reads the size from the IHDR chunk', () => {
		expect(pngSize(png(1200, 630))).toEqual({ width: 1200, height: 630 });
	});

	it('refuses what is not a PNG', () => {
		expect(() => pngSize(Buffer.from('<html></html>'))).toThrow(/not a PNG/);
		expect(() => pngSize(Buffer.alloc(0))).toThrow(/not a PNG/);
	});
});

describe('removeOgRoutes', () => {
	it('removes the prerendered card pages and keeps the pictures', async () => {
		await put('index.html');
		await put('en/index.html');
		await put('og/index.html');
		await put('og/nl.png');
		await put('og/en.png');
		await put('en/og/index.html');

		await removeOgRoutes(dir);

		expect((await readdir(path.join(dir, 'og'))).sort()).toEqual(['en.png', 'nl.png']);
		expect(await readdir(path.join(dir, 'en'))).toEqual(['index.html']);
		expect(await readdir(dir).then((names) => names.sort())).toEqual(['en', 'index.html', 'og']);
	});

	it('removes whatever else the prerender left next to the card page', async () => {
		await put('og/index.html');
		await put('og/__data.json');
		await put('og/nl.png');
		await put('og/en.png');

		await removeOgRoutes(dir);

		expect((await readdir(path.join(dir, 'og'))).sort()).toEqual(['en.png', 'nl.png']);
	});

	it('needs no English folder', async () => {
		await put('og/index.html');
		await expect(removeOgRoutes(dir)).resolves.toBeUndefined();
	});
});

describe('titleLine', () => {
	it('is what follows the name in a title', () => {
		expect(titleLine('I.T. It - Voor alles met stekkers')).toBe('Voor alles met stekkers');
		expect(titleLine('I.T. It - For everything with a plug')).toBe('For everything with a plug');
	});

	it('is the whole title when there is no name in front of it', () => {
		expect(titleLine('Pagina niet gevonden')).toBe('Pagina niet gevonden');
	});

	it('cuts at the first separator only', () => {
		expect(titleLine('A - B - C')).toBe('B - C');
	});
});
