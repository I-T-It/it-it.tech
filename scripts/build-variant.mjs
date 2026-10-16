#!/usr/bin/env node
// Builds one variant: node scripts/build-variant.mjs <company|personal> [--no-copy]
//
// Output goes to dist/<site>/. Unless --no-copy is given, the same files are also copied to
// e2e-out/<site>/<base>/, so a plain static server serves them under the base path:
//   pnpm exec sirv e2e-out/company --port 4173   ->   http://localhost:4173/it-it.tech/
//
// Settings come from the environment, with the github.io addresses as defaults:
//   BASE_PATH                 '/it-it.tech' or '/deschepers.nl'. Empty once the custom domain is live.
//   PUBLIC_SITE_URL           https://i-t-it.github.io/it-it.tech or https://roboroads.github.io/deschepers.nl
//   PUBLIC_COMPANY_SITE_URL   https://i-t-it.github.io/it-it.tech/ (where the personal build links to)
//   BUILD_DIR                 dist/<site>
import { spawn } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBuildEnv, SITES, variantDefaults } from './site-env.mjs';
import { pruneVariantIcons } from './variant-icons.mjs';

const site = process.argv[2];
if (!SITES.includes(site)) {
	console.error('Usage: node scripts/build-variant.mjs <company|personal> [--no-copy]');
	process.exit(1);
}
const copyForE2e = !process.argv.includes('--no-copy');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaults = variantDefaults(site);

const env = {
	...process.env,
	PUBLIC_SITE: site,
	// An empty BASE_PATH is valid (custom domain), so only an unset one gets the default.
	BASE_PATH: process.env.BASE_PATH ?? defaults.basePath,
	BUILD_DIR: process.env.BUILD_DIR || `dist/${site}`
};
const resolved = resolveBuildEnv(env);
Object.assign(env, resolved);

console.log(
	`Building ${site}: base "${resolved.BASE_PATH}", url ${resolved.PUBLIC_SITE_URL}, output ${env.BUILD_DIR}`
);

const vite = path.join(root, 'node_modules', '.bin', 'vite');
const code = await new Promise((resolve) => {
	const child = spawn(vite, ['build'], { cwd: root, env, stdio: 'inherit' });
	child.on('exit', (exitCode) => resolve(exitCode ?? 1));
});
if (code !== 0) process.exit(code);

// Only this variant's icons stay in the output (see scripts/variant-icons.mjs).
await pruneVariantIcons(path.resolve(root, env.BUILD_DIR), site);

if (copyForE2e) {
	const from = path.resolve(root, env.BUILD_DIR);
	const siteDir = path.join(root, 'e2e-out', site);
	const to = path.join(siteDir, resolved.BASE_PATH);
	await rm(siteDir, { recursive: true, force: true });
	await mkdir(to, { recursive: true });
	await cp(from, to, { recursive: true });
	console.log(`Copied to ${path.relative(root, to)}`);
}
