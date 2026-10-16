#!/usr/bin/env node
// Smoke test of `pnpm dev`: node scripts/test-dev.mjs
//
// Starts the dev server for each variant, with and without a base path, and checks in Chromium
// that the page hydrates with no failed request and no console error (e2e-dev/dev.spec.ts).
// The built site is covered by `pnpm test:e2e`; this covers what only the dev server does.
//
// One combination at a time: the dev servers share .svelte-kit and the compiled Paraglide runtime,
// and that runtime carries the base path. Set DEV_TEST_PORT when port 5180 is taken.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { variantDefaults } from './site-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playwright = path.join(root, 'node_modules', '.bin', 'playwright');

/** @type {{ site: 'company' | 'personal', base: string }[]} */
const combinations = [
	{ site: 'company', base: '' },
	{ site: 'company', base: variantDefaults('company').basePath },
	{ site: 'personal', base: '' },
	{ site: 'personal', base: variantDefaults('personal').basePath }
];

/** @param {{ site: string, base: string }} combination @returns {Promise<number>} */
function run({ site, base }) {
	const env = { ...process.env, BASE_PATH: base };
	for (const key of [
		'PUBLIC_SITE',
		'PUBLIC_SITE_URL',
		'PUBLIC_COMPANY_SITE_URL',
		'PUBLIC_PERSONAL_SITE_URL',
		'BUILD_DIR'
	]) {
		delete env[key];
	}
	if (site === 'personal') env.PUBLIC_SITE = 'personal';

	console.log(`\n== dev server: ${site}, base "${base}" ==`);
	return new Promise((resolve) => {
		const child = spawn(playwright, ['test', '--config', 'playwright.dev.config.ts'], {
			cwd: root,
			env,
			stdio: 'inherit'
		});
		child.on('exit', (code) => resolve(code ?? 1));
	});
}

const failed = [];
for (const combination of combinations) {
	if ((await run(combination)) !== 0) failed.push(`${combination.site} "${combination.base}"`);
}

if (failed.length > 0) {
	console.error(`\nDev server smoke test failed for: ${failed.join(', ')}`);
	process.exit(1);
}
console.log('\nDev server smoke test passed for every combination.');
