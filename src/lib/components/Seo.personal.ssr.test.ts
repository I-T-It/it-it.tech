import { afterEach, describe, expect, it, vi } from 'vitest';
import { companyBtw, companyCity, companyKvk } from '#lib/content/company.js';
import { en } from '#lib/content/en.js';
import { nl } from '#lib/content/nl.js';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import { decodeEmail } from '#lib/email.js';
import Seo from './Seo.svelte';
import { EMAIL_PATTERN, headTags, jsonLdOf, linkTags, metaContent } from './seo-head.testkit.js';

// The variant is a build-time constant: this file runs the personal build. The company build is
// covered in Seo.ssr.test.ts. The addresses are made up on purpose.
vi.mock('../site.js', () => ({
	site: 'personal',
	siteUrl: 'https://deschepers.example',
	PERSONAL_SITE_URL: 'https://deschepers.example/'
}));

const siteUrl = 'https://deschepers.example';
const contents = { nl, en };

function head(locale: Locale) {
	overwriteGetLocale(() => locale);
	return headTags(Seo);
}

afterEach(() => overwriteGetLocale(() => 'nl'));

describe.each(['nl', 'en'] as const)('personal head, %s', (locale) => {
	const meta = contents[locale].meta.personal;
	const url = locale === 'en' ? `${siteUrl}/en/` : `${siteUrl}/`;
	const tags = () => head(locale);

	it('writes the title and the description of the person', () => {
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

	it('writes the Open Graph tags of a profile', () => {
		const t = tags();
		expect(metaContent(t, 'og:site_name')).toEqual(['Robbin Schepers']);
		expect(metaContent(t, 'og:title')).toEqual([meta.title]);
		expect(metaContent(t, 'og:description')).toEqual([meta.description]);
		expect(metaContent(t, 'og:url')).toEqual([url]);
		expect(metaContent(t, 'og:type')).toEqual(['profile']);
		expect(metaContent(t, 'profile:first_name')).toEqual(['Robbin']);
		expect(metaContent(t, 'profile:last_name')).toEqual(['Schepers']);
		expect(metaContent(t, 'profile:username')).toEqual(['Roboroads']);
		expect(metaContent(t, 'og:locale')).toEqual([locale === 'en' ? 'en_US' : 'nl_NL']);
		expect(metaContent(t, 'og:locale:alternate')).toEqual([locale === 'en' ? 'nl_NL' : 'en_US']);
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

	it('writes one JSON-LD script with the profile page, and no company node', () => {
		const graph = jsonLdOf(tags())['@graph'];
		expect(graph.map((n) => n['@type']).sort()).toEqual(['Person', 'ProfilePage', 'WebSite']);
		const page = graph.find((n) => n['@type'] === 'ProfilePage')!;
		expect(page.url).toBe(url);
		const person = graph.find((n) => n['@type'] === 'Person')!;
		expect(person['@id']).toBe(`${siteUrl}/#person`);
		expect(page.mainEntity).toEqual({ '@id': person['@id'] });
	});

	it('writes no company details, no email address and no generator', () => {
		const t = tags();
		const everything = JSON.stringify(t);
		for (const detail of [companyKvk, companyBtw, companyCity, 'vatID']) {
			expect(everything, detail).not.toContain(detail);
		}
		expect(everything).not.toMatch(EMAIL_PATTERN);
		expect(everything).not.toContain(decodeEmail());
		expect(everything.toLowerCase()).not.toContain(['mail', 'to'].join(''));
		expect(metaContent(t, 'generator')).toEqual([]);
		expect(everything).not.toMatch(/claude|anthropic/i);
	});
});
