import { describe, expect, it } from 'vitest';
import { resolveBuildEnv } from '../../scripts/site-env.mjs';
import {
	absoluteUrl,
	COMPANY_SITE_URL,
	parseSite,
	PERSONAL_SITE_URL,
	site,
	siteUrl,
	variant,
	variants
} from './site.js';

describe('parseSite', () => {
	it('falls back to company when unset or empty', () => {
		expect(parseSite(undefined)).toBe('company');
		expect(parseSite('')).toBe('company');
	});

	it('accepts company and personal', () => {
		expect(parseSite('company')).toBe('company');
		expect(parseSite('personal')).toBe('personal');
	});

	it('throws on any other value', () => {
		expect(() => parseSite('staging')).toThrow(/PUBLIC_SITE/);
		expect(() => parseSite('Company')).toThrow(/"Company"/);
	});
});

describe('resolveBuildEnv', () => {
	it('defaults to the company github.io address', () => {
		const env = resolveBuildEnv({});
		expect(env.PUBLIC_SITE).toBe('company');
		expect(env.PUBLIC_SITE_URL).toBe('https://i-t-it.github.io/it-it.tech');
		expect(env.BASE_PATH).toBe('');
	});

	it('defaults to the personal github.io address', () => {
		const env = resolveBuildEnv({ PUBLIC_SITE: 'personal' });
		expect(env.PUBLIC_SITE_URL).toBe('https://roboroads.github.io/deschepers.nl');
	});

	it('takes the site url from the env and drops a trailing slash', () => {
		const env = resolveBuildEnv({
			PUBLIC_SITE: 'personal',
			PUBLIC_SITE_URL: 'https://example.test/x/'
		});
		expect(env.PUBLIC_SITE_URL).toBe('https://example.test/x');
	});

	it('treats an empty site url as unset', () => {
		const env = resolveBuildEnv({ PUBLIC_SITE_URL: '' });
		expect(env.PUBLIC_SITE_URL).toBe('https://i-t-it.github.io/it-it.tech');
	});

	it('keeps an empty BASE_PATH and rejects a malformed one', () => {
		expect(resolveBuildEnv({ BASE_PATH: '' }).BASE_PATH).toBe('');
		expect(resolveBuildEnv({ BASE_PATH: '/it-it.tech' }).BASE_PATH).toBe('/it-it.tech');
		expect(() => resolveBuildEnv({ BASE_PATH: 'it-it.tech' })).toThrow(/BASE_PATH/);
		expect(() => resolveBuildEnv({ BASE_PATH: '/it-it.tech/' })).toThrow(/BASE_PATH/);
	});

	it('throws on an invalid PUBLIC_SITE', () => {
		expect(() => resolveBuildEnv({ PUBLIC_SITE: 'nope' })).toThrow(/PUBLIC_SITE/);
	});

	it('gives the personal build a link to the company site', () => {
		expect(resolveBuildEnv({}).PUBLIC_COMPANY_SITE_URL).toBe(
			'https://i-t-it.github.io/it-it.tech/'
		);
		expect(
			resolveBuildEnv({ PUBLIC_COMPANY_SITE_URL: 'https://it-it.tech/' }).PUBLIC_COMPANY_SITE_URL
		).toBe('https://it-it.tech/');
	});

	it('gives the company build a link to the personal site, github.io by default', () => {
		expect(resolveBuildEnv({}).PUBLIC_PERSONAL_SITE_URL).toBe(
			'https://roboroads.github.io/deschepers.nl/'
		);
		expect(resolveBuildEnv({ PUBLIC_PERSONAL_SITE_URL: '' }).PUBLIC_PERSONAL_SITE_URL).toBe(
			'https://roboroads.github.io/deschepers.nl/'
		);
	});

	it('takes the personal site url from the env and keeps one trailing slash', () => {
		const url = (value: string) =>
			resolveBuildEnv({ PUBLIC_PERSONAL_SITE_URL: value }).PUBLIC_PERSONAL_SITE_URL;
		expect(url('https://deschepers.nl/')).toBe('https://deschepers.nl/');
		expect(url('https://deschepers.nl')).toBe('https://deschepers.nl/');
		expect(url('https://example.test/x//')).toBe('https://example.test/x/');
	});
});

describe('build-time site', () => {
	it('matches the env the build was started with', () => {
		expect(site).toBe(parseSite(process.env.PUBLIC_SITE));
		expect(siteUrl).toBe(process.env.PUBLIC_SITE_URL);
		expect(COMPANY_SITE_URL).toBe(process.env.PUBLIC_COMPANY_SITE_URL);
		expect(COMPANY_SITE_URL.endsWith('/')).toBe(true);
		expect(PERSONAL_SITE_URL).toBe(process.env.PUBLIC_PERSONAL_SITE_URL);
		expect(PERSONAL_SITE_URL.endsWith('/')).toBe(true);
	});

	it('picks the variant that belongs to the site', () => {
		expect(variant).toBe(variants[site]);
		expect(variant.site).toBe(site);
	});

	it('orders company as logo first, freelance first', () => {
		expect(variants.company.heroOrder).toEqual(['logo', 'photo']);
		expect(variants.company.availabilityOrder).toEqual(['freelance', 'job']);
		expect(variants.company.primaryPath).toBe('freelance');
		expect(variants.company.jsonLd).toBe('Organization');
		expect(variants.company.ogImage).toBe('og-company.png');
	});

	it('orders personal as photo first, job first', () => {
		expect(variants.personal.heroOrder).toEqual(['photo', 'logo']);
		expect(variants.personal.availabilityOrder).toEqual(['job', 'freelance']);
		expect(variants.personal.primaryPath).toBe('job');
		expect(variants.personal.jsonLd).toBe('Person');
		expect(variants.personal.ogImage).toBe('og-personal.png');
	});

	it('builds absolute urls from the site url', () => {
		expect(absoluteUrl()).toBe(`${siteUrl}/`);
		expect(absoluteUrl('/en/')).toBe(`${siteUrl}/en/`);
		expect(absoluteUrl('sitemap.xml')).toBe(`${siteUrl}/sitemap.xml`);
	});
});
