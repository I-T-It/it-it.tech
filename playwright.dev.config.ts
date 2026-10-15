import { defineConfig, devices } from '@playwright/test';

// Smoke test of the dev server, one variant at a time: scripts/test-dev.mjs runs this config once
// per PUBLIC_SITE and BASE_PATH combination. The combinations cannot run side by side, because the
// dev servers share .svelte-kit and the compiled Paraglide runtime (which carries the base path).
// Change the port with DEV_TEST_PORT when it is taken; keep clear of 5173, where `pnpm dev` runs.
const port = Number(process.env.DEV_TEST_PORT ?? 5180);
const personal = process.env.PUBLIC_SITE === 'personal';
const base = process.env.BASE_PATH ?? '';
const url = `http://127.0.0.1:${port}${base}/`;

export default defineConfig({
	testDir: 'e2e-dev',
	testMatch: '**/*.spec.ts',
	// One folder per combination, so a failed trace survives the runs after it.
	outputDir: `test-results/dev-${personal ? 'personal' : 'company'}${base ? '-base' : ''}`,
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: { ...devices['Desktop Chrome'], baseURL: url, trace: 'retain-on-failure' },
	webServer: {
		// The real scripts, so a change to them is covered too.
		command: `pnpm ${personal ? 'dev:personal' : 'dev'} --port ${port} --strictPort --host 127.0.0.1`,
		url,
		timeout: 120_000,
		reuseExistingServer: false,
		stdout: 'pipe',
		stderr: 'pipe'
	}
});
