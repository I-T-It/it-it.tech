import { defineEnvVars } from '@sveltejs/kit/env';
import { COMPANY_SITE_URL_DEFAULT, parseSite, variantDefaults } from '../scripts/site-env.mjs';

// Build-time variant settings. vite.config.ts fills in the defaults and fails the build on an
// invalid PUBLIC_SITE; the schemas here repeat the same rules so the values are typed.
// `static: true` inlines each value into the bundle, so `site === 'company'` branches can be
// dropped from the other build.
export const variables = defineEnvVars({
	PUBLIC_SITE: {
		public: true,
		static: true,
		description: 'Which build this is: "company" (default) or "personal".',
		schema: (value) => parseSite(value)
	},
	PUBLIC_SITE_URL: {
		public: true,
		static: true,
		description: 'Absolute origin plus base path of this build, without a trailing slash.',
		schema: (value) =>
			(value || variantDefaults(parseSite(process.env.PUBLIC_SITE)).siteUrl).replace(/\/+$/, '')
	},
	PUBLIC_COMPANY_SITE_URL: {
		public: true,
		static: true,
		description:
			'Address of the company site with a trailing slash. The personal build links to it.',
		schema: (value) => value || COMPANY_SITE_URL_DEFAULT
	}
});
