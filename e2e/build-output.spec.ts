import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// The built files of each variant, as scripts/e2e-serve.mjs leaves them in e2e-out/<site>/. The
// company details (KvK and BTW number, the town, their labels) are for the company build: the
// personal build must not carry them in a page, a script or a stylesheet, whether the page shows
// them or not.
const TEXT_FILES = /\.(html|js|mjs|css|json|txt|xml|webmanifest|svg)$/;

const companyDetails = [
	'86738852',
	'NL002333708B14',
	'Zwaag',
	'KvK-nummer',
	'BTW-nummer',
	'KvK number',
	'VAT number'
];

async function* walk(dir: string): AsyncGenerator<string> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else if (TEXT_FILES.test(entry.name)) yield full;
	}
}

/** Every built text file of a variant, joined: the details only need to be somewhere in it. */
async function builtText(site: string): Promise<{ files: number; text: string }> {
	const parts: string[] = [];
	for await (const file of walk(path.resolve('e2e-out', site))) {
		parts.push(await readFile(file, 'utf8'));
	}
	return { files: parts.length, text: parts.join('\n') };
}

test.describe('build output', () => {
	test('company: carries the company details', async () => {
		test.skip(test.info().project.name !== 'company', 'checks the company build');
		const { files, text } = await builtText('company');
		expect(files).toBeGreaterThan(5);
		for (const detail of companyDetails) {
			expect(text, detail).toContain(detail);
		}
	});

	test('personal: carries none of the company details, in any file', async () => {
		test.skip(test.info().project.name !== 'personal', 'checks the personal build');
		const { files, text } = await builtText('personal');
		expect(files).toBeGreaterThan(5);
		for (const detail of companyDetails) {
			expect(text, detail).not.toContain(detail);
		}
	});
});
