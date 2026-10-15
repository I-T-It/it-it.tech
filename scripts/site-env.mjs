// Shared by vite.config.ts and scripts/build-variant.mjs. Plain JS so node can run it without a build.

export const SITES = /** @type {const} */ (['company', 'personal']);

/** github.io addresses used until the custom domains are live (wave 5). */
const DEFAULTS = {
	company: {
		basePath: '/it-it.tech',
		siteUrl: 'https://i-t-it.github.io/it-it.tech'
	},
	personal: {
		basePath: '/deschepers.nl',
		siteUrl: 'https://roboroads.github.io/deschepers.nl'
	}
};

/** Where the personal build sends visitors who want I.T. It. Trailing slash on purpose. */
export const COMPANY_SITE_URL_DEFAULT = 'https://i-t-it.github.io/it-it.tech/';

/**
 * Unset or empty means company, which covers local dev and PR builds.
 * Anything else that is not a known site fails the build.
 * @param {string | undefined} raw
 * @returns {'company' | 'personal'}
 */
export function parseSite(raw) {
	if (raw === undefined || raw === '') return 'company';
	if (raw === 'company' || raw === 'personal') return raw;
	throw new Error(`PUBLIC_SITE must be "company" or "personal", got "${raw}"`);
}

/**
 * @param {'company' | 'personal'} site
 */
export function variantDefaults(site) {
	return DEFAULTS[site];
}

/**
 * Fills in the variant env for a build. BASE_PATH is allowed to be an empty string
 * (the custom domain is live); the other values treat empty as unset.
 * @param {Record<string, string | undefined>} env
 */
export function resolveBuildEnv(env) {
	const site = parseSite(env.PUBLIC_SITE);
	const defaults = variantDefaults(site);
	const basePath = env.BASE_PATH ?? '';
	if (basePath !== '' && (!basePath.startsWith('/') || basePath.endsWith('/'))) {
		throw new Error(
			`BASE_PATH must be empty or start with "/" and not end with one, got "${basePath}"`
		);
	}
	return {
		PUBLIC_SITE: site,
		PUBLIC_SITE_URL: (env.PUBLIC_SITE_URL || defaults.siteUrl).replace(/\/+$/, ''),
		PUBLIC_COMPANY_SITE_URL: env.PUBLIC_COMPANY_SITE_URL || COMPANY_SITE_URL_DEFAULT,
		BASE_PATH: basePath
	};
}
