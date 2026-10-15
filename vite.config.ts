import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideOptions } from './scripts/paraglide-options.mjs';
import { resolveBuildEnv } from './scripts/site-env.mjs';

// The variant is decided here, at build time. An invalid PUBLIC_SITE throws before anything builds.
// The values go back into process.env so src/env.ts picks them up as PUBLIC_* variables.
const env = resolveBuildEnv(process.env);
Object.assign(process.env, env);

const base = env.BASE_PATH as '' | `/${string}`;
const buildDir = process.env.BUILD_DIR || 'build';

export default defineConfig({
	build: {
		rolldownOptions: {
			// PUBLIC_SITE is a build-time constant. Inlining it across modules lets the minifier drop
			// the code of the other variant (the email UI on the personal build).
			optimization: { inlineConst: { mode: 'all', pass: 3 } }
		}
	},
	plugins: [
		enhancedImages(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ pages: buildDir, assets: buildDir, fallback: '404.html', strict: true }),
			// Absolute links: Paraglide's localizeHref needs the base path in the href it gets.
			paths: { base, relative: false },
			prerender: { entries: ['/', '/en/'] }
		}),

		paraglideVitePlugin(paraglideOptions(base))
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
