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

	it('keeps the legal name and the display name apart, built from the same parts', () => {
		// The legal name stays for company and legal lines; the display name is how he is known.
		expect(company.founder).toBe(`${company.givenName} ${company.familyName}`);
		expect(company.displayName).toBe(
			`${company.givenName} "${company.nickname}" ${company.familyName}`
		);
		expect(company.displayName).toBe('Robbin "Roboroads" Schepers');
	});

	it('uses the nickname as the handle', () => {
		expect(company.githubHandle).toBe(`@${company.nickname}`);
		expect(company.github.toLowerCase().endsWith(`/${company.nickname.toLowerCase()}`)).toBe(true);
	});

	it('links to LinkedIn and GitHub over https', () => {
		expect(company.linkedin).toBe('https://www.linkedin.com/in/roboroads');
		expect(company.github).toBe('https://github.com/Roboroads');
	});
});
