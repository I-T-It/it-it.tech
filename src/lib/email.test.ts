import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emailEncoded, emailSubjectKey } from './content/company.js';
import { decodeEmail, EMAIL_FALLBACK_TEXT } from './email.js';

// Built from parts so this file never holds the plain address either.
const ADDRESS = ['info', '@', 'it-it', '.', 'tech'].join('');
const MAILTO = ['mail', 'to:'].join('');

describe('decodeEmail', () => {
	it('returns the address', () => {
		expect(decodeEmail()).toBe(ADDRESS);
		expect(decodeEmail(emailEncoded)).toBe(ADDRESS);
	});

	it('reverses the base64 of the reversed address', () => {
		expect(decodeEmail(btoa(Array.from(ADDRESS).reverse().join('')))).toBe(ADDRESS);
	});
});

describe('fallback text', () => {
	it('has no @ and no mailto', () => {
		expect(EMAIL_FALLBACK_TEXT).toBe('info [at] it-it [dot] tech');
		expect(EMAIL_FALLBACK_TEXT).not.toContain('@');
		expect(EMAIL_FALLBACK_TEXT).not.toContain(MAILTO);
	});
});

describe('company.ts', () => {
	const source = readFileSync(new URL('./content/company.ts', import.meta.url), 'utf8');

	it('holds neither the plain address nor a mailto link', () => {
		expect(source).not.toContain(ADDRESS);
		expect(source).not.toContain(MAILTO);
		expect(source).not.toContain('info%40');
	});

	it('stores the address encoded', () => {
		expect(emailEncoded).not.toContain('@');
		expect(emailEncoded).not.toBe(ADDRESS);
	});

	it('names where the mail subject lives', () => {
		expect(emailSubjectKey).toBe('availability.freelance.emailSubject');
	});
});
