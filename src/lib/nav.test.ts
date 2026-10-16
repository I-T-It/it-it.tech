import { describe, expect, it } from 'vitest';
import { sectionIds } from './nav.js';

describe('sectionIds', () => {
	it('lists every section of the company page in page order: freelance before job', () => {
		expect(sectionIds(['freelance', 'job'])).toEqual([
			'hero',
			'freelance',
			'job',
			'about',
			'competences',
			'experience',
			'projects',
			'skills',
			'talks',
			'education',
			'contact'
		]);
	});

	it('lists every section of the personal page in page order: job before freelance', () => {
		expect(sectionIds(['job', 'freelance'])).toEqual([
			'hero',
			'job',
			'freelance',
			'about',
			'competences',
			'experience',
			'projects',
			'skills',
			'talks',
			'education',
			'contact'
		]);
	});

	it('names each section once', () => {
		const ids = sectionIds(['freelance', 'job']);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
