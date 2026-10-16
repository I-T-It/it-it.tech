import { describe, expect, it } from 'vitest';
import { pageUrls, robotsTxt, sitemapXml, xmlEscape } from './crawl.js';

const siteUrl = 'https://example.test/base';

/** Every opening and closing tag pairs up, in order. Enough to prove the sitemap is well-formed. */
function expectBalancedTags(xml: string): void {
	const body = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
	const stack: string[] = [];
	for (const [, closing, name, selfClosing] of body.matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
		if (selfClosing) continue;
		if (closing) expect(stack.pop()).toBe(name);
		else stack.push(name);
	}
	expect(stack).toEqual([]);
}

describe('pageUrls', () => {
	it('lists the Dutch and the English home page on the site url', () => {
		expect(pageUrls(siteUrl)).toEqual({
			nl: 'https://example.test/base/',
			en: 'https://example.test/base/en/'
		});
	});

	it('works for a site on a bare domain', () => {
		expect(pageUrls('https://example.test')).toEqual({
			nl: 'https://example.test/',
			en: 'https://example.test/en/'
		});
	});
});

describe('robotsTxt', () => {
	const lines = robotsTxt(siteUrl).split('\n');

	it('allows every crawler', () => {
		expect(lines).toContain('User-agent: *');
		expect(lines).toContain('Allow: /');
		expect(lines.some((line) => /^disallow/i.test(line))).toBe(false);
	});

	it('names the sitemap of this site, once', () => {
		expect(lines.filter((line) => line.startsWith('Sitemap:'))).toEqual([
			'Sitemap: https://example.test/base/sitemap.xml'
		]);
	});

	it('ends with a newline and has no blank first line', () => {
		expect(robotsTxt(siteUrl).endsWith('\n')).toBe(true);
		expect(lines[0]).toBe('User-agent: *');
	});
});

describe('xmlEscape', () => {
	it('escapes the five XML characters', () => {
		expect(xmlEscape(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
	});
});

describe('sitemapXml', () => {
	const xml = sitemapXml(siteUrl);

	it('is well-formed XML with the sitemap and xhtml namespaces', () => {
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
		expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
		expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
		expectBalancedTags(xml);
	});

	it('lists the two home pages and nothing else', () => {
		const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
		expect(locs).toEqual(['https://example.test/base/', 'https://example.test/base/en/']);
	});

	it('gives each page three alternates: nl, en and x-default pointing at nl', () => {
		const links = [
			...xml.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)
		];
		expect(links).toHaveLength(6);
		for (const block of xml.split('<url>').slice(1)) {
			const own = [
				...block.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)
			].map((match) => [match[1], match[2]]);
			expect(own).toEqual([
				['nl', 'https://example.test/base/'],
				['en', 'https://example.test/base/en/'],
				['x-default', 'https://example.test/base/']
			]);
		}
	});

	it('keeps every url on the site url', () => {
		const urls = [...xml.matchAll(/(?:<loc>|href=")(https?:[^<"]*)/g)].map((match) => match[1]);
		expect(urls).toHaveLength(8);
		for (const url of urls) expect(url.startsWith(`${siteUrl}/`)).toBe(true);
	});

	it('has no lastmod', () => {
		expect(xml).not.toContain('lastmod');
	});

	it('escapes the urls', () => {
		const escaped = sitemapXml('https://example.test/a&b');
		expect(escaped).toContain('<loc>https://example.test/a&amp;b/</loc>');
		expect(escaped).not.toMatch(/&(?!amp;)/);
		expectBalancedTags(escaped);
	});
});
