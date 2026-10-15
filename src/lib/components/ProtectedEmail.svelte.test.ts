import '../../app.css';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { decodeEmail, EMAIL_FALLBACK_TEXT } from '#lib/email.js';
import ProtectedEmail from './ProtectedEmail.svelte';

// Built from parts: the address and the mail scheme are never written out (see CLAUDE.md).
const address = ['info', '@', 'it-it', '.', 'tech'].join('');
const scheme = ['mail', 'to'].join('') + ':';
const subject = 'Project voor I.T. It';

describe('after mount', () => {
	it('assembles the address from the encoded parts', () => {
		expect(decodeEmail()).toBe(address);
	});

	it('links to the address, with the address as text and as name', async () => {
		const screen = await render(ProtectedEmail, {});
		const link = screen.getByRole('link', { name: address });
		await expect.element(link).toHaveAttribute('href', `${scheme}${address}`);
		await expect.element(link).toHaveTextContent(address);
	});

	it('puts the encoded subject in the link', async () => {
		const screen = await render(ProtectedEmail, { subject });
		await expect
			.element(screen.getByRole('link', { name: address }))
			.toHaveAttribute('href', `${scheme}${address}?subject=Project%20voor%20I.T.%20It`);
	});

	it('encodes characters that would break the link', async () => {
		const screen = await render(ProtectedEmail, { subject: 'Vraag & antwoord?' });
		await expect
			.element(screen.getByRole('link', { name: address }))
			.toHaveAttribute('href', `${scheme}${address}?subject=Vraag%20%26%20antwoord%3F`);
	});

	it('leaves the fallback text behind: no fallback in the DOM once mounted', async () => {
		const screen = await render(ProtectedEmail, {});
		await expect.element(screen.getByRole('link', { name: address })).toBeVisible();
		expect(document.body.textContent).not.toContain('[at]');
	});

	it('is keyboard focusable and shows the focus ring', async () => {
		const screen = await render(ProtectedEmail, {});
		const link = screen.getByRole('link', { name: address }).element() as HTMLAnchorElement;
		expect(link.tabIndex).toBe(0);
		link.focus();
		expect(document.activeElement).toBe(link);
		const style = getComputedStyle(link);
		expect(style.outlineStyle).toBe('solid');
		expect(style.outlineWidth).toBe('2px');
	});
});

describe('cta variant', () => {
	it('shows the label, names the link by it and mails the address', async () => {
		const screen = await render(ProtectedEmail, { variant: 'cta', label: subject, subject });
		const link = screen.getByRole('link', { name: subject });
		await expect
			.element(link)
			.toHaveAttribute('href', `${scheme}${address}?subject=Project%20voor%20I.T.%20It`);
		await expect.element(link).toHaveTextContent(subject);
		expect(link.element().textContent).not.toContain(address);
		expect(link.element().textContent).not.toContain(EMAIL_FALLBACK_TEXT);
	});

	it('is a button-style link that takes the classes of its caller', async () => {
		const screen = await render(ProtectedEmail, {
			variant: 'cta',
			label: subject,
			class: 'cta-filled cta-freelance'
		});
		const link = screen.getByRole('link', { name: subject }).element();
		expect(link.classList.contains('cta')).toBe(true);
		expect(link.classList.contains('cta-filled')).toBe(true);
		expect(link.classList.contains('cta-freelance')).toBe(true);
		// Target size 2.5.8: at least 24 by 24 CSS pixels.
		const box = link.getBoundingClientRect();
		expect(box.height).toBeGreaterThanOrEqual(24);
		expect(box.width).toBeGreaterThanOrEqual(24);
	});

	it('falls back to the address when there is no label', async () => {
		const screen = await render(ProtectedEmail, { variant: 'cta' });
		await expect.element(screen.getByRole('link', { name: address })).toBeVisible();
	});
});
