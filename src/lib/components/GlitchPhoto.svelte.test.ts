import '../../app.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { flushSync, mount, unmount } from 'svelte';
import {
	FLASH_MS,
	GLITCH_START_AFTER_POWER_MS,
	GLITCH_WAIT_MAX_MS,
	GLITCH_WAIT_MIN_MS,
	MAX_TEAR_AREA,
	MAX_TRANSITIONS_PER_S,
	frameArea,
	nextGlitch,
	type GlitchEvent,
	type Shown
} from '#lib/glitch/schedule.js';
import { fx, glitch, PAUSED_KEY, setPaused } from '#lib/glitch/state.svelte.js';
import { createRng } from '#lib/pcb/rng.js';
import GlitchFx from './GlitchFx.svelte';
import GlitchPhoto from './GlitchPhoto.svelte';

const photoAlt = 'Portret van Robbin Schepers';
const avatarAlt =
	'Avatar van Roboroads: een low-poly portret in groen met een gloeiende cowboyhoed';
const root = document.documentElement;

// The real timer, kept from before the tests fake the clock: the avatar takes real time to load.
const realSetTimeout = globalThis.setTimeout;
const realWait = (ms: number) => new Promise<void>((resolve) => realSetTimeout(resolve, ms));

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const settle = () => vi.advanceTimersByTimeAsync(0);

interface Rig {
	socket: HTMLElement;
	/** The photo's frame; the glitch lives inside it. */
	die: HTMLElement;
	glitch: () => HTMLElement;
	/** The layer the fragments are drawn on: in the socket, beside the die, not in it. */
	fx: () => HTMLElement;
	/** The fragments being drawn now. */
	fragments: () => HTMLElement[];
	avatar: () => HTMLImageElement | null;
	power: () => void;
	/** The board powers the socket, and the glitch gets as far as arming. */
	arm: () => Promise<void>;
	/** The avatar has loaded and decoded, which takes real time. */
	loaded: () => Promise<void>;
	/** Runs the fake clock up to this many ms after the glitch armed (the arming moment is 0; never backwards). */
	to: (ms: number) => Promise<void>;
	stop: () => void;
}

const rigs: Rig[] = [];

function rig(props: { seed?: number } = {}): Rig {
	const socket = document.createElement('div');
	socket.className = 'socket photo-socket';
	socket.style.cssText = 'position:relative;width:300px;height:300px;margin:8px';
	const die = document.createElement('div');
	die.className = 'die';
	die.style.cssText = 'position:absolute;inset:0';
	socket.append(die);
	document.body.append(socket);
	const app = mount(GlitchPhoto, { target: die, props: { photoAlt, avatarAlt, ...props } });
	// Like the hero: the fragment layer is a child of the socket, after the die.
	const layer = mount(GlitchFx, { target: socket });
	flushSync();
	let stopped = false;
	/** The fake clock, in ms after the glitch armed. */
	let now = 0;
	const made: Rig = {
		socket,
		die,
		glitch: () => die.querySelector<HTMLElement>('.glitch')!,
		fx: () => socket.querySelector<HTMLElement>('.fx')!,
		fragments: () => [...socket.querySelectorAll<HTMLElement>('.fx .frag')],
		avatar: () => die.querySelector<HTMLImageElement>('img.avatar'),
		power: () => socket.setAttribute('data-power', 'on'),
		arm: async () => {
			made.power();
			await advance(GLITCH_START_AFTER_POWER_MS);
			now = 0;
		},
		loaded: async () => {
			for (let i = 0; i < 600; i++) {
				const img = made.avatar();
				if (img?.complete && img.naturalWidth > 0) break;
				await realWait(50);
			}
			// Let the component's decode() settle too.
			await realWait(30);
			await settle();
		},
		to: async (ms) => {
			await advance(ms - now);
			now = ms;
		},
		stop: () => {
			if (stopped) return;
			stopped = true;
			unmount(app);
			unmount(layer);
			socket.remove();
		}
	};
	rigs.push(made);
	return made;
}

/** The images a screen reader would find: not the hidden ones, not the decorative ones. */
const names = () =>
	page
		.getByRole('img')
		.elements()
		.map((el) => el.getAttribute('alt'));

const avatarRequested = () =>
	performance.getEntriesByType('resource').some((entry) => entry.name.includes('roboroads-avatar'));

/**
 * The glitches the component plays for a seed, in order, in ms after the glitch armed: each one
 * planned from the image the one before it left holding the signal, like the component does.
 */
function glitchesOf(seed: number, count = 3): GlitchEvent[] {
	const rng = createRng(seed);
	const events: GlitchEvent[] = [];
	let holder: Shown = 'photo';
	let start = 0;
	for (let i = 0; i < count; i++) {
		const event = nextGlitch(rng, start, holder);
		events.push(event);
		holder = event.to;
		start = event.at + event.duration;
	}
	return events;
}

/** A seed whose first glitches satisfy `match`, so a test can aim at a tear, a flash or a swap. */
function seedWhere(match: (events: GlitchEvent[]) => boolean, count = 3): number {
	for (let seed = 1; seed < 5000; seed++) {
		if (match(glitchesOf(seed, count))) return seed;
	}
	throw new Error('no seed matches');
}

const end = (event: GlitchEvent) => event.at + event.duration;
/** When the whole image turns, from the start of the glitch. */
const turn = (event: GlitchEvent) => event.frames.find((f) => f.show !== event.from)!.at;
const otherSources = (event: GlitchEvent, holder: Shown) =>
	[...event.frames[0].slices, ...event.frames[0].blocks].filter((f) => f.source !== holder);

/** How many ms until a glitch first shows, looking every 25 ms (a tear lasts 150 ms or more); null if none does. */
async function firstGlitchWithin(r: Rig, ms: number): Promise<number | null> {
	for (let t = 0; t <= ms; t += 25) {
		if (r.glitch().hasAttribute('data-glitch')) return t;
		await advance(25);
	}
	return null;
}

function setHidden(hidden: boolean) {
	Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
	Object.defineProperty(document, 'visibilityState', {
		configurable: true,
		get: () => (hidden ? 'hidden' : 'visible')
	});
	document.dispatchEvent(new Event('visibilitychange'));
}

interface ObserverStub {
	callback: IntersectionObserverCallback;
	targets: Element[];
}
const observers: ObserverStub[] = [];
function stubIntersectionObserver() {
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			stub: ObserverStub;
			constructor(callback: IntersectionObserverCallback) {
				this.stub = { callback, targets: [] };
				observers.push(this.stub);
			}
			observe(el: Element) {
				this.stub.targets.push(el);
			}
			unobserve() {}
			disconnect() {}
			takeRecords() {
				return [];
			}
		}
	);
}
const intersect = (isIntersecting: boolean) => {
	for (const { callback, targets } of observers) {
		callback(
			targets.map((target) => ({ target, isIntersecting }) as IntersectionObserverEntry),
			{} as IntersectionObserver
		);
	}
};

beforeEach(() => {
	vi.useFakeTimers({
		toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']
	});
	performance.clearResourceTimings();
	localStorage.removeItem(PAUSED_KEY);
	glitch.paused = false;
	glitch.armed = false;
	glitch.reduced = false;
	fx.photoSrc = '';
	fx.avatarSrc = '';
	fx.kind = null;
	fx.slices = [];
	fx.blocks = [];
});

afterEach(() => {
	for (const made of rigs.splice(0)) made.stop();
	observers.length = 0;
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	root.classList.remove('reduced');
	delete (document as { hidden?: boolean }).hidden;
	delete (document as { visibilityState?: string }).visibilityState;
	localStorage.removeItem(PAUSED_KEY);
});

describe('at rest', () => {
	it('shows the photo with its alt text, and nothing else is announced', async () => {
		const r = rig();
		await settle();
		expect(names()).toEqual([photoAlt]);
		expect(r.glitch().dataset.show).toBe('photo');
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(r.avatar()).toBeNull();
	});

	it('offers the photo as AVIF and WebP with a JPEG behind them', async () => {
		const r = rig();
		const types = [...r.glitch().querySelectorAll('picture source')].map((s) =>
			s.getAttribute('type')
		);
		expect(types).toEqual(expect.arrayContaining(['image/avif', 'image/webp']));
	});
});

describe('the start', () => {
	it('waits for the socket to get power, then for the scroll link, then for the first glitch', async () => {
		const seed = seedWhere(() => true);
		const [first] = glitchesOf(seed, 1);
		const r = rig({ seed });
		// No power: nothing, however long (the safety timer is 12 s).
		await advance(11_000);
		expect(glitch.armed).toBe(false);
		expect(r.avatar()).toBeNull();

		r.power();
		await advance(GLITCH_START_AFTER_POWER_MS - 1);
		expect(glitch.armed).toBe(false);
		expect(r.avatar()).toBeNull();

		await advance(1);
		expect(glitch.armed).toBe(true);
		expect(r.avatar()).not.toBeNull();
		// The first glitch comes 4 to 8 s after that, whichever kind it is.
		expect(first.at).toBeGreaterThanOrEqual(GLITCH_WAIT_MIN_MS);
		expect(first.at).toBeLessThanOrEqual(GLITCH_WAIT_MAX_MS);
		await advance(first.at - 1);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		await advance(1);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(true);
	});

	it('does not ask for the avatar before the glitch starts', async () => {
		const r = rig();
		r.power();
		await advance(GLITCH_START_AFTER_POWER_MS - 1);
		expect(avatarRequested()).toBe(false);
		expect(r.avatar()).toBeNull();
	});

	it('arms anyway when the board never powers the socket, 12 s after mount', async () => {
		const r = rig();
		await advance(11_999);
		expect(glitch.armed).toBe(false);
		await advance(1);
		expect(glitch.armed).toBe(true);
		expect(r.avatar()).not.toBeNull();
	});

	it('is armed at once when the socket already has power', async () => {
		const socket = document.createElement('div');
		socket.className = 'photo-socket';
		socket.setAttribute('data-power', 'on');
		document.body.append(socket);
		const app = mount(GlitchPhoto, { target: socket, props: { photoAlt, avatarAlt } });
		flushSync();
		await advance(GLITCH_START_AFTER_POWER_MS);
		expect(glitch.armed).toBe(true);
		unmount(app);
		socket.remove();
	});
});

describe('a tear', () => {
	const tearFirst = (events: GlitchEvent[]) => events[0].kind === 'tear';

	it('tears the photo for 150 to 300 ms and clears again, with the photo still announced', async () => {
		const seed = seedWhere(tearFirst);
		const [first] = glitchesOf(seed, 1);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await r.to(first.at);
		expect(r.glitch().dataset.glitch).toBe('tear');
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);
		await r.to(end(first) - 1);
		expect(r.glitch().dataset.glitch).toBe('tear');
		await r.to(end(first));
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(names()).toEqual([photoAlt]);
		expect(first.duration).toBeLessThanOrEqual(300);
	}, 60_000);

	it('draws the slices and blocks of each frame, decorative, on a layer beside the die and not in it', async () => {
		const seed = seedWhere(tearFirst);
		const [first] = glitchesOf(seed, 1);
		const r = rig({ seed });
		await r.arm();
		await r.to(first.at);
		const [frame] = first.frames;
		expect(r.fx().parentElement).toBe(r.socket);
		expect(r.die.contains(r.fx())).toBe(false);
		expect(r.fx().getAttribute('aria-hidden')).toBe('true');
		expect(r.fragments().filter((el) => el.dataset.part === 'slice')).toHaveLength(
			frame.slices.length
		);
		expect(r.fragments().filter((el) => el.dataset.part === 'block')).toHaveLength(
			frame.blocks.length
		);
		expect(frameArea(frame)).toBeGreaterThan(0.1);
		expect(frameArea(frame)).toBeLessThanOrEqual(MAX_TEAR_AREA);
		for (const img of r.fx().querySelectorAll('img')) {
			expect(img.getAttribute('alt')).toBe('');
		}
		expect(r.fx().querySelector('a, button, [tabindex]')).toBeNull();
		expect(names()).toEqual([photoAlt]);
	});

	it('plays every frame of the tear in turn and ends with nothing drawn', async () => {
		const seed = seedWhere(tearFirst);
		const [first] = glitchesOf(seed, 1);
		const r = rig({ seed });
		await r.arm();
		await r.to(first.at);
		const counts: number[] = [];
		for (const f of first.frames) {
			counts.push(r.fragments().length);
			expect(r.fragments()).toHaveLength(f.slices.length + f.blocks.length);
			const next = first.frames[first.frames.indexOf(f) + 1]?.at ?? first.duration;
			await r.to(first.at + next);
		}
		expect(r.fragments()).toHaveLength(0);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(counts.length).toBe(first.frames.length);
	});

	it('shows the layer only while a glitch runs', async () => {
		const seed = seedWhere(tearFirst);
		const [first] = glitchesOf(seed, 1);
		const r = rig({ seed });
		await r.arm();
		const layer = () => getComputedStyle(r.fx()).display;
		expect(layer()).toBe('none');
		await r.to(first.at);
		expect(layer()).not.toBe('none');
		await r.to(end(first));
		expect(layer()).toBe('none');
	});

	it('lets the avatar leak into the photo as fragments, once it has decoded, and says nothing of it', async () => {
		const bleeds = (events: GlitchEvent[]) =>
			tearFirst(events) && otherSources(events[0], 'photo').length > 0;
		const seed = seedWhere(bleeds);
		const [first] = glitchesOf(seed, 1);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await r.to(first.at);
		const wanted = otherSources(first, 'photo').length;
		expect(wanted).toBeGreaterThan(0);
		expect(r.fragments().filter((el) => el.dataset.source === 'avatar')).toHaveLength(wanted);
		// The photo is still the whole image, and the only image there is to a screen reader.
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);
		expect(r.avatar()!.getAttribute('aria-hidden')).toBe('true');
	}, 60_000);

	it('tears the avatar just the same while it holds the signal, with the photo leaking in', async () => {
		const seed = seedWhere(
			([swap, tear]) =>
				swap.kind === 'swap' && tear.kind === 'tear' && otherSources(tear, 'avatar').length > 0
		);
		const [swap, tear] = glitchesOf(seed, 2);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await r.to(end(swap) + 1);
		expect(names()).toEqual([avatarAlt]);

		await r.to(tear.at);
		expect(r.glitch().dataset.glitch).toBe('tear');
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([avatarAlt]);
		const wanted = otherSources(tear, 'avatar').length;
		expect(r.fragments().filter((el) => el.dataset.source === 'photo')).toHaveLength(wanted);
		// The photo is the one that is out of the accessibility tree now.
		expect(r.die.querySelector('img.photo')!.getAttribute('aria-hidden')).toBe('true');
		await r.to(end(tear));
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([avatarAlt]);
	}, 60_000);
});

describe('a flash', () => {
	const flashFirst = (events: GlitchEvent[]) => events[0].kind === 'flash';

	it('shows the avatar for about 100 ms and the screen reader notices nothing', async () => {
		const seed = seedWhere(flashFirst);
		const [first] = glitchesOf(seed, 1);
		const on = turn(first);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await r.to(first.at + on - 1);
		expect(r.glitch().dataset.show).toBe('photo');
		await r.to(first.at + on);
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([photoAlt]);
		await r.to(first.at + on + FLASH_MS - 1);
		expect(r.glitch().dataset.show).toBe('avatar');
		await r.to(first.at + on + FLASH_MS);
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);
		await r.to(end(first));
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(r.glitch().dataset.show).toBe('photo');
	}, 60_000);

	it('shows the photo for about 100 ms while the avatar holds the signal, and the avatar stays announced', async () => {
		const seed = seedWhere(([swap, flash]) => swap.kind === 'swap' && flash.kind === 'flash');
		const [swap, flash] = glitchesOf(seed, 2);
		const on = turn(flash);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await r.to(end(swap) + 1);
		expect(names()).toEqual([avatarAlt]);

		await r.to(flash.at + on - 1);
		expect(r.glitch().dataset.show).toBe('avatar');
		await r.to(flash.at + on);
		expect(r.glitch().dataset.show).toBe('photo');
		// The photo flashes over it, but it is the avatar that holds the signal: still the one image found.
		expect(names()).toEqual([avatarAlt]);
		await r.to(flash.at + on + FLASH_MS - 1);
		expect(r.glitch().dataset.show).toBe('photo');
		await r.to(flash.at + on + FLASH_MS);
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([avatarAlt]);
		await r.to(end(flash));
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([avatarAlt]);
	}, 60_000);
});

describe('a swap', () => {
	const swapFirst = (events: GlitchEvent[]) => events[0].kind === 'swap';

	it('gives the avatar its alt text from the middle of the glitch on, and keeps it for good measure', async () => {
		const seed = seedWhere(swapFirst);
		const [swap] = glitchesOf(seed, 1);
		const middle = turn(swap);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();

		await r.to(swap.at);
		expect(r.glitch().dataset.glitch).toBe('swap');
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);

		await r.to(swap.at + middle - 1);
		expect(names()).toEqual([photoAlt]);
		await r.to(swap.at + middle);
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([avatarAlt]);

		// The glitch ends, and the avatar keeps the signal: nothing sends it back by itself.
		await r.to(end(swap));
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([avatarAlt]);
	}, 60_000);

	it('holds the signal until a later swap hands it back, and the photo gets its alt text back then', async () => {
		const seed = seedWhere(([a, b]) => a.kind === 'swap' && b.kind === 'swap');
		const [first, second] = glitchesOf(seed, 2);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();

		await r.to(end(first));
		expect(names()).toEqual([avatarAlt]);
		await r.to(second.at - 1);
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([avatarAlt]);

		await r.to(second.at);
		expect(r.glitch().dataset.glitch).toBe('swap');
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([avatarAlt]);
		await r.to(second.at + turn(second));
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);
		await r.to(end(second));
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(names()).toEqual([photoAlt]);
	}, 60_000);

	it('says nothing aloud: no live region anywhere in the glitch', async () => {
		const seed = seedWhere(swapFirst);
		const [swap] = glitchesOf(seed, 1);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await r.to(end(swap));
		expect(r.glitch().querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
		expect(r.glitch().getAttribute('aria-live')).toBeNull();
	}, 60_000);

	it('lets only the photo or the avatar be in the accessibility tree, never both, through swaps, flashes and tears', async () => {
		const seed = seedWhere(
			([a, b, c]) => a.kind === 'swap' && b.kind === 'flash' && c.kind === 'swap'
		);
		const events = glitchesOf(seed, 3);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		const seen = new Set<number>();
		const kinds = new Set<string>();
		for (let t = 0; t < end(events[2]) + 500; t += 50) {
			seen.add(names().length);
			const kind = r.glitch().dataset.glitch;
			if (kind) kinds.add(kind);
			await r.to(t + 50);
		}
		expect([...seen]).toEqual([1]);
		expect([...kinds].sort()).toEqual(['flash', 'swap']);
	}, 60_000);
});

describe('while the avatar has not decoded', () => {
	it('plays a swap or a flash as a plain tear of the photo, and the photo keeps the signal', async () => {
		// The avatar never gets decoded: every glitch that needs the whole of it is held back.
		vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(
			() => new Promise<void>(() => {})
		);
		const seed = seedWhere(
			(events) => events.some((e) => e.kind === 'swap') && events.some((e) => e.kind === 'flash'),
			4
		);
		const events = glitchesOf(seed, 4);
		const r = rig({ seed });
		await r.arm();
		const kinds = new Set<string>();
		const shown = new Set<string>();
		for (let t = 0; t < end(events[3]) + 500; t += 50) {
			kinds.add(r.glitch().dataset.glitch ?? 'none');
			shown.add(r.glitch().dataset.show ?? 'none');
			expect(names()).toEqual([photoAlt]);
			await r.to(t + 50);
		}
		expect([...kinds].sort()).toEqual(['none', 'tear']);
		expect([...shown]).toEqual(['photo']);
	}, 60_000);
});

describe('flash safety', () => {
	/** The most of `times` in any window of 1000 ms, its end not included. */
	const busiestSecond = (times: number[]) => {
		let busiest = 0;
		for (const t of times)
			busiest = Math.max(busiest, times.filter((c) => c >= t && c < t + 1000).length);
		return busiest;
	};

	it('changes the whole image at most twice in any second, over 3 simulated minutes', async () => {
		const r = rig({ seed: 11 });
		const changes: number[] = [];
		let shown = r.glitch().dataset.show;
		const watch = new MutationObserver(() => {
			const now = r.glitch().dataset.show;
			if (now === shown) return;
			shown = now;
			changes.push(Date.now());
		});
		watch.observe(r.glitch(), { attributes: true, attributeFilter: ['data-show'] });
		await r.arm();
		await r.loaded();
		for (let t = 0; t < 180_000; t += 1000) await advance(1000);
		watch.disconnect();
		expect(changes.length).toBeGreaterThanOrEqual(2);
		expect(busiestSecond(changes)).toBeLessThanOrEqual(2);
	}, 120_000);

	it('changes the picture at most 6 times (3 flashes) in any second, and draws no red, over 2 simulated minutes', async () => {
		const r = rig({ seed: 11 });
		const changes: number[] = [];
		const tints = new Set<string>();
		const watch = new MutationObserver(() => {
			changes.push(Date.now());
			for (const el of r.fragments()) tints.add(el.style.getPropertyValue('--tint'));
		});
		await r.arm();
		await r.loaded();
		watch.observe(r.fx(), { attributes: true, attributeFilter: ['data-frame'] });
		// Frames are 60 ms apart at the least: stepping by 20 ms shows each change on its own.
		for (let t = 0; t < 120_000; t += 20) await advance(20);
		watch.disconnect();
		// Every frame and every end of a glitch is a change: a glitch every 4 to 8 s, 2 minutes long.
		expect(changes.length).toBeGreaterThan(30);
		expect(busiestSecond(changes)).toBeLessThanOrEqual(MAX_TRANSITIONS_PER_S);
		expect(busiestSecond(changes)).toBeGreaterThanOrEqual(4);
		// Colours drawn: cyan, green, magenta and blue, red never leading (WCAG 2.3.1, saturated red).
		expect(tints.size).toBeGreaterThanOrEqual(3);
		for (const color of tints) {
			const [red, green, blue] = color.match(/\d+/g)!.map(Number);
			expect(red / (red + green + blue)).toBeLessThan(0.8);
		}
	}, 240_000);
});

describe('reduced motion', () => {
	it('does nothing: no avatar, no glitch, no animation, no request', async () => {
		root.classList.add('reduced');
		const r = rig();
		await r.arm();
		await advance(120_000);
		expect(r.avatar()).toBeNull();
		expect(avatarRequested()).toBe(false);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(r.glitch().dataset.show).toBe('photo');
		expect(r.glitch().getAnimations({ subtree: true })).toEqual([]);
		expect(glitch.armed).toBe(false);
		expect(names()).toEqual([photoAlt]);
	});

	it('snaps to the photo, with its alt text, when it is turned on while the avatar holds the signal', async () => {
		const seed = seedWhere((events) => events[0].kind === 'swap');
		const [swap] = glitchesOf(seed, 1);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await r.to(end(swap) + 500);
		expect(names()).toEqual([avatarAlt]);

		root.classList.add('reduced');
		await settle();
		expect(r.glitch().dataset.show).toBe('photo');
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(names()).toEqual([photoAlt]);
		expect(r.avatar()).toBeNull();
		expect(glitch.armed).toBe(false);
		await advance(60_000);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
	}, 60_000);

	it('starts again, a few seconds later, when it is turned off', async () => {
		root.classList.add('reduced');
		const r = rig();
		await r.arm();
		expect(glitch.armed).toBe(false);
		root.classList.remove('reduced');
		await settle();
		await advance(GLITCH_WAIT_MIN_MS - 1);
		expect(glitch.armed).toBe(false);
		await advance(1);
		expect(glitch.armed).toBe(true);
		expect(r.avatar()).not.toBeNull();
	});
});

describe('pausing by itself', () => {
	/** A seed whose first glitch swaps to the avatar. */
	const swapFirstSeed = () => seedWhere((events) => events[0].kind === 'swap');

	it('snaps back to the photo when the tab is hidden while the avatar holds the signal, and waits when it returns', async () => {
		const seed = swapFirstSeed();
		const [swap] = glitchesOf(seed, 1);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await r.to(end(swap) + 500);
		expect(names()).toEqual([avatarAlt]);

		setHidden(true);
		await settle();
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);
		await advance(120_000);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);

		setHidden(false);
		await settle();
		// A fresh wait: no catch-up burst, nothing for at least 4 s, then the first glitch.
		const first = await firstGlitchWithin(r, 9000);
		expect(first).toBeGreaterThanOrEqual(GLITCH_WAIT_MIN_MS);
		expect(first).toBeLessThanOrEqual(GLITCH_WAIT_MAX_MS + 100);
	}, 60_000);

	it('snaps back to the photo when the photo scrolls out of view, and waits when it returns', async () => {
		stubIntersectionObserver();
		const seed = swapFirstSeed();
		const [swap] = glitchesOf(seed, 1);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await r.to(end(swap) + 500);
		expect(names()).toEqual([avatarAlt]);

		intersect(false);
		await settle();
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);
		await advance(120_000);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);

		intersect(true);
		await settle();
		const first = await firstGlitchWithin(r, 9000);
		expect(first).toBeGreaterThanOrEqual(GLITCH_WAIT_MIN_MS);
		expect(first).toBeLessThanOrEqual(GLITCH_WAIT_MAX_MS + 100);
	}, 60_000);

	it('watches the socket, not only the photo', async () => {
		stubIntersectionObserver();
		const r = rig();
		await settle();
		expect(observers.flatMap((o) => o.targets)).toContain(r.socket);
	});
});

describe('the avatar fails to load', () => {
	it('keeps tearing the photo and never flashes or swaps, over 3 minutes', async () => {
		const r = rig({ seed: 5 });
		await r.arm();
		r.avatar()!.dispatchEvent(new Event('error'));
		await settle();

		const seen = { tears: 0, avatar: 0, kinds: new Set<string>() };
		let running = false;
		const watch = new MutationObserver(() => {
			const el = r.glitch();
			if (el.dataset.show === 'avatar') seen.avatar++;
			if (names().join('|') !== photoAlt) seen.avatar++;
			const kind = el.dataset.glitch;
			if (kind) seen.kinds.add(kind);
			if (kind && !running) seen.tears++;
			running = Boolean(kind);
		});
		watch.observe(r.glitch(), { attributes: true });
		for (let t = 0; t < 180_000; t += 500) await advance(500);
		watch.disconnect();
		expect(seen.avatar).toBe(0);
		expect([...seen.kinds]).toEqual(['tear']);
		// A glitch every 4 to 8 s: about 25 in 3 minutes.
		expect(seen.tears).toBeGreaterThanOrEqual(15);
	}, 120_000);
});

describe('paused by the visitor', () => {
	it('asks for no avatar and glitches no more when it was stored as paused', async () => {
		localStorage.setItem(PAUSED_KEY, 'true');
		const r = rig();
		await r.arm();
		await advance(120_000);
		expect(glitch.paused).toBe(true);
		// Armed, so the switch can show itself pressed; but no avatar and no glitch.
		expect(glitch.armed).toBe(true);
		expect(r.avatar()).toBeNull();
		expect(avatarRequested()).toBe(false);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(names()).toEqual([photoAlt]);
	});

	it('starts when it is un-paused, after a fresh wait, and stops again when it is paused', async () => {
		localStorage.setItem(PAUSED_KEY, 'true');
		const seed = seedWhere(() => true);
		const [first] = glitchesOf(seed, 1);
		const r = rig({ seed });
		await r.arm();
		setPaused(false);
		await settle();
		expect(r.avatar()).not.toBeNull();
		await advance(first.at - 1);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		await advance(1);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(true);

		setPaused(true);
		await settle();
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		await advance(120_000);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
	}, 60_000);

	it('snaps to the photo at once when it is paused while the avatar holds the signal', async () => {
		const seed = seedWhere((events) => events[0].kind === 'swap');
		const [swap] = glitchesOf(seed, 1);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await r.to(end(swap) + 500);
		expect(names()).toEqual([avatarAlt]);
		setPaused(true);
		await settle();
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);
	}, 60_000);
});

describe('unmounting', () => {
	it('stops the timers and leaves the switch away', async () => {
		const r = rig({ seed: 5 });
		await r.arm();
		expect(glitch.armed).toBe(true);
		r.stop();
		expect(glitch.armed).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
});
