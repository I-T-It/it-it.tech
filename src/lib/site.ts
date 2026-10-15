import { PUBLIC_SITE, PUBLIC_SITE_URL, PUBLIC_COMPANY_SITE_URL } from '$app/env/public';
import { parseSite } from '../../scripts/site-env.mjs';

export { parseSite };

export type Site = 'company' | 'personal';
export type CareerPath = 'job' | 'freelance';

export interface Variant {
	site: Site;
	/** Order of the two lead visuals in the hero. */
	heroOrder: readonly ['logo', 'photo'] | readonly ['photo', 'logo'];
	/** The path whose CTA is filled. The other one is the outline CTA. */
	primaryPath: CareerPath;
	/** Order of the U1 (job) and U2 (freelance) chips. */
	availabilityOrder: readonly [CareerPath, CareerPath];
	/** File name under static/, 1200x630. */
	ogImage: 'og-company.png' | 'og-personal.png';
	jsonLd: 'Organization' | 'Person';
}

export const variants: Record<Site, Variant> = {
	company: {
		site: 'company',
		heroOrder: ['logo', 'photo'],
		primaryPath: 'freelance',
		availabilityOrder: ['freelance', 'job'],
		ogImage: 'og-company.png',
		jsonLd: 'Organization'
	},
	personal: {
		site: 'personal',
		heroOrder: ['photo', 'logo'],
		primaryPath: 'job',
		availabilityOrder: ['job', 'freelance'],
		ogImage: 'og-personal.png',
		jsonLd: 'Person'
	}
};

/**
 * Which build this is. Decided at build time from PUBLIC_SITE; unset means company and an invalid
 * value fails the build (see vite.config.ts). Components branch on this, never on the hostname.
 */
export const site: Site = PUBLIC_SITE;

export const variant: Variant = variants[site];

/** Absolute origin plus base path of this build, without a trailing slash. */
export const siteUrl: string = PUBLIC_SITE_URL;

/**
 * Where the company site lives, with a trailing slash. The personal build links here instead of
 * showing an email address. Locale: append `en/` for English, nothing for Dutch.
 * It is the github.io address until the custom domain is live, then https://it-it.tech/.
 */
export const COMPANY_SITE_URL: string = PUBLIC_COMPANY_SITE_URL;

/** `siteUrl` plus a root-relative path, e.g. `absoluteUrl('/en/')`. */
export function absoluteUrl(path = '/'): string {
	return siteUrl + (path.startsWith('/') ? path : `/${path}`);
}
