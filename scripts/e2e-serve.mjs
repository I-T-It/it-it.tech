#!/usr/bin/env node
// Used by playwright.config.ts: builds both variants one after the other (they share the
// .svelte-kit and paraglide folders, so they cannot build at the same time), then serves each
// under its base path:
//   company   http://127.0.0.1:4173/it-it.tech/
//   personal  http://127.0.0.1:4174/deschepers.nl/
// Set E2E_PORT_COMPANY / E2E_PORT_PERSONAL when the ports are taken. Set E2E_SKIP_BUILD=1 to
// reuse the last e2e-out/ folders.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES, variantDefaults } from './site-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ports = {
	company: Number(process.env.E2E_PORT_COMPANY ?? 4173),
	personal: Number(process.env.E2E_PORT_PERSONAL ?? 4174)
};

// The e2e tests always run against the github.io base paths, whatever the shell has set.
const cleanEnv = { ...process.env };
for (const key of [
	'BASE_PATH',
	'PUBLIC_SITE',
	'PUBLIC_SITE_URL',
	'PUBLIC_COMPANY_SITE_URL',
	'BUILD_DIR'
]) {
	delete cleanEnv[key];
}

/** @param {string} command @param {string[]} args */
function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd: root, env: cleanEnv, stdio: 'inherit' });
		child.on('exit', (code) =>
			code === 0
				? resolve(undefined)
				: reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
		);
	});
}

if (!process.env.E2E_SKIP_BUILD) {
	for (const site of SITES) {
		await run(process.execPath, ['scripts/build-variant.mjs', site]);
	}
}

const sirv = path.join(root, 'node_modules', '.bin', 'sirv');
/** @type {import('node:child_process').ChildProcess[]} */
const servers = [];

function stopAll() {
	for (const server of servers) server.kill();
}
process.on('SIGTERM', () => {
	stopAll();
	process.exit(0);
});
process.on('SIGINT', () => {
	stopAll();
	process.exit(0);
});
process.on('exit', stopAll);

/** @param {string} url */
async function waitFor(url) {
	for (let i = 0; i < 100; i++) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// not up yet
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`${url} did not come up`);
}

// Personal first, company last: Playwright waits on the company url, so both are up by then.
for (const site of ['personal', 'company']) {
	const server = spawn(
		sirv,
		[`e2e-out/${site}`, '--port', String(ports[site]), '--host', '127.0.0.1', '--quiet'],
		{ cwd: root, env: cleanEnv, stdio: 'inherit' }
	);
	server.on('exit', (code) => {
		console.error(`sirv for ${site} exited with ${code}`);
		process.exit(code ?? 1);
	});
	servers.push(server);
	await waitFor(`http://127.0.0.1:${ports[site]}${variantDefaults(site).basePath}/`);
}
console.log(
	`Serving company on ${ports.company} and personal on ${ports.personal}. Press Ctrl+C to stop.`
);
