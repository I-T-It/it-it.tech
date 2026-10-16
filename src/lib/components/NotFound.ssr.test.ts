import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import { overwriteGetLocale } from '#lib/paraglide/runtime.js';
import NotFound from './NotFound.svelte';

// The compiled Paraglide runtime carries the base path of this run (BASE_PATH, empty by default).
const base = process.env.BASE_PATH ?? '';

/** What the prerender writes, which is all a visitor without JavaScript ever gets. */
function prerender(): string {
	return render(NotFound).body;
}

afterEach(() => overwriteGetLocale(() => 'nl'));

describe('NotFound prerender', () => {
	const html = prerender();

	it('is the main landmark the skip link goes to', () => {
		expect(html.match(/<main/g)).toHaveLength(1);
		expect(html).toMatch(/<main[^>]*\bid="main"/);
		expect(html).toMatch(/<main[^>]*\btabindex="-1"/);
	});

	it('has one h1 that says it in both languages', () => {
		expect(html.match(/<h1/g)).toHaveLength(1);
		const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';
		expect(h1).toMatch(/<span lang="nl">Pagina niet gevonden<\/span>/);
		expect(h1).toMatch(/<span lang="en">Page not found<\/span>/);
	});

	it('marks the English text as English and the Dutch text as Dutch', () => {
		expect(html).toMatch(/<p[^>]*\blang="en"[^>]*>This address does not exist on this site/);
		expect(html).toMatch(/<p[^>]*\blang="nl"[^>]*>Dit adres bestaat niet op deze site/);
	});

	it('is titled in both languages and kept out of search results', () => {
		const { head } = render(NotFound);
		expect(head).toContain('<title>Pagina niet gevonden / Page not found</title>');
		expect(head).toContain('<meta name="robots" content="noindex"');
	});

	it('links to both home pages, with a full page load and the language they lead to', () => {
		const links = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((match) => match[0]);
		expect(links).toHaveLength(2);

		const [nl, en] = links;
		expect(nl).toContain(`href="${base}/"`);
		expect(nl).toContain('hreflang="nl"');
		expect(nl).toContain('lang="nl"');
		expect(nl).toContain('data-sveltekit-reload');
		expect(nl).toContain('Naar de startpagina in het Nederlands');

		expect(en).toContain(`href="${base}/en/"`);
		expect(en).toContain('hreflang="en"');
		expect(en).toContain('lang="en"');
		expect(en).toContain('data-sveltekit-reload');
		expect(en).toContain('Go to the home page in English');
	});

	it('hides the decorative error code from screen readers', () => {
		expect(html).toMatch(/<[^>]*aria-hidden="true"[^>]*>404</);
	});

	// The same file is served at every unknown address, /en/ ones included. The page must not
	// change with the locale it is rendered in, or the browser would hydrate it into something else.
	it('writes the same page whatever the locale is', () => {
		overwriteGetLocale(() => 'en');
		expect(prerender()).toBe(html);
	});
});
