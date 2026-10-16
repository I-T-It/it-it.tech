import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';
import { expectNoAxeViolations } from './axe.js';

// The hero photo glitch: on the personal build the photo now and then tears, flickers the Roboroads
// avatar in for a moment, and every 20 to 40 s swaps to the avatar for a few seconds. The company
// build has no photo and none of this. The clock is faked and paused, so five minutes of glitch
// take a few seconds and every moment is exact.

// The numbers of src/lib/glitch/schedule.ts, written out: the test checks the page against them.
const ARM_AFTER_POWER_MS = 2200 + 2600;
const FIRST_TEASER_MIN_MS = 4000;

const PHOTO_NL = 'Portret van Robbin Schepers';
const AVATAR_NL = /^Avatar van Roboroads/;
const PAUSE_NL = 'Foto-glitch pauzeren';
const PAUSE_EN = 'Pause the photo glitch';

interface LogEntry {
	/** The fake clock, in ms. */
	t: number;
	what: 'data-power' | 'data-glitch' | 'data-show' | 'avatar-added';
	value: string | null;
	/** At data-power: how many requests for the avatar had gone out by then. */
	avatarRequests?: number;
}

/** Writes down, with the fake time, every glitch attribute change and the moment the avatar is added. */
function installLog() {
	const log: LogEntry[] = [];
	(window as unknown as { __glitchLog: LogEntry[] }).__glitchLog = log;
	const avatarRequests = () =>
		performance.getEntriesByType('resource').filter((e) => e.name.includes('roboroads-avatar'))
			.length;
	new MutationObserver((records) => {
		for (const record of records) {
			if (record.type === 'attributes') {
				const what = record.attributeName as LogEntry['what'];
				log.push({
					t: performance.now(),
					what,
					value: (record.target as Element).getAttribute(what),
					avatarRequests: what === 'data-power' ? avatarRequests() : undefined
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
		attributeFilter: ['data-power', 'data-glitch', 'data-show']
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
	const now = await page.evaluate(() => Date.now());
	await page.clock.pauseAt(now + 1500);
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

/** Runs the clock in steps of 250 ms until `done` holds. */
async function runUntil(page: Page, done: () => Promise<boolean>, limitMs = 200_000) {
	for (let spent = 0; spent < limitMs; spent += 250) {
		if (await done()) return;
		await page.clock.runFor(250);
	}
	throw new Error(`not there after ${limitMs} ms of fake time`);
}

/**
 * axe needs the page's timers, and the clock is frozen: tick it 2 ms at a time until axe is done,
 * which is a second of the clock at most, short of the 3 s the avatar holds.
 */
async function axeOnFrozenClock(page: Page) {
	let done = false;
	const run = expectNoAxeViolations(page).finally(() => {
		done = true;
	});
	run.catch(() => {});
	while (!done) {
		await page.clock.runFor(2);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	await run;
}

/** The hold: the avatar is the accessible image. */
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

		// The first glitch is a teaser 4 to 8 s after that.
		const glitches = log.filter((e) => e.what === 'data-glitch' && e.value !== null);
		expect(glitches.length).toBeGreaterThan(0);
		const first = glitches[0];
		expect(first.value).toMatch(/^(tease|flicker)$/);
		expect(first.t - power.t).toBeGreaterThanOrEqual(ARM_AFTER_POWER_MS + FIRST_TEASER_MIN_MS);
		expect(first.t - power.t).toBeLessThanOrEqual(ARM_AFTER_POWER_MS + 8000 + 500);
		// And in five minutes there were swaps.
		expect(glitches.some((e) => e.value === 'swap-in')).toBe(true);
		expect(glitches.some((e) => e.value === 'swap-out')).toBe(true);

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

	test('names the avatar while it holds and the photo again after, in the accessibility tree', async ({
		page
	}) => {
		await load(page);
		await arm(page);
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

	test('passes axe at rest, during the hold and with the switch pressed', async ({ page }) => {
		await load(page);
		await arm(page);
		await axeOnFrozenClock(page);

		// The hold is still there when axe is done.
		await runUntil(page, holding(page));
		await axeOnFrozenClock(page);
		await expect(page.locator('#hero img.avatar:not([aria-hidden="true"])')).toHaveCount(1);

		await page.getByRole('button', { name: PAUSE_NL }).click();
		await expect(page.getByRole('button', { name: PAUSE_NL })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await axeOnFrozenClock(page);
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
		await load(page, 'en/');
		await arm(page);
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
