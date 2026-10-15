/**
 * The talks chip on the personal build. The variant is a build-time constant, so this file runs
 * the personal build; the company build is in cv.svelte.test.ts.
 */
import '../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getContent } from '#lib/content/index.js';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import Talks from './Talks.svelte';

// The same values as `variants.personal` in site.ts (importActual does not load site.ts in browser mode).
vi.mock('../site.js', () => ({
	site: 'personal',
	variant: {
		site: 'personal',
		heroOrder: ['photo', 'logo'],
		primaryPath: 'job',
		availabilityOrder: ['job', 'freelance']
	},
	COMPANY_SITE_URL: 'https://company.example/'
}));

// Built from parts: the address and the mail scheme are never written out (see CLAUDE.md).
const address = ['info', '@', 'it-it', '.', 'tech'].join('');
const scheme = ['mail', 'to'].join('');

const talks = (locale: Locale = 'nl') => getContent(locale).talks;
const offer = (id: string) => document.querySelector<HTMLElement>(`[data-offer="${id}"]`)!;

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

afterEach(() => {
	setLocale('nl');
	vi.restoreAllMocks();
});

describe('Talks on the personal build', () => {
	it('shows no email address, no mail link and no protected email', async () => {
		await render(Talks, {});
		const section = document.querySelector('section#talks')!;
		expect(section.querySelector('.email, [href^="mailto"]')).toBeNull();
		expect(section.innerHTML.toLowerCase()).not.toContain(scheme + ':');
		expect(section.textContent).not.toContain(address);
		expect(section.textContent).not.toContain('[at]');
	});

	it('links every offer to that offer on the company site, in the Dutch page', async () => {
		await render(Talks, {});
		for (const o of talks().offers) {
			const links = offer(o.id).querySelectorAll<HTMLAnchorElement>('a');
			expect(links, o.id).toHaveLength(1);
			expect(links[0].getAttribute('href'), o.id).toBe(`https://company.example/#offer-${o.id}`);
			expect(links[0].classList.contains('cta'), o.id).toBe(true);
			expect(links[0].textContent, o.id).toContain('Boek via I.T. It');
		}
	});

	it('links to the English company page from the English page', async () => {
		setLocale('en');
		await render(Talks, {});
		const link = offer('svelte-talk').querySelector('a')!;
		expect(link.getAttribute('href')).toBe('https://company.example/en/#offer-svelte-talk');
		expect(link.textContent).toContain('Book through I.T. It');
	});

	it('says that the link leaves the site, for screen readers only, and opens in the same tab', async () => {
		await render(Talks, {});
		const link = offer('flutter-workshop').querySelector('a')!;
		const notice = link.querySelector<HTMLElement>('.sr-only')!;
		expect(notice.textContent).toContain('(externe site)');
		expect(link.hasAttribute('target')).toBe(false);
	});

	it('gives the offer an anchor the company site can jump to', async () => {
		await render(Talks, {});
		for (const o of talks().offers) expect(offer(o.id).id, o.id).toBe(`offer-${o.id}`);
	});

	it('still lists the history with its links to the events', async () => {
		await render(Talks, {});
		expect(document.querySelectorAll('[data-given]')).toHaveLength(9);
		expect(document.querySelectorAll('[data-given] a')).toHaveLength(4);
	});
});
