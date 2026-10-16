import '../../app.css';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
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

// The outline is an inline SVG: a chamfered path made of five lines (top, right, bottom, left and
// the 45-degree cut), laid out with percentages so it needs no JS and no measuring. A registered
// number, --draw, says how much of it is drawn: segment 0 first, segment 4 last.
type Layer = 'base' | 'accent';
const lines = (section: HTMLElement, layer: Layer) =>
	Array.from(section.querySelectorAll<SVGLineElement>(`.outline.${layer} .seg`));
const offsets = (section: HTMLElement, layer: Layer) =>
	lines(section, layer).map((line) => parseFloat(getComputedStyle(line).strokeDashoffset));

describe('outline', () => {
	it('has five segments in each of two layers: the silkscreen line and the lit ring', async () => {
		const { section } = await mount();
		expect(lines(section, 'base')).toHaveLength(5);
		expect(lines(section, 'accent')).toHaveLength(5);
	});

	it('is an inline SVG inside the hidden chrome', async () => {
		const { section } = await mount();
		expect(section.querySelectorAll('svg.outline')).toHaveLength(2);
		for (const svg of section.querySelectorAll('svg.outline')) {
			expect(svg.closest('.chrome')?.getAttribute('aria-hidden')).toBe('true');
			expect(getComputedStyle(svg).pointerEvents).toBe('none');
		}
	});

	it('cuts the top left corner at 45 degrees, 18px each way', async () => {
		const { section } = await mount({ bodyHeight: 120 });
		const chip = section.getBoundingClientRect();
		const [top, , , left, cut] = lines(section, 'base');
		const cutBox = cut.getBoundingClientRect();
		expect(cutBox.width).toBeCloseTo(18, 0);
		expect(cutBox.height).toBeCloseTo(18, 0);
		expect(cutBox.left - chip.left).toBeLessThan(1.5);
		expect(cutBox.top - chip.top).toBeLessThan(1.5);
		// Nothing else runs through the corner square: the top line starts after the cut, the
		// left line ends before it.
		expect(top.getBoundingClientRect().left - chip.left).toBeGreaterThanOrEqual(17);
		expect(left.getBoundingClientRect().top - chip.top).toBeGreaterThanOrEqual(17);
	});

	it('runs round the whole chip', async () => {
		const { section } = await mount({ bodyHeight: 120 });
		const chip = section.getBoundingClientRect();
		const boxes = lines(section, 'base').map((line) => line.getBoundingClientRect());
		expect(Math.min(...boxes.map((box) => box.left)) - chip.left).toBeLessThan(1.5);
		expect(chip.right - Math.max(...boxes.map((box) => box.right))).toBeLessThan(1.5);
		expect(Math.min(...boxes.map((box) => box.top)) - chip.top).toBeLessThan(1.5);
		expect(chip.bottom - Math.max(...boxes.map((box) => box.bottom))).toBeLessThan(1.5);
	});

	it('paints the ring with a gradient that exists, one per chip', async () => {
		const first = await mount({ id: 'one' });
		const second = await mount({ id: 'two' });
		const ids = new Set<string>();
		for (const { section } of [first, second]) {
			for (const line of lines(section, 'accent')) {
				const ref = line.getAttribute('stroke')!.match(/url\(#([^)]+)\)/)![1];
				expect(document.getElementById(ref)).not.toBeNull();
				ids.add(ref);
			}
		}
		expect(ids.size).toBe(2);
	});

	it('draws the segments one after another as --draw rises', async () => {
		const { section } = await mount();
		const progress = (draw: number) => {
			section.style.setProperty('--draw', String(draw));
			return offsets(section, 'base');
		};
		expect(progress(0)).toEqual([1, 1, 1, 1, 1]);
		expect(progress(1)).toEqual([0, 0, 0, 0, 0]);
		const half = progress(0.5);
		expect(half.slice(0, 2)).toEqual([0, 0]);
		expect(half[2]).toBeCloseTo(0.5, 5);
		expect(half.slice(3)).toEqual([1, 1]);
		// The ring follows the same progress.
		expect(offsets(section, 'accent')).toEqual(half);
	});

	describe('without scroll-driven animation: it follows data-state', () => {
		// The shared style turns animations off, so only the state rules are left, which is what a
		// browser without animation-timeline runs.
		beforeEach(() => root.classList.add('js'));

		it('is undrawn while off, drawn once booting, and stays drawn when on', async () => {
			const { section } = await mount();
			const [handle] = chips();
			await expect.poll(() => section.dataset.state).toBe('off');
			expect(offsets(section, 'base')).toEqual([1, 1, 1, 1, 1]);
			expect(offsets(section, 'accent')).toEqual([1, 1, 1, 1, 1]);

			handle.state = 'booting';
			await expect.poll(() => offsets(section, 'base')).toEqual([0, 0, 0, 0, 0]);
			handle.state = 'on';
			await expect.poll(() => section.dataset.state).toBe('on');
			expect(offsets(section, 'base')).toEqual([0, 0, 0, 0, 0]);
			expect(offsets(section, 'accent')).toEqual([0, 0, 0, 0, 0]);
		});

		it('is complete without JS: no html.js, no data-state', async () => {
			root.classList.remove('js');
			const { section } = await mount();
			section.removeAttribute('data-state');
			expect(offsets(section, 'base')).toEqual([0, 0, 0, 0, 0]);
		});

		it('is complete under reduced motion even when the state says off', async () => {
			root.classList.add('reduced');
			const { section } = await mount();
			await expect.poll(() => section.dataset.state).toBe('off');
			expect(offsets(section, 'base')).toEqual([0, 0, 0, 0, 0]);
			expect(offsets(section, 'accent')).toEqual([0, 0, 0, 0, 0]);
		});
	});

	it('transitions --draw with the state, except under reduced motion', async () => {
		noMotion.remove();
		root.classList.add('js');
		const { section } = await mount();
		expect(getComputedStyle(section).transitionProperty).toContain('--draw');
		root.classList.add('reduced');
		const durations = getComputedStyle(section).transitionDuration.split(',');
		expect(durations.every((d) => d.trim() === '0s')).toBe(true);
	});

	it('draws the outline slowly enough to watch when the state changes: 1.5 s or more', async () => {
		noMotion.remove();
		root.classList.add('js');
		const { section } = await mount();
		const style = getComputedStyle(section);
		const names = style.transitionProperty.split(',').map((n) => n.trim());
		const durations = style.transitionDuration.split(',').map((d) => parseFloat(d));
		expect(durations[names.indexOf('--draw')]).toBeGreaterThanOrEqual(1.5);
	});
});

describe.skipIf(!CSS.supports('animation-timeline', 'view()'))('scroll-driven outline', () => {
	let room: HTMLElement;
	let tail: HTMLElement;
	const chrome = (section: HTMLElement) => section.querySelector<HTMLElement>('.chrome')!;
	const draw = (section: HTMLElement) =>
		parseFloat(getComputedStyle(chrome(section)).getPropertyValue('--draw'));

	beforeEach(async () => {
		// The real thing: animations on, and scripts on (the draw is scripted away without them).
		noMotion.remove();
		root.classList.add('js');
		await page.viewport(1280, 900);
		// Room above the chip, so it starts below the window and can scroll in.
		room = document.createElement('div');
		room.style.height = '2500px';
		document.body.append(room);
		window.scrollTo(0, 0);
	});

	afterEach(async () => {
		room.remove();
		tail?.remove();
		window.scrollTo(0, 0);
		await page.viewport(414, 896);
	});

	/** Mounts the chip and adds room below it, so the page can scroll the chip well into view. */
	async function mountInRoom(props: Props = {}, tailHeight = 2000) {
		const mounted = await mount(props);
		tail = document.createElement('div');
		tail.style.height = `${tailHeight}px`;
		document.body.append(tail);
		return mounted;
	}

	/** Scrolls until the top edge of the chip is `fraction` of the window height from the top. */
	function placeTop(section: HTMLElement, fraction: number) {
		const top = section.getBoundingClientRect().top + window.scrollY;
		window.scrollTo(0, top - window.innerHeight * fraction);
	}

	it('draws with a view() timeline on the chip', async () => {
		const { section } = await mount();
		expect(getComputedStyle(chrome(section)).animationTimeline).toContain('view');
		expect(chrome(section).getAnimations().length).toBeGreaterThanOrEqual(1);
	});

	it('waits until the chip is clearly in view: nothing is drawn above 80% of the window', async () => {
		const { section } = await mountInRoom({ bodyHeight: 400 });
		await expect.poll(() => draw(section)).toBe(0);

		// Only the top edge of the chip is in the window.
		placeTop(section, 0.95);
		await expect.poll(() => window.scrollY).toBeGreaterThan(0);
		expect(draw(section)).toBe(0);

		// The chip top sits at 85% of the window.
		placeTop(section, 0.85);
		await expect.poll(() => Math.round(section.getBoundingClientRect().top)).toBe(765);
		expect(draw(section)).toBe(0);
	});

	it('draws while the chip crosses the middle of the window, in steps you can watch', async () => {
		const { section } = await mountInRoom({ bodyHeight: 400 });
		const seen: number[] = [];
		for (const fraction of [0.7, 0.55, 0.4]) {
			placeTop(section, fraction);
			await expect
				.poll(() => Math.round(section.getBoundingClientRect().top))
				.toBe(Math.round(window.innerHeight * fraction));
			seen.push(draw(section));
		}
		// Each step is further along, and none is finished before the chip top passes 40%.
		expect(seen[0]).toBeGreaterThan(0);
		expect(seen[1]).toBeGreaterThan(seen[0]);
		expect(seen[2]).toBeGreaterThan(seen[1]);
		expect(seen[2]).toBeLessThan(1);
	});

	it('is whole once the chip top is above 30% of the window, and follows the scroll back out', async () => {
		const { section } = await mountInRoom({ bodyHeight: 400 });
		placeTop(section, 0.25);
		await expect.poll(() => draw(section)).toBe(1);
		expect(offsets(section, 'base')).toEqual([0, 0, 0, 0, 0]);

		window.scrollTo(0, 0);
		await expect.poll(() => draw(section)).toBe(0);
	});

	it('still ends whole for a chip at the foot of the page that cannot scroll that far', async () => {
		// Only 100px under the chip: at the end of the page its top sits near 40% of the window.
		const { section } = await mountInRoom({ bodyHeight: 300 }, 100);
		const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
		window.scrollTo(0, maxScroll());
		await expect.poll(() => window.scrollY).toBe(Math.round(maxScroll()));
		expect(section.getBoundingClientRect().top).toBeGreaterThan(window.innerHeight * 0.3);
		await expect.poll(() => draw(section)).toBe(1);
	});

	it('ignores data-state for the outline: a chip that is off is drawn once it has scrolled in', async () => {
		const { section } = await mountInRoom({ bodyHeight: 400 });
		await expect.poll(() => section.dataset.state).toBe('off');
		placeTop(section, 0.2);
		await expect.poll(() => draw(section)).toBe(1);
	});

	it('does not run without scripts: the outline is whole, like the board', async () => {
		root.classList.remove('js');
		const { section } = await mount({ bodyHeight: 400 });
		expect(chrome(section).getAnimations()).toHaveLength(0);
		expect(draw(section)).toBe(1);
	});

	it('does not animate under reduced motion: whole from the first paint', async () => {
		root.classList.add('reduced');
		const { section } = await mount({ bodyHeight: 400 });
		expect(chrome(section).getAnimations()).toHaveLength(0);
		expect(draw(section)).toBe(1);
		expect(offsets(section, 'base')).toEqual([0, 0, 0, 0, 0]);
	});
});
