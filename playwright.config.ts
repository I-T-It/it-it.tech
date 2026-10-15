import { defineConfig, devices } from '@playwright/test';

// Two projects, one per variant, each under its own base path. scripts/e2e-serve.mjs builds both
// variants and serves them. If the ports are taken (another executor), set E2E_PORT_COMPANY and
// E2E_PORT_PERSONAL.
const companyPort = Number(process.env.E2E_PORT_COMPANY ?? 4173);
const personalPort = Number(process.env.E2E_PORT_PERSONAL ?? 4174);

const companyBase = `http://127.0.0.1:${companyPort}/it-it.tech/`;
const personalBase = `http://127.0.0.1:${personalPort}/deschepers.nl/`;

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: { trace: 'retain-on-failure' },
	projects: [
		{ name: 'company', use: { ...devices['Desktop Chrome'], baseURL: companyBase } },
		{ name: 'personal', use: { ...devices['Desktop Chrome'], baseURL: personalBase } }
	],
	webServer: {
		command: 'node scripts/e2e-serve.mjs',
		url: companyBase,
		timeout: 300_000,
		reuseExistingServer: false,
		stdout: 'pipe',
		stderr: 'pipe'
	}
});
