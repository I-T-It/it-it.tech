import { describe, expect, it } from 'vitest';
import type { Reroute } from '@sveltejs/kit/hooks';
import { reroute } from './hooks.js';

// The compiled Paraglide runtime carries the base path of this run (BASE_PATH, empty by default).
const base = process.env.BASE_PATH ?? '';

async function rerouted(path: string): Promise<string | void> {
	const url = new URL(`http://localhost:5173${base}${path}`);
	const event: Parameters<Reroute>[0] = { url, fetch };
	return reroute(event);
}

describe('reroute', () => {
	it('maps the English pages onto the Dutch routes', async () => {
		expect(await rerouted('/')).toBe(`${base}/`);
		expect(await rerouted('/en/')).toBe(`${base}/`);
		expect(await rerouted('/en')).toBe(`${base}/`);
	});

	it('keeps the trailing slash on page paths', async () => {
		expect(await rerouted('/en/cv/')).toBe(`${base}/cv/`);
		expect(await rerouted('/cv/')).toBe(`${base}/cv/`);
	});

	// Paraglide's trailingSlash: 'always' turns /_app/env.js into /_app/env.js/. SvelteKit then no
	// longer recognises it, `pnpm dev` answers 404 and the page never hydrates.
	it('leaves SvelteKit internals and static files without a trailing slash', async () => {
		expect(await rerouted('/_app/env.js')).toBe(`${base}/_app/env.js`);
		expect(await rerouted('/_app/immutable/entry/start.js')).toBe(
			`${base}/_app/immutable/entry/start.js`
		);
		expect(await rerouted('/favicon.svg')).toBe(`${base}/favicon.svg`);
	});
});
