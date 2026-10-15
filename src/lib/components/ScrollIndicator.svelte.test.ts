import '../../app.css';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import ScrollIndicator from './ScrollIndicator.svelte';

const root = document.documentElement;
let spacer: HTMLElement | undefined;

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

/** Makes the page tall enough to scroll. */
function makeScrollable() {
	spacer = document.createElement('div');
	spacer.style.height = '4000px';
	document.body.append(spacer);
}

afterEach(() => {
	root.classList.remove('reduced');
	window.scrollTo(0, 0);
	spacer?.remove();
	spacer = undefined;
	setLocale('nl');
});

const link = () => document.querySelector<HTMLAnchorElement>('a.scroll-indicator')!;
const pulse = () => document.querySelector<HTMLElement>('.scroll-indicator .pulse')!;
const seconds = (value: string) => parseFloat(value) * (value.endsWith('ms') ? 0.001 : 1);

describe('the link', () => {
	it('is a real link to the availability section, named by its visible text', async () => {
		const screen = await render(ScrollIndicator, {});
		const anchor = screen.getByRole('link', { name: 'Verder' });
		await expect.element(anchor).toBeVisible();
		await expect.element(anchor).toHaveAttribute('href', '#availability');
		expect(anchor.element().textContent?.trim()).toBe('Verder');
	});

	it('says Continue in English', async () => {
		setLocale('en');
		const screen = await render(ScrollIndicator, {});
		await expect.element(screen.getByRole('link', { name: 'Continue' })).toBeVisible();
	});

	it('takes keyboard focus and shows the focus ring', async () => {
		await render(ScrollIndicator, {});
		expect(link().tabIndex).toBe(0);
		link().focus();
		expect(document.activeElement).toBe(link());
		const style = getComputedStyle(link());
		expect(style.outlineStyle).toBe('solid');
		expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2);
	});

	it('is at least 24 by 24 CSS px', async () => {
		await render(ScrollIndicator, {});
		const box = link().getBoundingClientRect();
		expect(box.width).toBeGreaterThanOrEqual(24);
		expect(box.height).toBeGreaterThanOrEqual(24);
	});

	it('draws its trace as decoration, hidden from screen readers', async () => {
		await render(ScrollIndicator, {});
		const trace = document.querySelector('.scroll-indicator .trace')!;
		expect(trace.getAttribute('aria-hidden')).toBe('true');
		expect(trace.querySelector('a, button, [tabindex]')).toBeNull();
	});
});

describe('the pulse', () => {
	it('runs 3 times', async () => {
		await render(ScrollIndicator, {});
		const style = getComputedStyle(pulse());
		expect(style.animationName).not.toBe('none');
		expect(style.animationIterationCount).toBe('3');
	});

	it('is over within 5 seconds (WCAG 2.2.2), delay included', async () => {
		await render(ScrollIndicator, {});
		const style = getComputedStyle(pulse());
		const total = seconds(style.animationDelay) + 3 * seconds(style.animationDuration);
		expect(total).toBeLessThan(5);
	});

	it('is not flashing: one pass takes over a second', async () => {
		await render(ScrollIndicator, {});
		expect(seconds(getComputedStyle(pulse()).animationDuration)).toBeGreaterThan(1);
	});

	it('stops for good on the first scroll', async () => {
		makeScrollable();
		await render(ScrollIndicator, {});
		expect(link().hasAttribute('data-done')).toBe(false);

		window.scrollTo(0, 300);
		await expect.poll(() => link().hasAttribute('data-done')).toBe(true);
		expect(getComputedStyle(pulse()).animationName).toBe('none');

		// Scrolling back to the top does not start it again.
		window.scrollTo(0, 0);
		await expect.poll(() => window.scrollY).toBe(0);
		expect(link().hasAttribute('data-done')).toBe(true);
		expect(getComputedStyle(pulse()).animationName).toBe('none');
	});

	it('stays stopped when the page already starts scrolled', async () => {
		makeScrollable();
		window.scrollTo(0, 200);
		await expect.poll(() => window.scrollY).toBe(200);
		await render(ScrollIndicator, {});
		expect(link().hasAttribute('data-done')).toBe(true);
		expect(getComputedStyle(pulse()).animationName).toBe('none');
	});

	it('leaves the label and the link in place after it stops', async () => {
		makeScrollable();
		const screen = await render(ScrollIndicator, {});
		window.scrollTo(0, 300);
		await expect.poll(() => link().hasAttribute('data-done')).toBe(true);
		await expect.element(screen.getByRole('link', { name: 'Verder' })).toBeVisible();
	});

	it('is static under reduced motion: no animation at all', async () => {
		root.classList.add('reduced');
		const screen = await render(ScrollIndicator, {});
		expect(getComputedStyle(pulse()).animationName).toBe('none');
		expect(getComputedStyle(pulse()).opacity).toBe('0');
		expect(document.getAnimations()).toEqual([]);
		await expect.element(screen.getByRole('link', { name: 'Verder' })).toBeVisible();
	});

	it('animates when motion is allowed', async () => {
		await render(ScrollIndicator, {});
		expect(
			document.getAnimations().some((a) => (a as CSSAnimation).animationName !== undefined)
		).toBe(true);
	});

	it('removes its scroll listener on unmount without throwing', async () => {
		const screen = await render(ScrollIndicator, {});
		screen.unmount();
		window.dispatchEvent(new Event('scroll'));
		expect(document.querySelector('a.scroll-indicator')).toBeNull();
	});
});
