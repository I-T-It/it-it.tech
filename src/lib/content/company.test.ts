import { describe, expect, it } from 'vitest';
import { company, companyBtw, companyCity, companyKvk } from './company.js';

describe('company details', () => {
	it('has the registration numbers and the town for the company footer', () => {
		expect(companyKvk).toBe('86738852');
		expect(companyBtw).toBe('NL002333708B14');
		expect(companyCity).toBe('Zwaag');
	});

	it('are not on `company`, so the personal bundle can drop them', () => {
		// `company` stays in the personal bundle (links, names). Anything on it would stay too.
		expect(Object.keys(company)).not.toContain('kvk');
		expect(Object.keys(company)).not.toContain('btw');
		expect(Object.keys(company)).not.toContain('city');
	});
});

describe('company', () => {
	it('names the company and the owner', () => {
		expect(company.name).toBe('I.T. It');
		expect(company.founder).toBe('Robbin Schepers');
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
