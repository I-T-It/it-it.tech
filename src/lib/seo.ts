/**
 * What the head of the page says to search engines and link previews: the addresses and the
 * structured data. Pure functions that take the site url and the page meta, so a test can feed them
 * any address. Seo.svelte passes the real ones.
 *
 * Neither graph holds an email address, a street address or an employer. The company graph holds
 * the VAT and KvK numbers and is only called behind `site === 'company'`: the build then drops
 * `jsonLdCompany` from the personal bundle together with the numbers it reads.
 */
import { company, companyBtw, companyKvk } from './content/company.js';
import type { Locale, PageMeta } from './content/types.js';

/** The generated card per locale (og/nl.png, og/en.png). */
export const OG_IMAGE = { width: 1200, height: 630, type: 'image/png' } as const;

export const ogLocale: Record<Locale, string> = { nl: 'nl_NL', en: 'en_US' };

export const THEME_COLOR = '#001333';

/** The address of the Dutch or English page. `siteUrl` has no trailing slash. */
export function pageUrl(siteUrl: string, locale: Locale): string {
	return locale === 'en' ? `${siteUrl}/en/` : `${siteUrl}/`;
}

/** The card of a locale, as an absolute address. */
export function ogImageUrl(siteUrl: string, locale: Locale): string {
	return `${siteUrl}/og/${locale}.png`;
}

export interface Alternate {
	hreflang: Locale | 'x-default';
	href: string;
}

/** The hreflang links: both pages, and the Dutch one as the default. All on the same site. */
export function alternates(siteUrl: string): Alternate[] {
	return [
		{ hreflang: 'nl', href: pageUrl(siteUrl, 'nl') },
		{ hreflang: 'en', href: pageUrl(siteUrl, 'en') },
		{ hreflang: 'x-default', href: pageUrl(siteUrl, 'nl') }
	];
}

export interface JsonLd {
	'@context': 'https://schema.org';
	'@graph': Record<string, unknown>[];
}

export interface PersonalJsonLdInput {
	/** Origin plus base path of the personal site, without a trailing slash. */
	siteUrl: string;
	locale: Locale;
	meta: PageMeta;
}

export interface CompanyJsonLdInput {
	/** Origin plus base path of the company site, without a trailing slash. */
	siteUrl: string;
	/** Where the personal site lives, with a trailing slash. */
	personalUrl: string;
	locale: Locale;
	meta: PageMeta;
}

/** The names he goes by, the same on both sites. */
const names = {
	name: company.founder,
	givenName: company.givenName,
	familyName: company.familyName,
	alternateName: [company.displayName, company.nickname]
};

/** The id of the Person. The company graph builds the same one from the personal site's address. */
const personId = (personalUrl: string) => `${personalUrl}#person`;

/** The graph of the company site: the site, I.T. It, and Robbin as its founder. */
export function jsonLdCompany({ siteUrl, personalUrl, locale, meta }: CompanyJsonLdInput): JsonLd {
	const home = `${siteUrl}/`;
	const orgId = `${siteUrl}/#org`;
	const personRef = personId(personalUrl);
	return {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				'@id': `${siteUrl}/#website`,
				url: home,
				name: company.name,
				inLanguage: ['nl', 'en'],
				publisher: { '@id': orgId }
			},
			{
				'@type': 'ProfessionalService',
				'@id': orgId,
				name: company.name,
				url: home,
				description: meta.description,
				logo: `${siteUrl}/icons/company/apple-touch-icon.png`,
				image: ogImageUrl(siteUrl, locale),
				founder: { '@id': personRef },
				vatID: companyBtw,
				identifier: { '@type': 'PropertyValue', propertyID: 'KvK', value: companyKvk }
			},
			{
				'@type': 'Person',
				'@id': personRef,
				...names,
				url: personalUrl,
				sameAs: [company.linkedin, company.github, personalUrl]
			}
		]
	};
}

/** The graph of the personal site: the site, the page as a profile page, and the Person. */
export function jsonLdPersonal({ siteUrl, locale, meta }: PersonalJsonLdInput): JsonLd {
	const home = `${siteUrl}/`;
	const url = pageUrl(siteUrl, locale);
	const personRef = personId(home);
	return {
		'@context': 'https://schema.org',
		'@graph': [
			{
				'@type': 'WebSite',
				'@id': `${siteUrl}/#website`,
				url: home,
				name: names.name,
				alternateName: names.alternateName,
				inLanguage: ['nl', 'en']
			},
			{
				'@type': 'ProfilePage',
				'@id': `${url}#profilepage`,
				url,
				name: meta.title,
				inLanguage: locale,
				isPartOf: { '@id': `${siteUrl}/#website` },
				mainEntity: { '@id': personRef }
			},
			{
				'@type': 'Person',
				'@id': personRef,
				...names,
				url: home,
				description: meta.description,
				image: ogImageUrl(siteUrl, locale),
				sameAs: [company.linkedin, company.github]
			}
		]
	};
}

/**
 * JSON for a `<script type="application/ld+json">`. Every "<" becomes <, so no value can
 * close the element or open a comment. The text reads back to the same data.
 */
export function serializeJsonLd(data: unknown): string {
	return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * The whole `<script type="application/ld+json">` element, for `{@html}` in a `<svelte:head>`.
 * It is built here because a .svelte file cannot hold the closing tag in its script block.
 */
export function jsonLdScriptTag(data: unknown): string {
	return `<script type="application/ld+json">${serializeJsonLd(data)}</script>`;
}
