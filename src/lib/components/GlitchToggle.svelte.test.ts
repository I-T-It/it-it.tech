import '../../app.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { flushSync, mount, unmount } from 'svelte';
import { GLITCH_START_AFTER_POWER_MS, nextGlitch } from '#lib/glitch/schedule.js';
import { glitch, PAUSED_KEY } from '#lib/glitch/state.svelte.js';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import { createRng } from '#lib/pcb/rng.js';
import GlitchPhoto from './GlitchPhoto.svelte';
import GlitchToggle from './GlitchToggle.svelte';

const root = document.documentElement;
const mounted: (() => void)[] = [];

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

/** The toggle alone, in a frame like the hero's socket. */
function mountToggle() {
	const socket = document.createElement('div');
	socket.className = 'photo-socket';
	socket.style.cssText = 'position:relative;width:300px;height:300px;margin:20px';
	document.body.append(socket);
	const app = mount(GlitchToggle, { target: socket });
	flushSync();
	mounted.push(() => {
		unmount(app);
		socket.remove();
	});
	return socket;
}

const button = () => document.querySelector<HTMLButtonElement>('button.glitch-toggle');

beforeEach(() => {
	localStorage.removeItem(PAUSED_KEY);
	glitch.paused = false;
	glitch.armed = false;
	glitch.reduced = false;
});

afterEach(() => {
	for (const stop of mounted.splice(0)) stop();
	vi.useRealTimers();
	root.classList.remove('reduced');
	setLocale('nl');
	localStorage.removeItem(PAUSED_KEY);
});

describe('when it shows', () => {
	it('is not there before the glitch has started', () => {
		mountToggle();
		expect(button()).toBeNull();
	});

	it('is there once the glitch has started', async () => {
		mountToggle();
		glitch.armed = true;
		flushSync();
		expect(button()).not.toBeNull();
		await expect.element(page.getByRole('button')).toBeVisible();
	});

	it('is not there under reduced motion, even when armed', async () => {
		root.classList.add('reduced');
		mountToggle();
		glitch.armed = true;
		flushSync();
		await vi.waitFor(() => expect(glitch.reduced).toBe(true));
		flushSync();
		expect(button()).toBeNull();
	});

	it('goes when reduced motion is turned on, and comes back when it is turned off', async () => {
		mountToggle();
		glitch.armed = true;
		flushSync();
		expect(button()).not.toBeNull();
		root.classList.add('reduced');
		await vi.waitFor(() => expect(button()).toBeNull());
		root.classList.remove('reduced');
		await vi.waitFor(() => expect(button()).not.toBeNull());
	});

	it('is part of the page for print: not at all', async () => {
		mountToggle();
		glitch.armed = true;
		flushSync();
		const rules = [...document.styleSheets].flatMap((sheet) => {
			try {
				return [...sheet.cssRules];
			} catch {
				return [];
			}
		});
		const print = rules.filter(
			(rule): rule is CSSMediaRule =>
				rule instanceof CSSMediaRule && rule.media.mediaText === 'print'
		);
		const hidden = print.flatMap((media) => [...media.cssRules]).map((r) => r.cssText);
		expect(
			hidden.some((text) => text.includes('glitch-toggle') && text.includes('display: none'))
		).toBe(true);
	});
});

describe('the button', () => {
	for (const [locale, name] of [
		['nl', 'Foto-glitch pauzeren'],
		['en', 'Pause the photo glitch']
	] as const) {
		it(`is named ${name} in ${locale}, and the name stays the same when it is pressed`, async () => {
			setLocale(locale);
			mountToggle();
			glitch.armed = true;
			flushSync();
			const control = page.getByRole('button', { name });
			await expect.element(control).toHaveAttribute('aria-pressed', 'false');
			expect(button()!.getAttribute('type')).toBe('button');
			await control.click();
			await expect
				.element(page.getByRole('button', { name }))
				.toHaveAttribute('aria-pressed', 'true');
		});
	}

	it('is pressed from the start when the glitch was stopped on an earlier visit', async () => {
		glitch.paused = true;
		mountToggle();
		glitch.armed = true;
		flushSync();
		await expect
			.element(page.getByRole('button', { name: 'Foto-glitch pauzeren' }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('is pressed and released with a click, Enter and Space, and remembers it', async () => {
		mountToggle();
		glitch.armed = true;
		flushSync();
		const control = page.getByRole('button');
		await control.click();
		expect(glitch.paused).toBe(true);
		expect(localStorage.getItem(PAUSED_KEY)).toBe('true');
		await expect.element(control).toHaveAttribute('aria-pressed', 'true');

		button()!.focus();
		await userEvent.keyboard('{Enter}');
		expect(glitch.paused).toBe(false);
		await expect.element(control).toHaveAttribute('aria-pressed', 'false');
		expect(localStorage.getItem(PAUSED_KEY)).toBeNull();

		await userEvent.keyboard(' ');
		expect(glitch.paused).toBe(true);
		await expect.element(control).toHaveAttribute('aria-pressed', 'true');
	});

	it('has the name in text for screen readers, and the switch and the LED are decoration', async () => {
		mountToggle();
		glitch.armed = true;
		flushSync();
		const decoration = [...button()!.querySelectorAll('.switch, .led')];
		expect(decoration.length).toBeGreaterThanOrEqual(2);
		for (const part of decoration) expect(part.getAttribute('aria-hidden')).toBe('true');
		expect(button()!.querySelector('.sr-only')!.textContent).toBe('Foto-glitch pauzeren');
	});

	it('is at least 24 by 24 CSS px', () => {
		mountToggle();
		glitch.armed = true;
		flushSync();
		const box = button()!.getBoundingClientRect();
		expect(box.width).toBeGreaterThanOrEqual(24);
		expect(box.height).toBeGreaterThanOrEqual(24);
	});

	it('sits on the bottom right corner pad of the footprint: its centre is half a cell in', () => {
		const socket = mountToggle();
		glitch.armed = true;
		flushSync();
		const frame = socket.getBoundingClientRect();
		const box = button()!.getBoundingClientRect();
		const cell = frame.width / 11;
		expect(box.left + box.width / 2).toBeCloseTo(frame.right - cell / 2, 0);
		expect(box.top + box.height / 2).toBeCloseTo(frame.bottom - cell / 2, 0);
	});

	it('shows the LED lit while the glitch runs and dim when it is stopped, and the switch moves too', async () => {
		mountToggle();
		glitch.armed = true;
		flushSync();
		const led = () => getComputedStyle(button()!.querySelector('.led')!).backgroundColor;
		const lever = () => button()!.querySelector('.lever')!.getBoundingClientRect().top;
		const lit = led();
		const up = lever();
		await page.getByRole('button').click();
		expect(led()).not.toBe(lit);
		expect(lever()).toBeGreaterThan(up);
	});
});

describe('the focus ring', () => {
	const channel = (value: number) => {
		const c = value / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	function luminance(css: string): number {
		const [r, g, b] = css.match(/[\d.]+/g)!.map(Number);
		return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
	}
	const contrast = (a: string, b: string) => {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (hi + 0.05) / (lo + 0.05);
	};
	/** A token as the browser computes it, as rgb(). */
	function token(name: string): string {
		const probe = document.createElement('span');
		probe.style.color = `var(${name})`;
		document.body.append(probe);
		const value = getComputedStyle(probe).color;
		probe.remove();
		return value;
	}

	it('is 2px and solid when the keyboard focuses the button', async () => {
		mountToggle();
		glitch.armed = true;
		flushSync();
		await userEvent.tab();
		expect(document.activeElement).toBe(button());
		const style = getComputedStyle(button()!);
		expect(style.outlineStyle).toBe('solid');
		expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2);
	});

	it('has 3:1 contrast against both ends of the page gradient and against the button itself', async () => {
		mountToggle();
		glitch.armed = true;
		flushSync();
		await userEvent.tab();
		const style = getComputedStyle(button()!);
		const ring = style.outlineColor;
		expect(contrast(ring, token('--board-navy'))).toBeGreaterThanOrEqual(3);
		expect(contrast(ring, token('--board-moss'))).toBeGreaterThanOrEqual(3);
		// The button has its own dark backing, so the ring also shows on the photo's light edge.
		expect(contrast(ring, style.backgroundColor)).toBeGreaterThanOrEqual(3);
	});
});

describe('with the photo', () => {
	const photoAlt = 'Portret van Robbin Schepers';
	const avatarAlt = 'Avatar van Roboroads: een low-poly portret';
	const realSetTimeout = globalThis.setTimeout;

	/** A seed whose first glitch is a swap to the avatar, which then holds the signal. */
	function swapFirstSeed(): number {
		for (let seed = 1; seed < 5000; seed++) {
			if (nextGlitch(createRng(seed), 0, 'photo').kind === 'swap') return seed;
		}
		throw new Error('no seed swaps first');
	}

	function mountBoth(seed = 5) {
		const socket = document.createElement('div');
		socket.className = 'photo-socket';
		socket.style.cssText = 'position:relative;width:300px;height:300px;margin:20px';
		const die = document.createElement('div');
		die.className = 'die';
		die.style.cssText = 'position:absolute;inset:0';
		socket.append(die);
		document.body.append(socket);
		const photo = mount(GlitchPhoto, { target: die, props: { photoAlt, avatarAlt, seed } });
		const toggle = mount(GlitchToggle, { target: socket });
		flushSync();
		mounted.push(() => {
			unmount(toggle);
			unmount(photo);
			socket.remove();
		});
		return socket;
	}

	const names = () =>
		page
			.getByRole('img')
			.elements()
			.map((el) => el.getAttribute('alt'));

	it('puts the photo and its alt text back at once when it is pressed while the avatar holds the signal', async () => {
		vi.useFakeTimers({
			toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
		});
		const seed = swapFirstSeed();
		const swap = nextGlitch(createRng(seed), 0, 'photo');
		const socket = mountBoth(seed);
		socket.setAttribute('data-power', 'on');
		await vi.advanceTimersByTimeAsync(GLITCH_START_AFTER_POWER_MS);
		const avatar = () => socket.querySelector<HTMLImageElement>('img.avatar');
		for (let i = 0; i < 600 && !(avatar()?.complete && avatar()!.naturalWidth > 0); i++) {
			await new Promise<void>((resolve) => realSetTimeout(resolve, 50));
		}
		await new Promise<void>((resolve) => realSetTimeout(resolve, 30));
		await vi.advanceTimersByTimeAsync(swap.at + swap.duration + 500);
		expect(names()).toEqual([avatarAlt]);
		expect(button()!.getAttribute('aria-pressed')).toBe('false');

		button()!.click();
		await vi.advanceTimersByTimeAsync(0);
		expect(names()).toEqual([photoAlt]);
		expect(socket.querySelector<HTMLElement>('.glitch')!.dataset.show).toBe('photo');
		expect(button()!.getAttribute('aria-pressed')).toBe('true');
		// No swap back on the way: the photo has the signal again at once.
		expect(socket.querySelector('[data-glitch]')).toBeNull();
	}, 60_000);

	it('shows itself pressed, at arm time, when the glitch was stopped on an earlier visit, with no avatar asked for', async () => {
		vi.useFakeTimers({
			toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
		});
		performance.clearResourceTimings();
		localStorage.setItem(PAUSED_KEY, 'true');
		const socket = mountBoth();
		socket.setAttribute('data-power', 'on');
		await vi.advanceTimersByTimeAsync(GLITCH_START_AFTER_POWER_MS - 1);
		expect(button()).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(button()).not.toBeNull();
		expect(button()!.getAttribute('aria-pressed')).toBe('true');
		expect(socket.querySelector('img.avatar')).toBeNull();
		expect(
			performance
				.getEntriesByType('resource')
				.some((entry) => entry.name.includes('roboroads-avatar'))
		).toBe(false);

		// Turning it back on starts the glitch and asks for the avatar.
		button()!.click();
		await vi.advanceTimersByTimeAsync(0);
		expect(button()!.getAttribute('aria-pressed')).toBe('false');
		expect(socket.querySelector('img.avatar')).not.toBeNull();
	}, 60_000);
});
