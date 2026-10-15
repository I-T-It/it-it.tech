import { describe, expect, it } from 'vitest';
import { company } from './company.js';

describe('company', () => {
	it('has the registration numbers for the footer', () => {
		expect(company.kvk).toBe('86738852');
		expect(company.btw).toBe('NL002333708B14');
	});

	it('names the company, the owner and the town', () => {
		expect(company.name).toBe('I.T. It');
		expect(company.founder).toBe('Robbin Schepers');
		expect(company.city).toBe('Zwaag');
	});

	it('links to LinkedIn and GitHub over https', () => {
		expect(company.linkedin).toBe('https://www.linkedin.com/in/roboroads');
		expect(company.github).toBe('https://github.com/Roboroads');
	});
});
