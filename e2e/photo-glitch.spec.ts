import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';
import { expectNoAxeViolations } from './axe.js';

// The hero photo glitch: on the personal build the photo and the Roboroads avatar fight over the
// signal. Every 4 to 8 s a glitch tears the image that holds it (slices thrown sideways, blocks in
// the wrong colours, the other image leaking in, some of it spilling out of the die), and in about
// a third of them the other image takes over for good (a swap) or for 100 ms (a flash). The
// company build has no photo and none of this. The clock is faked and paused, so five minutes of
// glitch take a few seconds and every moment is exact.

// The numbers of src/lib/glitch/schedule.ts, written out: the test checks the page against them.
const ARM_AFTER_POWER_MS = 2200 + 2600;
const GLITCH_WAIT_MIN_MS = 4000;
const GLITCH_WAIT_MAX_MS = 8000;

// Seeds that make a test quick and sure (`?glitch-seed=`, honoured when the browser is automated);
// src/lib/glitch/schedule.test.ts checks what each one does. This one swaps to the avatar 4.7 s after
// the glitch arms and back to the photo 10 s in, so a test that waits for either does not wait long.
const SWAPS_TWICE_SEED = 129;
// Within 5 minutes this one flashes the photo over the avatar and the avatar over the photo, tears
// the avatar, and swaps both ways, each of them at least twice.
const MIXED_SEED = 3;

const PHOTO_NL = 'Portret van Robbin Schepers';
const AVATAR_NL = /^Avatar van Roboroads/;
const PAUSE_NL = 'Foto-glitch pauzeren';
const PAUSE_EN = 'Pause the photo glitch';

type Box = [left: number, top: number, right: number, bottom: number];

/** Where everything was when a frame went up: the fragments, the die, the hero text, the window. */
interface FrameGeometry {
	fragments: Box[];
	die: Box;
	copy: Box;
	/** How far the page is wider than the window, in CSS px. */
	overflow: number;
	/** How many fragments were drawn from the avatar. */
	fromAvatar: number;
	layerHidden: string | null;
	layerPointerEvents: string;
	tints: string[];
}

interface LogEntry {
	/** The fake clock, in ms. */
	t: number;
	what: 'data-power' | 'data-glitch' | 'data-show' | 'data-frame' | 'avatar-added';
	value: string | null;
	/** At data-power: how many requests for the avatar had gone out by then. */
	avatarRequests?: number;
	/** At data-show: the alt text of every image in the hero that is not hidden from screen readers, and the glitch running. */
	accessible?: string[];
	glitchKind?: string | null;
	/** At data-frame: the picture as it was when the frame went up. */
	geometry?: FrameGeometry;
}

/** Writes down, with the fake time, every glitch attribute change and the moment the avatar is added. */
function installLog() {
	const log: LogEntry[] = [];
	(window as unknown as { __glitchLog: LogEntry[] }).__glitchLog = log;
	const avatarRequests = () =>
		performance.getEntriesByType('resource').filter((e) => e.name.includes('roboroads-avatar'))
			.length;
	const box = (el: Element): Box => {
		const r = el.getBoundingClientRect();
		return [r.left, r.top, r.right, r.bottom];
	};
	const geometry = (): FrameGeometry => {
		const layer = document.querySelector<HTMLElement>('#hero .fx')!;
		const fragments = [...layer.querySelectorAll<HTMLElement>('.frag')];
		return {
			fragments: fragments.map(box),
			die: box(document.querySelector('#hero .die')!),
			copy: box(document.querySelector('#hero .copy')!),
			overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			fromAvatar: fragments.filter((el) => el.dataset.source === 'avatar').length,
			layerHidden: layer.getAttribute('aria-hidden'),
			layerPointerEvents: getComputedStyle(layer).pointerEvents,
			tints: fragments.map((el) => el.style.getPropertyValue('--tint'))
		};
	};
	const accessible = () =>
		[...document.querySelectorAll('#hero .die img:not([aria-hidden="true"])')].map(
			(el) => el.getAttribute('alt') ?? ''
		);
	new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === 'attributes') {
				const what = record.attributeName as LogEntry['what'];
				log.push({
					t: performance.now(),
					what,
					value: (record.target as Element).getAttribute(what),
					avatarRequests: what === 'data-power' ? avatarRequests() : undefined,
					geometry: what === 'data-frame' ? geometry() : undefined,
					accessible: what === 'data-show' ? accessible() : undefined,
					glitchKind:
						what === 'data-show'
							? (document.querySelector('#hero .glitch')?.getAttribute('data-glitch') ?? null)
							: undefined
				});
				continue;
			}
			// The avatar of the hero (the header has a small avatar of its own: the photo).
			for (const node of record.addedNodes) {
				const found =
					node instanceof Element &&
					(node.matches('#hero img.avatar') || node.querySelector('#hero img.avatar'));
				if (found) log.push({ t: performance.now(), what: 'avatar-added', value: null });
			}
		}
	}).observe(document, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: ['data-power', 'data-glitch', 'data-show', 'data-frame']
	});
}

const readLog = (page: Page) =>
	page.evaluate(() => (window as unknown as { __glitchLog: LogEntry[] }).__glitchLog);

/** Requests for the avatar, as they go out. */
function watchAvatarRequests(page: Page): Request[] {
	const requests: Request[] = [];
	page.on('request', (request) => {
		if (request.url().includes('roboroads-avatar')) requests.push(request);
	});
	return requests;
}

/**
 * Freezes the fake clock a moment ahead (it keeps ticking until then, and the jump must lie in the
 * future): from there on time moves only with `page.clock.runFor`.
 */
async function freeze(page: Page) {
	await page.evaluate(() => document.fonts.ready);
	await page.locator('canvas.pcb-board').waitFor({ state: 'attached' });
	await pauseAhead(page);
}

/** Pauses a running fake clock a moment ahead. */
async function pauseAhead(page: Page) {
	// On a busy runner 1.5 s can pass before the call arrives, and a time in the past is refused.
	for (const margin of [1500, 5000, 20_000]) {
		const now = await page.evaluate(() => Date.now());
		try {
			await page.clock.pauseAt(now + margin);
			return;
		} catch (error) {
			if (margin === 20_000) throw error;
		}
	}
}

/** Loads the page on a fake clock and freezes it right after load. */
async function load(page: Page, path = './') {
	await page.clock.install({ time: 0 });
	await page.addInitScript(installLog);
	await page.goto(path);
	await freeze(page);
}

/** Runs the fake clock until the socket has power, and then until the glitch has armed. */
async function arm(page: Page) {
	const socket = page.locator('#hero .photo-socket');
	for (let i = 0; i < 200 && (await socket.getAttribute('data-power')) !== 'on'; i++) {
		await page.clock.runFor(250);
	}
	await expect(socket).toHaveAttribute('data-power', 'on');
	await page.clock.runFor(ARM_AFTER_POWER_MS + 50);
}

/** Waits, in real time, until the avatar has loaded: a flash or swap that comes sooner is played as a tear. */
async function avatarLoaded(page: Page) {
	await expect
		.poll(() =>
			page.evaluate(() => {
				const img = document.querySelector<HTMLImageElement>('#hero img.avatar');
				return Boolean(img?.complete && img.naturalWidth > 0);
			})
		)
		.toBe(true);
	// The component waits for decode() too, which settles a moment after the load.
	await new Promise((resolve) => setTimeout(resolve, 300));
}

/** Runs the clock in steps of 250 ms until `done` holds. */
async function runUntil(page: Page, done: () => Promise<boolean>, limitMs = 200_000) {
	for (let spent = 0; spent < limitMs; spent += 250) {
		if (await done()) return;
		await page.clock.runFor(250);
	}
	throw new Error(`not there after ${limitMs} ms of fake time`);
}

/**
 * axe needs the page's timers, which the frozen clock holds back, so the clock runs in real time
 * while axe does and is frozen again after. The glitch moves on in that time (a second or so of it),
 * so a test must not count on the state it started axe in being the state axe ends in.
 *
 * It used to tick the clock by hand, 2 ms at a time, next to axe. The clock belongs to the browser
 * context and not to the page, and near its end axe opens a blank page in that context and closes
 * it again; a tick in flight at that moment failed with "Target page, context or browser has been
 * closed" though our page was fine, and the test failed now and then. Without a ticker there is no
 * such race, and axe is also a lot faster than it was on 10 ms ticks.
 */
async function axeOnLiveClock(page: Page) {
	await page.clock.resume();
	try {
		await expectNoAxeViolations(page);
	} finally {
		await pauseAhead(page);
	}
}

/** The avatar holds the signal: it is the accessible image. */
const holding = (page: Page) => () =>
	page
		.locator('#hero img.avatar:not([aria-hidden="true"])')
		.count()
		.then((n) => n > 0);

test.describe('the photo glitch', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright wants the destructuring pattern here
	test.beforeEach(({}, testInfo) => {
		test.skip(testInfo.project.name !== 'personal', 'the glitch is on the personal build');
	});

	test('waits for the intro, then glitches now and then, within the flash budget', async ({
		page
	}) => {
		const avatarRequests = watchAvatarRequests(page);
		await load(page);
		await arm(page);
		await page.clock.runFor(5 * 60_000);

		const log = await readLog(page);
		const power = log.find((e) => e.what === 'data-power' && e.value === 'on')!;
		expect(power).toBeDefined();
		// Nothing asked for before the socket has power.
		expect(power.avatarRequests).toBe(0);
		// The avatar comes when the glitch arms, not before.
		const added = log.find((e) => e.what === 'avatar-added')!;
		expect(added.t - power.t).toBeGreaterThanOrEqual(ARM_AFTER_POWER_MS);
		expect(avatarRequests.length).toBeGreaterThan(0);

		// The first glitch comes 4 to 8 s after that, of whatever kind.
		const glitches = log.filter((e) => e.what === 'data-glitch' && e.value !== null);
		expect(glitches.length).toBeGreaterThan(0);
		const first = glitches[0];
		expect(first.value).toMatch(/^(tear|flash|swap)$/);
		expect(first.t - power.t).toBeGreaterThanOrEqual(ARM_AFTER_POWER_MS + GLITCH_WAIT_MIN_MS);
		expect(first.t - power.t).toBeLessThanOrEqual(ARM_AFTER_POWER_MS + GLITCH_WAIT_MAX_MS + 500);
		// A glitch every 4 to 8 s, about 45 in five minutes, all three kinds among them.
		expect(glitches.length).toBeGreaterThan(25);
		for (const kind of ['tear', 'flash', 'swap']) {
			expect(glitches.some((e) => e.value === kind)).toBe(true);
		}

		// Whole-image changes: at most 4 in any second (2.3.1), and in practice 2.
		const changes = log.filter((e) => e.what === 'data-show').map((e) => e.t);
		expect(changes.length).toBeGreaterThanOrEqual(4);
		let busiest = 0;
		for (const start of changes) {
			busiest = Math.max(busiest, changes.filter((t) => t >= start && t < start + 1000).length);
		}
		expect(busiest).toBeLessThanOrEqual(4);
		expect(busiest).toBeLessThanOrEqual(2);
	});

	test('tears slices and blocks off the picture, out past the die but never over the text, within 3 flashes a second', async ({
		page
	}) => {
		await load(page);
		await arm(page);
		await page.clock.runFor(5 * 60_000);
		const frames = (await readLog(page)).filter((e) => e.what === 'data-frame');
		expect(frames.length).toBeGreaterThan(30);

		// Every change of the picture, the end of each glitch included: 6 in a second at most, and 3
		// flashes is the limit of WCAG 2.3.1. The busiest second is a swap, which uses all of it.
		const times = frames.map((e) => e.t);
		let busiest = 0;
		for (const start of times) {
			busiest = Math.max(busiest, times.filter((t) => t >= start && t < start + 1000).length);
		}
		expect(busiest).toBeLessThanOrEqual(6);
		expect(busiest).toBeGreaterThanOrEqual(5);

		const drawn = frames.map((e) => e.geometry!).filter((g) => g.fragments.length > 0);
		expect(drawn.length).toBeGreaterThan(20);
		let spilled = 0;
		let avatar = 0;
		for (const g of drawn) {
			// Decoration only.
			expect(g.layerHidden).toBe('true');
			expect(g.layerPointerEvents).toBe('none');
			// Never makes the page wider than the window.
			expect(g.overflow).toBeLessThanOrEqual(0);
			if (g.fromAvatar > 0) avatar++;
			for (const [left, top, right, bottom] of g.fragments) {
				// Out of the die sideways, never above or below it.
				if (left < g.die[0] - 1 || right > g.die[2] + 1) spilled++;
				expect(top).toBeGreaterThanOrEqual(g.die[1] - 1);
				expect(bottom).toBeLessThanOrEqual(g.die[3] + 1);
				// Never over the hero text.
				const over =
					Math.min(right, g.copy[2]) > Math.max(left, g.copy[0]) &&
					Math.min(bottom, g.copy[3]) > Math.max(top, g.copy[1]);
				expect(over).toBe(false);
			}
		}
		expect(spilled).toBeGreaterThan(20);
		// The avatar leaks into the photo in tears too, not only in swaps.
		expect(avatar).toBeGreaterThan(5);
		for (const tint of new Set(drawn.flatMap((g) => g.tints))) {
			const [red, green, blue] = tint.match(/\d+/g)!.map(Number);
			expect(red / (red + green + blue)).toBeLessThan(0.8);
		}
	});

	test('keeps the fragments inside a 320 px window, with no sideways scroll, through the swaps', async ({
		page
	}) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await load(page);
		await arm(page);
		await page.clock.runFor(2 * 60_000);
		const drawn = (await readLog(page))
			.filter((e) => e.what === 'data-frame')
			.map((e) => e.geometry!)
			.filter((g) => g.fragments.length > 0);
		expect(drawn.length).toBeGreaterThan(10);
		for (const g of drawn) {
			expect(g.overflow).toBeLessThanOrEqual(0);
			for (const [left, , right] of g.fragments) {
				expect(left).toBeGreaterThanOrEqual(0);
				expect(right).toBeLessThanOrEqual(320);
			}
		}
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});

	test('keeps exactly one image in the accessibility tree through swaps, flashes and tears, and hands it over in swaps only', async ({
		page
	}) => {
		// Seed 3 flashes the photo over the avatar and the avatar over the photo, and swaps both ways.
		await load(page, `./?glitch-seed=${MIXED_SEED}`);
		await arm(page);
		await avatarLoaded(page);
		await page.clock.runFor(5 * 60_000);
		const shows = (await readLog(page)).filter((e) => e.what === 'data-show');
		expect(shows.length).toBeGreaterThan(10);

		let holder: 'photo' | 'avatar' = 'photo';
		let swaps = 0;
		let flashedOver = 0;
		for (const entry of shows) {
			// One image found by a screen reader, always.
			expect(entry.accessible).toHaveLength(1);
			const [alt] = entry.accessible!;
			const now = alt === PHOTO_NL ? 'photo' : 'avatar';
			if (alt !== PHOTO_NL) expect(alt).toMatch(AVATAR_NL);
			if (now !== holder) {
				// The signal changes hands in a swap, never in a flash or a tear.
				expect(entry.glitchKind).toBe('swap');
				holder = now;
				swaps++;
			} else if (entry.glitchKind === 'flash' && entry.value !== holder) {
				// The other image on show for a flash, and the accessible one is still the holder.
				flashedOver++;
			}
		}
		expect(swaps).toBeGreaterThanOrEqual(4);
		expect(flashedOver).toBeGreaterThanOrEqual(4);
	});

	test('names the avatar while it holds the signal and the photo again after a swap back, in the accessibility tree', async ({
		page
	}) => {
		await load(page, `./?glitch-seed=${SWAPS_TWICE_SEED}`);
		await arm(page);
		await avatarLoaded(page);
		const die = page.locator('#hero .die');
		await expect(die.getByRole('img')).toHaveCount(1);
		await expect(die.getByRole('img', { name: PHOTO_NL })).toBeVisible();

		await runUntil(page, holding(page));
		await expect(die.getByRole('img')).toHaveCount(1);
		await expect(die.getByRole('img', { name: AVATAR_NL })).toBeVisible();
		await expect(die.getByRole('img', { name: PHOTO_NL })).toHaveCount(0);
		await expect(page.locator('#hero .glitch')).toHaveAttribute('data-show', 'avatar');
		// No announcement: no live region in the hero.
		await expect(
			page.locator('#hero [aria-live], #hero [role="status"], #hero [role="alert"]')
		).toHaveCount(0);

		await runUntil(page, async () => !(await holding(page)()));
		await expect(die.getByRole('img')).toHaveCount(1);
		await expect(die.getByRole('img', { name: PHOTO_NL })).toBeVisible();
		await expect(die.getByRole('img', { name: AVATAR_NL })).toHaveCount(0);
	});

	test('passes axe at rest, while the avatar holds the signal and with the switch pressed', async ({
		page
	}) => {
		// Three axe runs over the whole page take about 10 s on a quiet machine, more on a busy one.
		test.slow();
		await load(page, `./?glitch-seed=${SWAPS_TWICE_SEED}`);
		await arm(page);
		await avatarLoaded(page);
		await axeOnLiveClock(page);

		// The avatar holds the signal when axe starts; a later swap may hand it back while axe runs.
		await runUntil(page, holding(page));
		await expect(page.locator('#hero img.avatar:not([aria-hidden="true"])')).toHaveCount(1);
		await axeOnLiveClock(page);

		await page.getByRole('button', { name: PAUSE_NL }).click();
		await expect(page.getByRole('button', { name: PAUSE_NL })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await axeOnLiveClock(page);
	});

	test('has a switch for the keyboard that stops the glitch and is remembered', async ({
		page
	}) => {
		const avatarRequests = watchAvatarRequests(page);
		await load(page);
		await expect(page.getByRole('button', { name: PAUSE_NL })).toHaveCount(0);
		await arm(page);
		const toggle = page.getByRole('button', { name: PAUSE_NL });
		await expect(toggle).toBeVisible();
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');

		// Tab gets there, and the ring shows.
		for (
			let i = 0;
			i < 40 && !(await toggle.evaluate((el) => el === document.activeElement));
			i++
		) {
			await page.keyboard.press('Tab');
		}
		await expect(toggle).toBeFocused();
		const ring = await toggle.evaluate((el) => {
			const style = getComputedStyle(el);
			return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
		});
		expect(ring.style).toBe('solid');
		expect(ring.width).toBeGreaterThanOrEqual(2);
		const box = (await toggle.boundingBox())!;
		expect(box.width).toBeGreaterThanOrEqual(24);
		expect(box.height).toBeGreaterThanOrEqual(24);

		await page.keyboard.press('Space');
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		// Stopped: whatever was running ends, and nothing starts for minutes.
		const before = (await readLog(page)).filter((e) => e.what === 'data-glitch' && e.value).length;
		await page.clock.runFor(120_000);
		const after = (await readLog(page)).filter((e) => e.what === 'data-glitch' && e.value).length;
		expect(after).toBe(before);
		await expect(page.locator('#hero .glitch')).toHaveAttribute('data-show', 'photo');
		expect(avatarRequests.length).toBeGreaterThan(0);

		// A reload: still stopped, the switch shows pressed at arm time, and no avatar is asked for.
		avatarRequests.length = 0;
		await page.reload();
		await freeze(page);
		await arm(page);
		await expect(page.getByRole('button', { name: PAUSE_NL })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await page.clock.runFor(120_000);
		expect(avatarRequests).toHaveLength(0);
		await expect(page.locator('#hero img.avatar')).toHaveCount(0);

		// Pressed again, it starts: the avatar comes, and the glitch with it.
		await page.getByRole('button', { name: PAUSE_NL }).press('Enter');
		await expect(page.getByRole('button', { name: PAUSE_NL })).toHaveAttribute(
			'aria-pressed',
			'false'
		);
		await expect(page.locator('#hero img.avatar')).toHaveCount(1);
		await page.clock.runFor(10_000);
		await expect.poll(() => avatarRequests.length).toBeGreaterThan(0);
	});

	test('names the switch in English on the English page', async ({ page }) => {
		await load(page, `en/?glitch-seed=${SWAPS_TWICE_SEED}`);
		await arm(page);
		await avatarLoaded(page);
		await expect(page.getByRole('button', { name: PAUSE_EN })).toBeVisible();
		await runUntil(page, holding(page));
		await expect(
			page
				.locator('#hero .die')
				.getByRole('img', { name: /^Roboroads avatar: a low-poly portrait/ })
		).toBeVisible();
	});

	test('has no horizontal scroll at 320 CSS px with the switch there', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		await load(page);
		await arm(page);
		await expect(page.getByRole('button', { name: PAUSE_NL })).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
		const box = (await page.getByRole('button', { name: PAUSE_NL }).boundingBox())!;
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(320);
	});

	test.describe('with reduced motion', () => {
		test.use({ reducedMotion: 'reduce' });

		test('does nothing: no avatar request, no switch, no animation, no glitch', async ({
			page
		}) => {
			const avatarRequests = watchAvatarRequests(page);
			await load(page);
			await page.clock.runFor(120_000);
			expect(avatarRequests).toHaveLength(0);
			await expect(page.getByRole('button', { name: PAUSE_NL })).toHaveCount(0);
			await expect(page.locator('#hero img.avatar')).toHaveCount(0);
			expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
			const log = await readLog(page);
			expect(log.filter((e) => e.what === 'data-glitch' || e.what === 'data-show')).toEqual([]);
			await expect(page.locator('#hero img.photo')).toBeVisible();
		});
	});

	test.describe('without JavaScript', () => {
		test.use({ javaScriptEnabled: false });

		test('shows the photo, and no avatar and no switch', async ({ page }) => {
			const avatarRequests = watchAvatarRequests(page);
			await page.goto('./');
			await expect(page.getByRole('img', { name: PHOTO_NL })).toBeVisible();
			await expect(page.locator('#hero img')).toHaveCount(1);
			await expect(page.getByRole('button', { name: PAUSE_NL })).toHaveCount(0);
			await expect(page.locator('[data-glitch]')).toHaveCount(0);
			expect(avatarRequests).toHaveLength(0);
		});
	});
});

test.describe('the company build', () => {
	// eslint-disable-next-line no-empty-pattern -- Playwright wants the destructuring pattern here
	test.beforeEach(({}, testInfo) => {
		test.skip(testInfo.project.name !== 'company', 'checked on the company build');
	});

	test('has no glitch: no avatar request, no glitch state, no switch, no photo', async ({
		page
	}) => {
		const avatarRequests = watchAvatarRequests(page);
		await load(page);
		await page.clock.runFor(120_000);
		expect(avatarRequests).toHaveLength(0);
		await expect(page.locator('[data-glitch], [data-show], .glitch')).toHaveCount(0);
		await expect(page.getByRole('button', { name: PAUSE_NL })).toHaveCount(0);
		await expect(page.locator('#hero img, #hero picture')).toHaveCount(0);
		await expect(page.locator('#hero svg.logo')).toHaveCount(1);
	});

	test('ships no glitch code, styles or avatar file', async () => {
		// The build the server serves: e2e-out/company, under its base path.
		const out = path.join(process.cwd(), 'e2e-out', 'company');
		const files = readdirSync(out, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => path.join(entry.parentPath, entry.name));
		expect(files.length).toBeGreaterThan(20);
		expect(files.filter((file) => /roboroads-avatar/i.test(file))).toEqual([]);
		const text = files.filter((file) => /\.(js|css|html|json)$/.test(file));
		expect(text.length).toBeGreaterThan(5);
		const found = text.filter((file) =>
			/glitch|roboroads-avatar/i.test(readFileSync(file, 'utf8'))
		);
		expect(found.map((file) => path.relative(out, file))).toEqual([]);
	});
});
