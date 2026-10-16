import { describe, expect, it } from 'vitest';
import { company, companyBtw, companyCity, companyKvk } from './content/company.js';
import { en } from './content/en.js';
import { nl } from './content/nl.js';
import type { Locale, SiteContent } from './content/types.js';
import { decodeEmail } from './email.js';
import {
	alternates,
	jsonLdCompany,
	jsonLdPersonal,
	jsonLdScriptTag,
	OG_IMAGE,
	ogImageUrl,
	ogLocale,
	pageUrl,
	serializeJsonLd
} from './seo.js';

// Made-up addresses: the tests must not depend on the build they run in.
const companyUrl = 'https://it-it.example';
const personalUrl = 'https://deschepers.example/';
const personalSiteUrl = 'https://deschepers.example';

const contents: Record<Locale, SiteContent> = { nl, en };
const locales: Locale[] = ['nl', 'en'];

type Node = Record<string, unknown> & { '@id': string; '@type': string };

function graph(data: ReturnType<typeof jsonLdCompany>): Node[] {
	return data['@graph'] as Node[];
}

function nodeOfType(nodes: Node[], type: string): Node {
	const found = nodes.filter((n) => n['@type'] === type);
	expect(found, type).toHaveLength(1);
	return found[0]!;
}

/** Every string in a value that looks like an address. */
function urls(value: unknown): string[] {
	if (typeof value === 'string') return /^https?:\/\//.test(value) ? [value] : [];
	if (Array.isArray(value)) return value.flatMap(urls);
	if (value && typeof value === 'object') return Object.values(value).flatMap(urls);
	return [];
}

const companyGraph = (locale: Locale) =>
	jsonLdCompany({ siteUrl: companyUrl, personalUrl, locale, meta: contents[locale].meta.company });
const personalGraph = (locale: Locale) =>
	jsonLdPersonal({ siteUrl: personalSiteUrl, locale, meta: contents[locale].meta.personal });

describe('pageUrl', () => {
	it('is the site root for Dutch and /en/ for English', () => {
		expect(pageUrl(companyUrl, 'nl')).toBe('https://it-it.example/');
		expect(pageUrl(companyUrl, 'en')).toBe('https://it-it.example/en/');
	});

	it('keeps the base path of a github.io address', () => {
		expect(pageUrl('https://i-t-it.github.io/it-it.tech', 'en')).toBe(
			'https://i-t-it.github.io/it-it.tech/en/'
		);
	});
});

describe('ogImageUrl', () => {
	it('is absolute, per locale, with a stable name', () => {
		expect(ogImageUrl(companyUrl, 'nl')).toBe('https://it-it.example/og/nl.png');
		expect(ogImageUrl(companyUrl, 'en')).toBe('https://it-it.example/og/en.png');
	});

	it('says the size of the card', () => {
		expect(OG_IMAGE).toEqual({ width: 1200, height: 630, type: 'image/png' });
	});
});

describe('alternates', () => {
	it('lists nl, en and x-default, with x-default on the Dutch page', () => {
		expect(alternates(companyUrl)).toEqual([
			{ hreflang: 'nl', href: 'https://it-it.example/' },
			{ hreflang: 'en', href: 'https://it-it.example/en/' },
			{ hreflang: 'x-default', href: 'https://it-it.example/' }
		]);
	});

	it('stays on the given site url', () => {
		for (const { href } of alternates('https://x.example/base')) {
			expect(href.startsWith('https://x.example/base/')).toBe(true);
		}
	});
});

describe('ogLocale', () => {
	it('maps the locales to their Open Graph names', () => {
		expect(ogLocale).toEqual({ nl: 'nl_NL', en: 'en_US' });
	});
});

describe('jsonLdCompany', () => {
	for (const locale of locales) {
		describe(locale, () => {
			const data = companyGraph(locale);
			const nodes = graph(data);

			it('is one graph with a WebSite, a ProfessionalService and a Person', () => {
				expect(data['@context']).toBe('https://schema.org');
				expect(nodes.map((n) => n['@type']).sort()).toEqual([
					'Person',
					'ProfessionalService',
					'WebSite'
				]);
			});

			it('names the site and the company I.T. It, with the page description', () => {
				const site = nodeOfType(nodes, 'WebSite');
				const org = nodeOfType(nodes, 'ProfessionalService');
				expect(site['@id']).toBe(`${companyUrl}/#website`);
				expect(site.url).toBe(`${companyUrl}/`);
				expect(site.name).toBe('I.T. It');
				expect(site.publisher).toEqual({ '@id': org['@id'] });
				expect(org['@id']).toBe(`${companyUrl}/#org`);
				expect(org.name).toBe('I.T. It');
				expect(org.url).toBe(`${companyUrl}/`);
				expect(org.description).toBe(contents[locale].meta.company.description);
			});

			it('gives the company a logo and the card as its image', () => {
				const org = nodeOfType(nodes, 'ProfessionalService');
				expect(org.logo).toBe(`${companyUrl}/icons/company/apple-touch-icon.png`);
				expect(org.image).toBe(ogImageUrl(companyUrl, locale));
			});

			it('ties the founder to the Person, which carries the id of the personal site', () => {
				const org = nodeOfType(nodes, 'ProfessionalService');
				const person = nodeOfType(nodes, 'Person');
				expect(person['@id']).toBe(`${personalUrl}#person`);
				expect(org.founder).toEqual({ '@id': person['@id'] });
			});

			it('names the person with every name he goes by, and the pages that are him', () => {
				const person = nodeOfType(nodes, 'Person');
				expect(person.name).toBe('Robbin Schepers');
				expect(person.givenName).toBe('Robbin');
				expect(person.familyName).toBe('Schepers');
				expect(person.alternateName).toEqual([company.displayName, 'Roboroads']);
				expect(person.url).toBe(personalUrl);
				expect(person.sameAs).toEqual([company.linkedin, company.github, personalUrl]);
			});

			it('carries the VAT number and the KvK number', () => {
				const org = nodeOfType(nodes, 'ProfessionalService');
				expect(org.vatID).toBe(companyBtw);
				expect(org.identifier).toEqual({
					'@type': 'PropertyValue',
					propertyID: 'KvK',
					value: companyKvk
				});
			});

			it('has no address, area served, email or employer anywhere', () => {
				const json = serializeJsonLd(data);
				for (const key of ['address', 'areaServed', 'email', 'telephone', 'worksFor']) {
					expect(json, key).not.toContain(`"${key}"`);
				}
				expect(json).not.toContain(companyCity);
				expect(json).not.toContain(decodeEmail());
				expect(json).not.toContain(['mail', 'to'].join(''));
			});

			it('puts every address of the company on its own site, except the person and the profiles', () => {
				const profiles: string[] = [company.linkedin, company.github];
				const outside = urls(nodes).filter((u) => !u.startsWith(companyUrl));
				for (const u of outside) {
					expect(profiles.includes(u) || u.startsWith(personalUrl), u).toBe(true);
				}
			});
		});
	}

	it('uses the language of the page for the description', () => {
		const description = (locale: Locale) =>
			nodeOfType(graph(companyGraph(locale)), 'ProfessionalService').description;
		expect(description('nl')).toBe(nl.meta.company.description);
		expect(description('en')).toBe(en.meta.company.description);
		expect(description('nl')).not.toBe(description('en'));
	});
});

describe('jsonLdPersonal', () => {
	for (const locale of locales) {
		describe(locale, () => {
			const data = personalGraph(locale);
			const nodes = graph(data);

			it('is one graph with a WebSite, a ProfilePage and a Person', () => {
				expect(data['@context']).toBe('https://schema.org');
				expect(nodes.map((n) => n['@type']).sort()).toEqual(['Person', 'ProfilePage', 'WebSite']);
			});

			it('names the site after the person, with both of his names', () => {
				const site = nodeOfType(nodes, 'WebSite');
				expect(site['@id']).toBe(`${personalSiteUrl}/#website`);
				expect(site.url).toBe(`${personalSiteUrl}/`);
				expect(site.name).toBe('Robbin Schepers');
				expect(site.alternateName).toEqual([company.displayName, 'Roboroads']);
			});

			it('makes the page a profile page of the Person', () => {
				const page = nodeOfType(nodes, 'ProfilePage');
				const person = nodeOfType(nodes, 'Person');
				const meta = contents[locale].meta.personal;
				expect(page['@id']).toBe(`${pageUrl(personalSiteUrl, locale)}#profilepage`);
				expect(page.url).toBe(pageUrl(personalSiteUrl, locale));
				expect(page.name).toBe(meta.title);
				expect(page.inLanguage).toBe(locale);
				expect(page.mainEntity).toEqual({ '@id': person['@id'] });
			});

			it('gives the Person the same id as the company graph does', () => {
				const person = nodeOfType(nodes, 'Person');
				const fromCompany = nodeOfType(graph(companyGraph(locale)), 'Person');
				expect(person['@id']).toBe(`${personalSiteUrl}/#person`);
				expect(person['@id']).toBe(fromCompany['@id']);
			});

			it('describes the Person and points at the card and the profiles', () => {
				const person = nodeOfType(nodes, 'Person');
				expect(person.name).toBe('Robbin Schepers');
				expect(person.givenName).toBe('Robbin');
				expect(person.familyName).toBe('Schepers');
				expect(person.alternateName).toEqual([company.displayName, 'Roboroads']);
				expect(person.description).toBe(contents[locale].meta.personal.description);
				expect(person.image).toBe(ogImageUrl(personalSiteUrl, locale));
				expect(person.sameAs).toEqual([company.linkedin, company.github]);
			});

			it('has no company node, no employer and no company details', () => {
				const json = serializeJsonLd(data);
				for (const type of ['Organization', 'ProfessionalService', 'LocalBusiness']) {
					expect(nodes.some((n) => n['@type'] === type)).toBe(false);
				}
				expect(nodes.some((n) => n.name === 'I.T. It')).toBe(false);
				for (const detail of [companyKvk, companyBtw, companyCity, 'vatID', 'KvK', 'worksFor']) {
					expect(json, detail).not.toContain(detail);
				}
			});

			it('has no address, area served or email', () => {
				const json = serializeJsonLd(data);
				for (const key of ['address', 'areaServed', 'email', 'telephone']) {
					expect(json, key).not.toContain(`"${key}"`);
				}
				expect(json).not.toContain(decodeEmail());
				expect(json).not.toContain(['mail', 'to'].join(''));
			});

			it('puts every address on its own site, except the two profiles', () => {
				const outside = urls(nodes).filter((u) => !u.startsWith(personalSiteUrl));
				expect(outside.sort()).toEqual([company.github, company.linkedin].sort());
			});
		});
	}
});

describe('serializeJsonLd', () => {
	it('is valid JSON that reads back to the same data', () => {
		const data = personalGraph('nl');
		expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
	});

	it('escapes every "<" so a value cannot close the script element', () => {
		const out = serializeJsonLd({
			'@context': 'https://schema.org',
			name: '</script><b>x</b><!--'
		});
		expect(out).not.toContain('<');
		expect(out).toContain('\\u003c/script>');
		expect(JSON.parse(out).name).toBe('</script><b>x</b><!--');
	});

	it('wraps the text in one ld+json script element that nothing inside can close', () => {
		const tag = jsonLdScriptTag({ name: '</script><script>alert(1)</script>' });
		expect(tag.startsWith('<script type="application/ld+json">')).toBe(true);
		expect(tag.endsWith('</script>')).toBe(true);
		expect(tag.match(/<\/script>/g)).toHaveLength(1);
		expect(tag.match(/<script/g)).toHaveLength(1);
	});

	it('leaves a built graph without a raw "<"', () => {
		expect(serializeJsonLd(companyGraph('en'))).not.toContain('<');
		expect(serializeJsonLd(personalGraph('en'))).not.toContain('<');
	});
});
