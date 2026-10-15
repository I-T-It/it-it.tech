import '../../app.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { overwriteGetLocale } from '#lib/paraglide/runtime.js';
import SiteHeader from './SiteHeader.svelte';

// The header hides while the visitor is at the top of the page and slides in once they have
// scrolled a bit: 40% of the first window, at most 200px. This file runs the company build; the
// variant does not change the behaviour. The real site.ts needs the SvelteKit dev runtime, so it
// is mocked.
vi.mock('../site.js', () => ({ site: 'company' }));

const root = document.documentElement;
const header = () => document.querySelector<HTMLElement>('header')!;
const opacity = () => getComputedStyle(header()).opacity;

let spacer: HTMLElement;
let marker: HTMLElement;
let noMotion: HTMLStyleElement | undefined;

/** Transitions would make computed styles a moving target. Most tests switch them off. */
function stopTransitions() {
	noMotion = document.createElement('style');
	noMotion.textContent = '*, *::before, *::after { transition: none !important; }';
	document.head.append(noMotion);
}

/** The first window is 800px high: 40% would be 320px, the cap makes it 200px. */
const WINDOW = 800;
const THRESHOLD = 200;

beforeEach(async () => {
	root.classList.add('js');
	await page.viewport(1000, WINDOW);
	overwriteGetLocale(() => 'nl');
	// Something to scroll, and a marker that stands for the first line of the page.
	marker = document.createElement('div');
	marker.style.height = '10px';
	spacer = document.createElement('div');
	spacer.style.height = '4000px';
	document.body.append(marker, spacer);
	window.scrollTo(0, 0);
});

afterEach(async () => {
	root.classList.remove('js', 'reduced');
	root.style.removeProperty('--header-height');
	noMotion?.remove();
	noMotion = undefined;
	marker.remove();
	spacer.remove();
	window.scrollTo(0, 0);
	await page.viewport(414, 896);
});

describe('at the top of the page', () => {
	beforeEach(stopTransitions);

	it('is hidden above the window', async () => {
		await render(SiteHeader, {});
		await expect.poll(() => header().dataset.hidden).toBe('true');
		expect(header().getBoundingClientRect().bottom).toBeLessThanOrEqual(0);
		expect(opacity()).toBe('0');
	});

	it('is still in the accessibility tree and the tab order', async () => {
		const screen = await render(SiteHeader, {});
		await expect.poll(() => header().dataset.hidden).toBe('true');
		const style = getComputedStyle(header());
		expect(style.display).not.toBe('none');
		expect(style.visibility).toBe('visible');
		expect(header().closest('[aria-hidden], [inert]')).toBeNull();
		await expect.element(screen.getByRole('banner')).toBeInTheDocument();
		await expect.element(screen.getByRole('link', { name: 'Contact' })).toBeInTheDocument();
		for (const link of header().querySelectorAll('a')) expect(link.tabIndex).toBe(0);
	});

	it('takes no room in the page, so nothing moves when it appears', async () => {
		await render(SiteHeader, {});
		await expect.poll(() => header().dataset.hidden).toBe('true');
		expect(getComputedStyle(header()).position).toBe('fixed');
		const top = () => marker.getBoundingClientRect().top + window.scrollY;
		const before = top();
		window.scrollTo(0, WINDOW);
		await expect.poll(() => header().dataset.hidden).toBeUndefined();
		expect(top()).toBe(before);
	});
});

describe('scrolling', () => {
	beforeEach(stopTransitions);

	it('stays hidden while the scroll is under the threshold', async () => {
		await render(SiteHeader, {});
		window.scrollTo(0, THRESHOLD * 0.7);
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(header().dataset.hidden).toBe('true');
		expect(opacity()).toBe('0');
	});

	it('appears once the scroll is past it, at the top of the window', async () => {
		await render(SiteHeader, {});
		window.scrollTo(0, THRESHOLD + 100);
		await expect.poll(() => header().dataset.hidden).toBeUndefined();
		expect(opacity()).toBe('1');
		expect(header().getBoundingClientRect().top).toBe(0);
	});

	it('uses 40% of a short first window when that is under 200px', async () => {
		await page.viewport(1000, 450);
		await render(SiteHeader, {});
		window.scrollTo(0, 450 * 0.4 - 20);
		await new Promise((resolve) => setTimeout(resolve, 150));
		expect(header().dataset.hidden).toBe('true');
		window.scrollTo(0, 450 * 0.4 + 20);
		await expect.poll(() => header().dataset.hidden).toBeUndefined();
	});

	it('is 0 in --header-height while hidden and its height once shown', async () => {
		await render(SiteHeader, {});
		await expect.poll(() => header().dataset.hidden).toBe('true');
		await expect.poll(() => root.style.getPropertyValue('--header-height')).toBe('0px');
		expect(getComputedStyle(root).scrollPaddingTop).toBe('0px');

		window.scrollTo(0, WINDOW);
		await expect.poll(() => header().dataset.hidden).toBeUndefined();
		const height = `${header().getBoundingClientRect().height}px`;
		await expect.poll(() => root.style.getPropertyValue('--header-height')).toBe(height);
		expect(getComputedStyle(root).scrollPaddingTop).toBe(height);

		window.scrollTo(0, 0);
		await expect.poll(() => root.style.getPropertyValue('--header-height')).toBe('0px');
	});

	it('has its height in --header-height while focus holds it open at the top', async () => {
		await render(SiteHeader, {});
		await expect.poll(() => root.style.getPropertyValue('--header-height')).toBe('0px');
		header().querySelector<HTMLAnchorElement>('.brand')!.focus();
		const height = `${header().getBoundingClientRect().height}px`;
		await expect.poll(() => root.style.getPropertyValue('--header-height')).toBe(height);
	});

	it('hides again when the visitor is back at the top', async () => {
		await render(SiteHeader, {});
		window.scrollTo(0, WINDOW);
		await expect.poll(() => header().dataset.hidden).toBeUndefined();
		window.scrollTo(0, 0);
		await expect.poll(() => header().dataset.hidden).toBe('true');
		expect(header().getBoundingClientRect().bottom).toBeLessThanOrEqual(0);
	});

	it('is shown at once when the page loads already scrolled', async () => {
		window.scrollTo(0, WINDOW);
		await render(SiteHeader, {});
		await expect.poll(() => header().dataset.hidden).toBeUndefined();
	});

	it('keeps --header-height and scroll-padding-top equal to its height', async () => {
		await render(SiteHeader, {});
		window.scrollTo(0, WINDOW);
		await expect.poll(() => header().dataset.hidden).toBeUndefined();
		const height = `${header().getBoundingClientRect().height}px`;
		await expect.poll(() => root.style.getPropertyValue('--header-height')).toBe(height);
		expect(getComputedStyle(root).scrollPaddingTop).toBe(height);
	});
});

describe('keyboard focus', () => {
	beforeEach(stopTransitions);

	it('reveals the header when focus enters it, and hides it again when focus leaves', async () => {
		await render(SiteHeader, {});
		await expect.poll(() => header().dataset.hidden).toBe('true');
		const toggle = header().querySelector<HTMLAnchorElement>('a[hreflang="en"]')!;

		toggle.focus();
		expect(document.activeElement).toBe(toggle);
		expect(opacity()).toBe('1');
		expect(header().getBoundingClientRect().top).toBe(0);

		toggle.blur();
		expect(opacity()).toBe('0');
		expect(header().getBoundingClientRect().bottom).toBeLessThanOrEqual(0);
	});

	it('reveals it for the first stop in the header too', async () => {
		await render(SiteHeader, {});
		await expect.poll(() => header().dataset.hidden).toBe('true');
		header().querySelector<HTMLAnchorElement>('.brand')!.focus();
		expect(opacity()).toBe('1');
		expect(header().getBoundingClientRect().top).toBe(0);
	});

	it('shows the focus ring on what it revealed', async () => {
		await render(SiteHeader, {});
		const link = header().querySelector<HTMLAnchorElement>('.menu a')!;
		link.focus();
		expect(getComputedStyle(link).outlineWidth).toBe('2px');
	});
});

describe('motion', () => {
	it('slides and fades in normally', async () => {
		await render(SiteHeader, {});
		const duration = getComputedStyle(header()).transitionDuration;
		expect(duration).not.toBe('0s');
		expect(getComputedStyle(header()).transitionProperty).toContain('transform');
	});

	it('only shows and hides under reduced motion: no transition', async () => {
		root.classList.add('reduced');
		await render(SiteHeader, {});
		const style = getComputedStyle(header());
		expect(style.transitionDuration.split(',').every((d) => d.trim() === '0s')).toBe(true);
		await expect.poll(() => header().dataset.hidden).toBe('true');
		expect(header().getBoundingClientRect().bottom).toBeLessThanOrEqual(0);
		window.scrollTo(0, WINDOW);
		await expect.poll(() => header().dataset.hidden).toBeUndefined();
		expect(header().getBoundingClientRect().top).toBe(0);
		expect(opacity()).toBe('1');
	});
});

describe('where it never hides', () => {
	beforeEach(stopTransitions);

	it('is always visible without JavaScript: no html.js, in the flow of the page', async () => {
		root.classList.remove('js');
		await render(SiteHeader, {});
		const style = getComputedStyle(header());
		expect(style.position).toBe('sticky');
		expect(style.opacity).toBe('1');
		expect(style.transform).toBe('none');
		expect(style.pointerEvents).not.toBe('none');
		// In the flow: it takes room.
		expect(header().getBoundingClientRect().height).toBeGreaterThan(0);
	});

	it('is always visible when the page asks for it (hideAtTop false), e.g. the 404', async () => {
		await render(SiteHeader, { hideAtTop: false });
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(header().dataset.hidden).toBeUndefined();
		expect(opacity()).toBe('1');
		expect(header().getBoundingClientRect().top).toBe(0);
	});

	it('is always visible on a window too short to spare the room', async () => {
		await page.viewport(1000, 400);
		await render(SiteHeader, {});
		await new Promise((resolve) => setTimeout(resolve, 100));
		const style = getComputedStyle(header());
		expect(style.position).toBe('static');
		expect(style.opacity).toBe('1');
		expect(style.transform).toBe('none');
		expect(header().dataset.hidden).toBe('true');
	});
});

describe('the sentinel', () => {
	it('is decoration: hidden from assistive technology and out of the way of the pointer', async () => {
		await render(SiteHeader, {});
		const sentinel = document.querySelector<HTMLElement>('.top-sentinel')!;
		expect(sentinel.getAttribute('aria-hidden')).toBe('true');
		expect(getComputedStyle(sentinel).pointerEvents).toBe('none');
		expect(sentinel.getBoundingClientRect().height).toBe(THRESHOLD);
	});
});
