import '../../app.css';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { chips } from '#lib/pcb/registry.svelte.js';
import Chip from './Chip.svelte';

type Props = Partial<Omit<Parameters<typeof Chip>[1], 'children'>> & { bodyHeight?: number };

function body(height: number) {
	return createRawSnippet(() => ({
		render: () =>
			`<div><h2 id="about-title">Over mij</h2><div style="height:${height}px"></div></div>`
	}));
}

async function mount({ bodyHeight = 40, id = 'about', ...props }: Props = {}) {
	const screen = await render(Chip, {
		id,
		designator: 'U3',
		labelledby: 'about-title',
		children: body(bodyHeight),
		...props
	});
	const section = document.querySelector<HTMLElement>(`section#${id}`)!;
	return { screen, section };
}

const root = document.documentElement;
let noMotion: HTMLStyleElement;

beforeEach(() => {
	// Transitions would make computed styles a moving target.
	noMotion = document.createElement('style');
	noMotion.textContent =
		'*, *::before, *::after { transition: none !important; animation: none !important; }';
	document.head.append(noMotion);
});

afterEach(() => {
	root.classList.remove('js', 'reduced');
	noMotion.remove();
});

function lit(section: HTMLElement) {
	const style = (selector: string) => getComputedStyle(section.querySelector(selector)!);
	return {
		ring: style('.glow').opacity,
		pin: style('.pin').backgroundColor,
		led: style('.led').backgroundColor
	};
}

describe('structure', () => {
	it('is a labelled region that holds the content', async () => {
		const { screen, section } = await mount();
		await expect.element(screen.getByRole('region', { name: 'Over mij' })).toBeVisible();
		expect(section.querySelector('.body h2')?.textContent).toBe('Over mij');
	});

	it('prints the designator in the corner', async () => {
		const { section } = await mount({ designator: 'U7' });
		expect(section.querySelector('.designator')?.textContent).toContain('U7');
	});

	it('hides all chip chrome from assistive technology and keeps it out of the tab order', async () => {
		const { section } = await mount();
		for (const part of section.querySelectorAll('.chrome, .designator, .pins')) {
			expect(part.getAttribute('aria-hidden')).toBe('true');
		}
		expect(section.querySelector('.body')?.hasAttribute('aria-hidden')).toBe(false);
		expect(
			section.querySelectorAll('.chrome [tabindex], .designator [tabindex], .pins [tabindex]')
		).toHaveLength(0);
	});

	it('takes the accent from the side unless one is given', async () => {
		expect((await mount({ id: 'a', side: 'both' })).section.dataset.accent).toBe('split');
		expect((await mount({ id: 'b', side: 'left' })).section.dataset.accent).toBe('cyan');
		expect((await mount({ id: 'c', side: 'right' })).section.dataset.accent).toBe('green');
		expect((await mount({ id: 'd', accent: 'green' })).section.dataset.accent).toBe('green');
	});
});

describe('pins', () => {
	const pinsOf = (section: HTMLElement) =>
		Array.from(section.querySelectorAll<HTMLElement>('[data-pin]'));

	it('has at least two pins per side on a short chip', async () => {
		const { section } = await mount({ bodyHeight: 10 });
		await expect
			.poll(() => section.querySelectorAll('[data-pin-side="left"]').length)
			.toBeGreaterThanOrEqual(2);
		expect(section.querySelectorAll('[data-pin-side="left"]')).toHaveLength(2);
		expect(section.querySelectorAll('[data-pin-side="right"]')).toHaveLength(2);
	});

	it('adds a pin per 48px of height on each side', async () => {
		const { section } = await mount({ bodyHeight: 500 });
		const perSide = Math.floor(section.offsetHeight / 48);
		expect(perSide).toBeGreaterThan(2);
		await expect
			.poll(() => section.querySelectorAll('[data-pin-side="left"]').length)
			.toBe(perSide);
		expect(section.querySelectorAll('[data-pin-side="right"]')).toHaveLength(perSide);
	});

	it('numbers the pins in DOM order so the registry can find them', async () => {
		const { section } = await mount({ bodyHeight: 300 });
		await expect.poll(() => pinsOf(section).length).toBeGreaterThan(4);
		const pins = pinsOf(section);
		expect(pins.map((pin) => pin.dataset.pin)).toEqual(pins.map((_, i) => String(i)));
		expect(chips()[0].pins()).toEqual(pins);
	});
});

describe('registry', () => {
	it('registers on mount and unregisters on unmount', async () => {
		const { screen, section } = await mount({ side: 'left' });
		const [handle] = chips();
		expect(chips()).toHaveLength(1);
		expect(handle.id).toBe('about');
		expect(handle.designator).toBe('U3');
		expect(handle.side).toBe('left');
		expect(handle.el).toBe(section);
		screen.unmount();
		expect(chips()).toHaveLength(0);
	});

	it('shows the state of the handle in data-state', async () => {
		const { section } = await mount();
		const [handle] = chips();
		await expect.poll(() => section.dataset.state).toBe('off');
		handle.state = 'booting';
		await expect.poll(() => section.dataset.state).toBe('booting');
		handle.state = 'on';
		await expect.poll(() => section.dataset.state).toBe('on');
	});
});

describe('boot states', () => {
	it('renders on before any script has run: no data-state, no html.js', async () => {
		const { section } = await mount();
		section.removeAttribute('data-state');
		const on = lit(section);
		expect(on.ring).toBe('1');
		expect(on.pin).toBe('rgb(0, 231, 255)');
		expect(on.led).not.toBe('rgba(0, 0, 0, 0)');
	});

	it('starts dark only under html.js without reduced motion', async () => {
		root.classList.add('js');
		const { section } = await mount();
		await expect.poll(() => section.dataset.state).toBe('off');
		const off = lit(section);
		expect(off.ring).toBe('0');
		expect(off.pin).not.toBe('rgb(0, 231, 255)');
		expect(off.led).toBe('rgba(0, 0, 0, 0)');
	});

	it('lights the pins while booting and the ring and LED once on', async () => {
		root.classList.add('js');
		const { section } = await mount();
		const [handle] = chips();
		handle.state = 'booting';
		await expect.poll(() => section.dataset.state).toBe('booting');
		const booting = lit(section);
		expect(booting.pin).toBe('rgb(0, 231, 255)');
		expect(booting.ring).toBe('0');
		expect(booting.led).toBe('rgba(0, 0, 0, 0)');

		handle.state = 'on';
		await expect.poll(() => section.dataset.state).toBe('on');
		const on = lit(section);
		expect(on.ring).toBe('1');
		expect(on.led).not.toBe('rgba(0, 0, 0, 0)');
	});

	it('is on under reduced motion even when the state says off', async () => {
		root.classList.add('js', 'reduced');
		const { section } = await mount();
		await expect.poll(() => section.dataset.state).toBe('off');
		const reduced = lit(section);
		expect(reduced.ring).toBe('1');
		expect(reduced.pin).toBe('rgb(0, 231, 255)');
	});

	it('colours left pins cyan and right pins green', async () => {
		const { section } = await mount();
		const left = section.querySelector('[data-pin-side="left"]')!;
		const right = section.querySelector('[data-pin-side="right"]')!;
		expect(getComputedStyle(left).backgroundColor).toBe('rgb(0, 231, 255)');
		expect(getComputedStyle(right).backgroundColor).toBe('rgb(63, 216, 63)');
	});
});

describe('flashPin', () => {
	it('flashes the pin that the board hit, then clears it', async () => {
		root.classList.add('js');
		const { section } = await mount({ bodyHeight: 200 });
		const [handle] = chips();
		await expect.poll(() => handle.pins().length).toBeGreaterThan(4);
		const pin = handle.pins()[3];
		const resting = getComputedStyle(pin).backgroundColor;

		handle.flashPin(3);
		expect(pin.getAttribute('data-flash')).toBe('true');
		expect(getComputedStyle(pin).backgroundColor).toBe('rgb(255, 255, 255)');
		expect(section.querySelectorAll('[data-flash]')).toHaveLength(1);

		await expect.poll(() => pin.hasAttribute('data-flash')).toBe(false);
		expect(getComputedStyle(pin).backgroundColor).toBe(resting);
	});
});
