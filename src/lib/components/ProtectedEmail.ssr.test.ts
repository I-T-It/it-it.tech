import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { decodeEmail, EMAIL_FALLBACK_TEXT } from '#lib/email.js';
import ProtectedEmail from './ProtectedEmail.svelte';

/**
 * What the prerender writes, which is what scrapers and visitors without JavaScript get.
 * The address and the mail scheme are built from parts here, never written out (see CLAUDE.md).
 */
const address = decodeEmail();
const scheme = ['mail', 'to'].join('');
const [local] = address.split(['@'].join(''));

function prerender(props: Record<string, unknown> = {}): string {
	return render(ProtectedEmail, { props }).body;
}

describe('ProtectedEmail prerender, address variant', () => {
	const html = prerender();

	it('writes the readable fallback and nothing else', () => {
		expect(html).toContain(EMAIL_FALLBACK_TEXT);
		expect(EMAIL_FALLBACK_TEXT).toBe('info [at] it-it [dot] tech');
	});

	it('writes no address in any spelling', () => {
		expect(html).not.toContain(address);
		expect(html).not.toContain(encodeURIComponent(address));
		expect(html).not.toContain(address.replace('@', '&#64;'));
		expect(html).not.toContain(address.replace('@', '&#x40;'));
		expect(html).not.toContain('@');
		expect(html).not.toContain(`${local}%40`);
	});

	it('writes no mail link', () => {
		expect(html.toLowerCase()).not.toContain(scheme);
		expect(html).not.toContain('subject=');
	});

	it('links to the contact section, which shows the address as text', () => {
		expect(html).toMatch(/<a [^>]*class="[^"]*\bemail\b[^"]*"/);
		expect(html).toContain('href="#contact"');
	});
});

describe('ProtectedEmail prerender, cta variant', () => {
	const html = prerender({
		variant: 'cta',
		label: 'Project voor I.T. It',
		subject: 'Project voor I.T. It'
	});

	it('writes the label as the link text, followed by the fallback for visitors without JS', () => {
		expect(html).toContain('Project voor I.T. It');
		expect(html).toContain(EMAIL_FALLBACK_TEXT);
		expect(html).toContain('email-fallback');
		expect(html).toContain('href="#contact"');
	});

	it('writes no address and no mail link, even with a subject', () => {
		expect(html).not.toContain('@');
		expect(html.toLowerCase()).not.toContain(scheme);
		expect(html).not.toContain('subject=');
		expect(html).not.toContain(address);
	});

	it('is a button-style link', () => {
		expect(html).toMatch(/class="[^"]*\bcta\b/);
	});
});
