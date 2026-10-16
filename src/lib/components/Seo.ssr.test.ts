import { afterEach, describe, expect, it, vi } from 'vitest';
import { company, companyBtw, companyKvk } from '#lib/content/company.js';
import { en } from '#lib/content/en.js';
import { nl } from '#lib/content/nl.js';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import { decodeEmail } from '#lib/email.js';
import Seo from './Seo.svelte';
import { EMAIL_PATTERN, headTags, jsonLdOf, linkTags, metaContent } from './seo-head.testkit.js';

// The variant is a build-time constant, so one file cannot hold both: this file runs the company
// build, Seo.personal.ssr.test.ts the personal one. The addresses are made up on purpose.
vi.mock('../site.js', () => ({
	site: 'company',
	siteUrl: 'https://it-it.example',
	PERSONAL_SITE_URL: 'https://deschepers.example/'
}));

const siteUrl = 'https://it-it.example';
const contents = { nl, en };

/** What the prerender writes into the head, which is all a crawler without JavaScript reads. */
function head(locale: Locale) {
	overwriteGetLocale(() => locale);
	return headTags(Seo);
}

afterEach(() => overwriteGetLocale(() => 'nl'));

describe.each(['nl', 'en'] as const)('company head, %s', (locale) => {
	const meta = contents[locale].meta.company;
	const url = locale === 'en' ? `${siteUrl}/en/` : `${siteUrl}/`;
	const tags = () => head(locale);

	it('writes the title and the description of the company', () => {
		const title = tags().filter((t) => t.tag === 'title');
		expect(title).toHaveLength(1);
		expect(title[0]!.text).toBe(meta.title);
		expect(metaContent(tags(), 'description')).toEqual([meta.description]);
	});

	it('writes exactly one canonical, on this site, for this language', () => {
		const canonical = linkTags(tags(), 'canonical');
		expect(canonical).toHaveLength(1);
		expect(canonical[0]!.attrs.href).toBe(url);
	});

	it('writes hreflang nl, en and x-default on this site', () => {
		const alternates = linkTags(tags(), 'alternate').map((t) => [t.attrs.hreflang, t.attrs.href]);
		expect(alternates).toEqual([
			['nl', `${siteUrl}/`],
			['en', `${siteUrl}/en/`],
			['x-default', `${siteUrl}/`]
		]);
	});

	it('writes the Open Graph tags of a website', () => {
		const t = tags();
		expect(metaContent(t, 'og:site_name')).toEqual(['I.T. It']);
		expect(metaContent(t, 'og:title')).toEqual([meta.title]);
		expect(metaContent(t, 'og:description')).toEqual([meta.description]);
		expect(metaContent(t, 'og:url')).toEqual([url]);
		expect(metaContent(t, 'og:type')).toEqual(['website']);
		expect(metaContent(t, 'og:locale')).toEqual([locale === 'en' ? 'en_US' : 'nl_NL']);
		expect(metaContent(t, 'og:locale:alternate')).toEqual([locale === 'en' ? 'nl_NL' : 'en_US']);
		expect(metaContent(t, 'profile:first_name')).toEqual([]);
	});

	it('points og:image at the absolute card of this language, with its size and alt text', () => {
		const t = tags();
		expect(metaContent(t, 'og:image')).toEqual([`${siteUrl}/og/${locale}.png`]);
		expect(metaContent(t, 'og:image:width')).toEqual(['1200']);
		expect(metaContent(t, 'og:image:height')).toEqual(['630']);
		expect(metaContent(t, 'og:image:type')).toEqual(['image/png']);
		expect(metaContent(t, 'og:image:alt')).toEqual([meta.ogImageAlt]);
	});

	it('writes the Twitter card, the image alt and the theme colour', () => {
		const t = tags();
		expect(metaContent(t, 'twitter:card')).toEqual(['summary_large_image']);
		expect(metaContent(t, 'twitter:image:alt')).toEqual([meta.ogImageAlt]);
		expect(metaContent(t, 'theme-color')).toEqual(['#001333']);
	});

	it('writes one JSON-LD script with the company graph', () => {
		const graph = jsonLdOf(tags())['@graph'];
		expect(graph.map((n) => n['@type']).sort()).toEqual([
			'Person',
			'ProfessionalService',
			'WebSite'
		]);
		const org = graph.find((n) => n['@type'] === 'ProfessionalService')!;
		expect(org.url).toBe(`${siteUrl}/`);
		expect(org.description).toBe(meta.description);
		expect(org.vatID).toBe(companyBtw);
		const person = graph.find((n) => n['@type'] === 'Person')!;
		expect(person['@id']).toBe('https://deschepers.example/#person');
		expect(org.founder).toEqual({ '@id': person['@id'] });
	});

	it('writes no email address, no mail link and no generator', () => {
		const t = tags();
		const everything = JSON.stringify(t);
		expect(everything).not.toMatch(EMAIL_PATTERN);
		expect(everything).not.toContain(decodeEmail());
		expect(everything.toLowerCase()).not.toContain(['mail', 'to'].join(''));
		expect(metaContent(t, 'generator')).toEqual([]);
		expect(everything).not.toMatch(/claude|anthropic/i);
	});

	it('keeps the KvK number only inside the JSON-LD', () => {
		const t = tags();
		const withoutLd = JSON.stringify(t.filter((x) => x.tag !== 'script'));
		expect(withoutLd).not.toContain(companyKvk);
		expect(withoutLd).not.toContain(companyBtw);
		expect(company.name).toBe('I.T. It');
	});
});
