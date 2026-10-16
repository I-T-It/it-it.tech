import '../../app.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { flushSync, mount, unmount } from 'svelte';
import {
	FIRST_TEASER_MAX_MS,
	FIRST_TEASER_MIN_MS,
	FLICKER_MS,
	GLITCH_START_AFTER_POWER_MS,
	MAX_BAND_AREA,
	nextCycle,
	type GlitchEvent
} from '#lib/glitch/schedule.js';
import { glitch, PAUSED_KEY, setPaused } from '#lib/glitch/state.svelte.js';
import { createRng } from '#lib/pcb/rng.js';
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
	avatar: () => HTMLImageElement | null;
	power: () => void;
	/** The board powers the socket, and the glitch gets as far as arming. */
	arm: () => Promise<void>;
	/** The avatar has loaded and decoded, which takes real time. */
	loaded: () => Promise<void>;
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
	flushSync();
	let stopped = false;
	const made: Rig = {
		socket,
		die,
		glitch: () => die.querySelector<HTMLElement>('.glitch')!,
		avatar: () => die.querySelector<HTMLImageElement>('img.avatar'),
		power: () => socket.setAttribute('data-power', 'on'),
		arm: async () => {
			made.power();
			await advance(GLITCH_START_AFTER_POWER_MS);
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
		stop: () => {
			if (stopped) return;
			stopped = true;
			unmount(app);
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

/** A seed whose first cycle satisfies `match`, so a test can aim at a plain teaser or a flicker. */
function seedWhere(match: (events: GlitchEvent[]) => boolean): number {
	for (let seed = 1; seed < 1000; seed++) {
		if (match(nextCycle(createRng(seed), 0).events)) return seed;
	}
	throw new Error('no seed matches');
}

const swapEvents = (seed: number) => nextCycle(createRng(seed), 0).events.slice(-2);

/** How many ms until a glitch first shows, looking every 25 ms (a teaser lasts 150 ms or more); null if none does. */
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
});

afterEach(() => {
	for (const made of rigs.splice(0)) made.stop();
	observers.length = 0;
	vi.useRealTimers();
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
	it('waits for the socket to get power, then for the scroll link, then for the first teaser', async () => {
		const seed = seedWhere(() => true);
		const first = nextCycle(createRng(seed), 0).events[0];
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

describe('a teaser', () => {
	const plain = (events: GlitchEvent[]) => events[0].kind === 'tease';

	it('tears the photo for 150 to 300 ms and clears again, with the photo still announced', async () => {
		const seed = seedWhere(plain);
		const first = nextCycle(createRng(seed), 0).events[0];
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await advance(first.at);
		expect(r.glitch().dataset.glitch).toBe('tease');
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);
		await advance(first.duration - 1);
		expect(r.glitch().dataset.glitch).toBe('tease');
		await advance(1);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(names()).toEqual([photoAlt]);
		expect(first.duration).toBeLessThanOrEqual(300);
	}, 60_000);

	it('has three decorative bands that cover at most 8% of the die, tinted cyan or green', async () => {
		const seed = seedWhere(plain);
		const first = nextCycle(createRng(seed), 0).events[0];
		const r = rig({ seed });
		await r.arm();
		await advance(first.at);
		const bands = [...r.glitch().querySelectorAll<HTMLElement>('.band')];
		expect(bands).toHaveLength(3);
		expect(r.glitch().querySelector('.bands')!.getAttribute('aria-hidden')).toBe('true');
		let area = 0;
		for (const band of bands) {
			area += Number(band.style.getPropertyValue('--h'));
			expect(['cyan', 'green']).toContain(band.dataset.tint);
		}
		expect(area).toBeGreaterThan(0);
		expect(area).toBeLessThanOrEqual(MAX_BAND_AREA);
		for (const img of r.glitch().querySelectorAll('.bands img')) {
			expect(img.getAttribute('alt')).toBe('');
		}
		expect(r.glitch().querySelector('.bands a, .bands button, .bands [tabindex]')).toBeNull();
	});

	it('shows the bands only while a glitch runs', async () => {
		const seed = seedWhere(plain);
		const first = nextCycle(createRng(seed), 0).events[0];
		const r = rig({ seed });
		await r.arm();
		const bands = () => getComputedStyle(r.glitch().querySelector('.bands')!).display;
		expect(bands()).toBe('none');
		await advance(first.at);
		expect(bands()).not.toBe('none');
		await advance(first.duration);
		expect(bands()).toBe('none');
	});
});

describe('a flicker', () => {
	const flicker = (events: GlitchEvent[]) => events[0].kind === 'flicker';

	it('shows the avatar for about 100 ms and the screen reader notices nothing', async () => {
		const seed = seedWhere(flicker);
		const first = nextCycle(createRng(seed), 0).events[0];
		const on = first.frames.find((f) => f.show === 'avatar')!.at;
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await advance(first.at + on - 1);
		expect(r.glitch().dataset.show).toBe('photo');
		await advance(1);
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([photoAlt]);
		await advance(FLICKER_MS - 1);
		expect(r.glitch().dataset.show).toBe('avatar');
		await advance(1);
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);
		await advance(first.duration);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
	}, 60_000);

	it('is only a tear of the photo while the avatar has not decoded yet', async () => {
		const seed = seedWhere(flicker);
		const first = nextCycle(createRng(seed), 0).events[0];
		const r = rig({ seed });
		await r.arm();
		// No wait for the load: whatever the avatar is up to, the flicker ends as a plain teaser
		// only when it is not decoded. Either way the photo is announced throughout.
		await advance(first.at + first.duration);
		expect(names()).toEqual([photoAlt]);
		expect(r.glitch().dataset.show).toBe('photo');
	});
});

describe('a swap', () => {
	it('gives the avatar its alt text while it is shown, and the photo back afterwards', async () => {
		const seed = 5;
		const [swapIn, swapOut] = swapEvents(seed);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();

		await advance(swapIn.at);
		expect(r.glitch().dataset.glitch).toBe('swap-in');
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);

		const middleIn = swapIn.frames.find((f) => f.show === 'avatar')!.at;
		await advance(middleIn - 1);
		expect(names()).toEqual([photoAlt]);
		await advance(1);
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([avatarAlt]);

		// The glitch ends, the avatar holds.
		await advance(swapIn.duration - middleIn);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(r.glitch().dataset.show).toBe('avatar');
		expect(names()).toEqual([avatarAlt]);
		await advance(swapOut.at - (swapIn.at + swapIn.duration) - 1);
		expect(names()).toEqual([avatarAlt]);

		await advance(1);
		expect(r.glitch().dataset.glitch).toBe('swap-out');
		expect(names()).toEqual([avatarAlt]);
		const middleOut = swapOut.frames.find((f) => f.show === 'photo')!.at;
		await advance(middleOut);
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);
		await advance(swapOut.duration - middleOut);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);
		expect(names()).toEqual([photoAlt]);
	}, 60_000);

	it('says nothing aloud: no live region anywhere in the glitch', async () => {
		const seed = 5;
		const [swapIn] = swapEvents(seed);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await advance(swapIn.at + swapIn.duration);
		expect(r.glitch().querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
		expect(r.glitch().getAttribute('aria-live')).toBeNull();
	}, 60_000);

	it('lets only the photo or the avatar be in the accessibility tree, never both', async () => {
		const seed = 5;
		const [swapIn, swapOut] = swapEvents(seed);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		const seen = new Set<number>();
		for (let t = 0; t < swapOut.at + swapOut.duration + 500; t += 50) {
			seen.add(names().length);
			await advance(50);
		}
		expect([...seen]).toEqual([1]);
		expect(swapIn.at).toBeLessThan(swapOut.at);
	}, 60_000);
});

describe('flash safety', () => {
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
		let busiest = 0;
		for (let i = 0; i < changes.length; i++) {
			busiest = Math.max(
				busiest,
				changes.filter((c) => c >= changes[i] && c < changes[i] + 1000).length
			);
		}
		expect(busiest).toBeLessThanOrEqual(2);
	}, 120_000);
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

	it('snaps to the photo, with its alt text, when it is turned on in the middle of a swap', async () => {
		const seed = 5;
		const [swapIn] = swapEvents(seed);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await advance(swapIn.at + swapIn.duration + 500);
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
		await advance(FIRST_TEASER_MIN_MS - 1);
		expect(glitch.armed).toBe(false);
		await advance(1);
		expect(glitch.armed).toBe(true);
		expect(r.avatar()).not.toBeNull();
	});
});

describe('pausing by itself', () => {
	it('snaps back when the tab is hidden in the middle of the hold, and waits when it returns', async () => {
		const seed = 5;
		const [swapIn] = swapEvents(seed);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await advance(swapIn.at + swapIn.duration + 500);
		expect(names()).toEqual([avatarAlt]);

		setHidden(true);
		await settle();
		expect(r.glitch().dataset.show).toBe('photo');
		expect(names()).toEqual([photoAlt]);
		await advance(120_000);
		expect(r.glitch().hasAttribute('data-glitch')).toBe(false);

		setHidden(false);
		await settle();
		// A fresh wait: no catch-up burst, nothing for at least 4 s, then the first teaser.
		const first = await firstGlitchWithin(r, 9000);
		expect(first).toBeGreaterThanOrEqual(FIRST_TEASER_MIN_MS);
		expect(first).toBeLessThanOrEqual(FIRST_TEASER_MAX_MS + 100);
	}, 60_000);

	it('snaps back when the photo scrolls out of view, and waits when it returns', async () => {
		stubIntersectionObserver();
		const seed = 5;
		const [swapIn] = swapEvents(seed);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await advance(swapIn.at + swapIn.duration + 500);
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
		expect(first).toBeGreaterThanOrEqual(FIRST_TEASER_MIN_MS);
		expect(first).toBeLessThanOrEqual(FIRST_TEASER_MAX_MS + 100);
	}, 60_000);

	it('watches the socket, not only the photo', async () => {
		stubIntersectionObserver();
		const r = rig();
		await settle();
		expect(observers.flatMap((o) => o.targets)).toContain(r.socket);
	});
});

describe('the avatar fails to load', () => {
	it('keeps the teasers coming and never flickers or swaps, over 3 cycles', async () => {
		const r = rig({ seed: 5 });
		await r.arm();
		r.avatar()!.dispatchEvent(new Event('error'));
		await settle();

		const seen = { teasers: 0, avatar: 0, kinds: new Set<string>() };
		let running = false;
		const watch = new MutationObserver(() => {
			const el = r.glitch();
			if (el.dataset.show === 'avatar') seen.avatar++;
			if (names().join('|') !== photoAlt) seen.avatar++;
			const kind = el.dataset.glitch;
			if (kind) seen.kinds.add(kind);
			if (kind && !running) seen.teasers++;
			running = Boolean(kind);
		});
		watch.observe(r.glitch(), { attributes: true });
		for (let t = 0; t < 3 * 45_000; t += 500) await advance(500);
		watch.disconnect();
		expect(seen.avatar).toBe(0);
		expect([...seen.kinds]).toEqual(['tease']);
		// 3 cycles of at least one teaser each, and the first cycle is no swap either.
		expect(seen.teasers).toBeGreaterThanOrEqual(3);
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
		const first = nextCycle(createRng(seed), 0).events[0];
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

	it('snaps to the photo at once when it is paused in the middle of a swap', async () => {
		const seed = 5;
		const [swapIn] = swapEvents(seed);
		const r = rig({ seed });
		await r.arm();
		await r.loaded();
		await advance(swapIn.at + swapIn.duration + 500);
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
