import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promoteNotFound } from '../../scripts/not-found.mjs';

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'promote-not-found-'));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

async function put(file: string, text: string): Promise<void> {
	await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
	await writeFile(path.join(dir, file), text);
}

describe('promoteNotFound', () => {
	it('moves the prerendered not-found page to 404.html and removes its folders', async () => {
		await put('index.html', 'home');
		await put('en/index.html', 'home en');
		await put('not-found/index.html', 'not found');
		await put('en/not-found/index.html', 'not found en');

		await promoteNotFound(dir);

		expect(await readFile(path.join(dir, '404.html'), 'utf8')).toBe('not found');
		expect((await readdir(dir)).sort()).toEqual(['404.html', 'en', 'index.html']);
		expect(await readdir(path.join(dir, 'en'))).toEqual(['index.html']);
		expect(await readFile(path.join(dir, 'index.html'), 'utf8')).toBe('home');
	});

	it('replaces a 404.html that is already there', async () => {
		await put('404.html', 'the old fallback');
		await put('not-found/index.html', 'not found');

		await promoteNotFound(dir);

		expect(await readFile(path.join(dir, '404.html'), 'utf8')).toBe('not found');
	});

	it('needs no English folder', async () => {
		await put('not-found/index.html', 'not found');
		await expect(promoteNotFound(dir)).resolves.toBeUndefined();
	});

	it('fails the build when the page was not prerendered', async () => {
		await put('index.html', 'home');
		await expect(promoteNotFound(dir)).rejects.toThrow(/not-found\/index\.html/);
		// Nothing was written: the build stops instead of shipping a site without a 404.
		expect(await readdir(dir)).toEqual(['index.html']);
	});
});
