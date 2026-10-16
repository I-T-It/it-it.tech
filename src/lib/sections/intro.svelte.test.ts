/**
 * The intro sections on the company build: Hero, Availability, About, Competences and Contact.
 * The variant is a build-time constant, so this file runs the company build; the personal build is
 * in intro.personal.svelte.test.ts.
 */
import '../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { company, emailEncoded } from '#lib/content/company.js';
import { getContent } from '#lib/content/index.js';
import { profiles, visibleProfiles } from '#lib/content/profiles.js';
import { decodeEmail, EMAIL_FALLBACK_TEXT } from '#lib/email.js';
import { glitch } from '#lib/glitch/state.svelte.js';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import { SOCKET_DRAW_MS } from '#lib/pcb/growth.js';
import { chips, obstacles, socket } from '#lib/pcb/registry.svelte.js';
import About from './About.svelte';
import Availability from './Availability.svelte';
import Competences from './Competences.svelte';
import Contact from './Contact.svelte';
import Hero from './Hero.svelte';

// The variant is a build-time constant, so the mock holds what the sections read: the same values
// as `variants.company` in site.ts (importActual does not load site.ts in browser mode).
vi.mock('../site.js', () => ({
	site: 'company',
	variant: {
		site: 'company',
		heroOrder: ['logo', 'photo'],
		primaryPath: 'freelance',
		availabilityOrder: ['freelance', 'job']
	},
	COMPANY_SITE_URL: 'https://company.example/',
	PERSONAL_SITE_URL: 'https://personal.example/'
}));

// Built from parts: the address and the mail scheme are never written out (see CLAUDE.md).
const address = ['info', '@', 'it-it', '.', 'tech'].join('');
const scheme = ['mail', 'to'].join('') + ':';

const content = { nl: getContent('nl'), en: getContent('en') };

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

/** A <main> like the page has, so the sections get the real column and the real gaps. */
function mountMain(): HTMLElement {
	const main = document.createElement('main');
	document.body.append(main);
	return main;
}

/** Sizes depend on the fonts: wait until both families are in before measuring. */
async function fontsLoaded() {
	await Promise.all([
		document.fonts.load('500 1rem "Fira Code Variable"'),
		document.fonts.load('400 1rem "Fira Sans"'),
		document.fonts.load('500 1rem "Fira Sans"')
	]);
}

const mains: HTMLElement[] = [];
async function mount(component: Parameters<typeof render>[0], withMain = false) {
	const target = withMain ? mountMain() : undefined;
	if (target) mains.push(target);
	const screen = await render(component, target ? { target } : {});
	await fontsLoaded();
	return screen;
}

afterEach(async () => {
	for (const main of mains.splice(0)) main.remove();
	setLocale('nl');
	await page.viewport(414, 896);
	vi.restoreAllMocks();
});

const hero = () => document.querySelector<HTMLElement>('section#hero')!;

describe('Hero', () => {
	it('is the page heading: one h1 with the display name, Robbin "Roboroads" Schepers', async () => {
		const screen = await mount(Hero);
		await expect
			.element(screen.getByRole('heading', { level: 1, name: 'Robbin "Roboroads" Schepers' }))
			.toBeVisible();
		expect(hero().querySelectorAll('h1')).toHaveLength(1);
		expect(hero().getAttribute('aria-labelledby')).toBe(hero().querySelector('h1')!.id);
		expect(hero().querySelector('h1')!.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			company.displayName
		);
	});

	it('sets the nickname in the heading like the handle: Fira Code, in the accent colour', async () => {
		await mount(Hero);
		const nick = hero().querySelector<HTMLElement>('h1 .nick')!;
		expect(nick.textContent).toBe('Roboroads');
		const style = getComputedStyle(nick);
		expect(style.fontFamily).toContain('Fira Code');
		// --trace-cyan, #00e7ff.
		expect(style.color).toBe('rgb(0, 231, 255)');
		// The quotes are part of the heading text and set quietly beside the nickname.
		const quotes = hero().querySelectorAll<HTMLElement>('h1 .q');
		expect(Array.from(quotes).map((q) => q.textContent)).toEqual(['"', '"']);
		expect(getComputedStyle(quotes[0]).color).not.toBe(style.color);
	});

	for (const [width, height] of [
		[1440, 900],
		[375, 667]
	]) {
		it(`underlines the whole name, its pads on the first and last glyph, at ${width} px`, async () => {
			await page.viewport(width, height);
			await mount(Hero, true);
			const h1 = hero().querySelector('h1')!;
			// The widest line of the name, from its glyphs.
			const range = document.createRange();
			range.selectNodeContents(h1);
			const boxes = [...range.getClientRects()].filter((r) => r.width > 0);
			const lines: { top: number; bottom: number; left: number; right: number }[] = [];
			for (const box of boxes) {
				const middle = (box.top + box.bottom) / 2;
				const line = lines.find((l) => middle > l.top && middle < l.bottom);
				if (line) {
					line.left = Math.min(line.left, box.left);
					line.right = Math.max(line.right, box.right);
				} else lines.push({ top: box.top, bottom: box.bottom, left: box.left, right: box.right });
			}
			const widest = lines.reduce((a, b) => (b.right - b.left > a.right - a.left ? b : a));
			await expect
				.poll(() => {
					const rule = hero().querySelector('.rule')!.getBoundingClientRect();
					return [rule.left - widest.left, rule.right - widest.right].map(Math.round);
				})
				.toEqual([0, 0]);
		});
	}

	it('keeps the name on one line on a desktop window and on at most two lines on a phone', async () => {
		await page.viewport(1440, 900);
		await mount(Hero, true);
		const h1 = hero().querySelector('h1')!;
		const size = parseFloat(getComputedStyle(h1).fontSize);
		expect(h1.getBoundingClientRect().height).toBeLessThan(size * 1.6);
		await page.viewport(375, 667);
		expect(h1.getBoundingClientRect().height).toBeLessThan(
			parseFloat(getComputedStyle(h1).fontSize) * 2.8
		);
	});

	it('sets the tagline in English, marked as English on a Dutch page', async () => {
		await mount(Hero);
		const tagline = Array.from(hero().querySelectorAll<HTMLElement>('[lang]')).find(
			(el) => el.textContent?.trim() === 'Professional Computer Nerd'
		);
		expect(tagline?.getAttribute('lang')).toBe('en');
	});

	it('keeps the tagline English on the English page', async () => {
		setLocale('en');
		const screen = await mount(Hero);
		await expect.element(screen.getByText('Professional Computer Nerd')).toBeVisible();
	});

	it('has no lead line: the name, the tagline and the handle say who he is', async () => {
		await mount(Hero);
		expect(hero().querySelector('.lead')).toBeNull();
		// What is left of the text block, top to bottom.
		const block = obstacles()[0];
		const parts = Array.from(block.children).map((el) =>
			el.tagName === 'H1'
				? 'h1'
				: ['rule', 'tagline', 'follow', 'profiles'].find((name) => el.classList.contains(name))
		);
		expect(parts).toEqual(['h1', 'rule', 'tagline', 'follow', 'profiles']);
	});

	for (const locale of ['nl', 'en'] as const) {
		it(`says where to follow him online, with the handle set apart, in ${locale}`, async () => {
			setLocale(locale);
			await mount(Hero);
			const follow = hero().querySelector<HTMLElement>('.follow')!;
			expect(follow.textContent?.replace(/\s+/g, ' ').trim()).toBe(
				locale === 'nl'
					? 'Volg me online, overal: @Roboroads'
					: 'Follow me online, everywhere: @Roboroads'
			);
			const handle = follow.querySelector<HTMLElement>('.handle')!;
			expect(handle.textContent).toBe(company.githubHandle);
			expect(getComputedStyle(handle).fontFamily).toContain('Fira Code');
			// Text, not a link: the hero stays free of anything to click but the indicator.
			expect(follow.querySelector('a')).toBeNull();
			// It sits in the block the traces keep out of, under the tagline.
			expect(obstacles()[0].contains(follow)).toBe(true);
			const tagline = hero().querySelector('.tagline')!.getBoundingClientRect();
			expect(follow.getBoundingClientRect().top).toBeGreaterThanOrEqual(tagline.bottom);
		});
	}

	it('has no CTAs: no button, no filled or outline button-link, no mail link', async () => {
		await mount(Hero);
		expect(hero().querySelectorAll('button, .cta, .email, [href^="mailto"]')).toHaveLength(0);
		// The links are the profile icons and the scroll indicator.
		const links = Array.from(hero().querySelectorAll('a'));
		expect(links.map((a) => a.getAttribute('href'))).toEqual([
			...visibleProfiles().map((p) => p.url),
			'#availability'
		]);
	});

	describe('profile row', () => {
		const row = () => hero().querySelector<HTMLElement>('ul.profiles')!;
		const links = () => Array.from(row().querySelectorAll<HTMLAnchorElement>('a'));

		it('shows one icon link for each of the ten profiles, in order', async () => {
			await mount(Hero);
			expect(links().map((a) => a.getAttribute('href'))).toEqual(profiles.map((p) => p.url));
			expect(links()).toHaveLength(10);
		});

		it('sits under the handle line, inside the block the traces keep out of', async () => {
			await mount(Hero);
			const follow = hero().querySelector('.follow')!.getBoundingClientRect();
			expect(row().getBoundingClientRect().top).toBeGreaterThanOrEqual(follow.bottom);
			expect(obstacles()[0].contains(row())).toBe(true);
		});

		for (const locale of ['nl', 'en'] as const) {
			it(`names every link for screen readers and says it leaves the site, in ${locale}`, async () => {
				setLocale(locale);
				const screen = await mount(Hero);
				const on = locale === 'nl' ? 'Robbin op' : 'Robbin on';
				const notice = locale === 'nl' ? '(externe site)' : '(external site)';
				for (const profile of profiles) {
					const link = screen.getByRole('link', { name: `${on} ${profile.name} ${notice}` });
					await expect.element(link).toHaveAttribute('href', profile.url);
				}
			});
		}

		it('opens as an identity link: rel me, and noopener', async () => {
			await mount(Hero);
			for (const link of links()) {
				const rel = (link.getAttribute('rel') ?? '').split(/\s+/);
				expect(rel, link.href).toContain('me');
				expect(rel, link.href).toContain('noopener');
			}
		});

		it('draws the icons as decoration: SVG paths, hidden from screen readers, no text of their own', async () => {
			await mount(Hero);
			for (const link of links()) {
				const svg = link.querySelector('svg')!;
				expect(svg.getAttribute('aria-hidden'), link.href).toBe('true');
				expect(svg.querySelector('path')).not.toBeNull();
			}
			// No icon font, no external image: nothing but inline SVG.
			expect(row().querySelector('img, i, use')).toBeNull();
		});

		it('gives every link a target of at least 24 by 24 CSS px', async () => {
			await mount(Hero);
			for (const link of links()) {
				const box = link.getBoundingClientRect();
				expect(box.width, link.href).toBeGreaterThanOrEqual(24);
				expect(box.height, link.href).toBeGreaterThanOrEqual(24);
			}
		});

		it('shows a focus ring of 2px or more on the focused icon', async () => {
			await mount(Hero);
			links()[2].focus();
			expect(document.activeElement).toBe(links()[2]);
			const style = getComputedStyle(links()[2]);
			expect(style.outlineStyle).toBe('solid');
			expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2);
		});

		it('is one compact row on a desktop window and on a 320 CSS px phone', async () => {
			for (const width of [1280, 320]) {
				await page.viewport(width, 800);
				await mount(Hero, true);
				const tops = new Set(links().map((a) => Math.round(a.getBoundingClientRect().top)));
				expect(tops.size, `${width}px`).toBe(1);
				const right = Math.max(...links().map((a) => a.getBoundingClientRect().right));
				expect(right).toBeLessThanOrEqual(width);
			}
		});

		it('has a name for the list itself', async () => {
			await mount(Hero);
			expect(row().getAttribute('aria-label')).toBe('Online profielen');
		});

		it('names the list in English on the English page', async () => {
			setLocale('en');
			await mount(Hero);
			expect(row().getAttribute('aria-label')).toBe('Online profiles');
		});
	});

	it('ends with the scroll indicator', async () => {
		const screen = await mount(Hero);
		const indicator = screen.getByRole('link', { name: 'Verder' });
		await expect.element(indicator).toHaveAttribute('href', '#availability');
		const last = hero().querySelector('a.scroll-indicator')!;
		expect(hero().lastElementChild).toBe(last);
	});

	it('shows the logo, named for screen readers, and no photo', async () => {
		const screen = await mount(Hero);
		await expect.element(screen.getByRole('img', { name: content.nl.hero.logoAlt })).toBeVisible();
		expect(hero().querySelector('img')).toBeNull();
	});

	it('draws the logo on load', async () => {
		await mount(Hero);
		expect(hero().querySelector('svg.logo')?.classList.contains('animate')).toBe(true);
	});

	// The photo glitch is for the personal build: the company hero has no photo to glitch, and
	// nothing of it is in the markup, whatever the shared glitch state says.
	it('has no photo glitch: no glitch state, no stop switch, no picture, no image but the logo', async () => {
		glitch.armed = true;
		try {
			await mount(Hero);
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(hero().querySelector('[data-glitch], [data-show], .glitch')).toBeNull();
			expect(hero().querySelector('button')).toBeNull();
			expect(hero().querySelector('picture, img')).toBeNull();
			expect(hero().querySelector('.photo-socket, .die')).toBeNull();
			expect(hero().querySelectorAll('svg.logo')).toHaveLength(1);
		} finally {
			glitch.armed = false;
		}
	});
});

describe('Hero socket and obstacle', () => {
	it('registers the logo as the socket, with its two open trace ends as ports', async () => {
		await mount(Hero);
		const handle = socket();
		expect(handle).not.toBeNull();
		expect(handle!.el.querySelector('svg.logo')).not.toBeNull();
		const ports = handle!.ports();
		expect(ports.map((p) => p.dataset.port)).toEqual(['cyan', 'green']);
	});

	it('keeps every port inside the socket', async () => {
		await mount(Hero);
		const handle = socket()!;
		const rect = handle.el.getBoundingClientRect();
		for (const port of handle.ports()) {
			const box = port.getBoundingClientRect();
			const x = box.left + box.width / 2;
			const y = box.top + box.height / 2;
			expect(x).toBeGreaterThanOrEqual(rect.left - 1);
			expect(x).toBeLessThanOrEqual(rect.right + 1);
			expect(y).toBeGreaterThanOrEqual(rect.top - 1);
			expect(y).toBeLessThanOrEqual(rect.bottom + 1);
		}
	});

	it('registers the text block as an obstacle, so traces stay out from under it', async () => {
		await mount(Hero);
		const list = obstacles();
		expect(list).toHaveLength(1);
		const block = list[0];
		expect(block.contains(hero().querySelector('h1'))).toBe(true);
		expect(block.querySelector('.tagline')).not.toBeNull();
		// The socket and the text are different elements: the socket keeps its own clearance.
		expect(block.contains(socket()!.el)).toBe(false);
	});

	it('leaves a corridor between socket and text for the traces that come in from below', async () => {
		await mount(Hero);
		const gap =
			obstacles()[0].getBoundingClientRect().top - socket()!.el.getBoundingClientRect().bottom;
		// The board keeps one 12px cell clear around both, and needs free cells in between.
		expect(gap).toBeGreaterThanOrEqual(48);
	});

	it('unregisters the socket and the obstacle on unmount', async () => {
		const screen = await mount(Hero);
		await screen.unmount();
		expect(socket()).toBeNull();
		expect(obstacles()).toHaveLength(0);
	});
});

/** The CSS animations running in the hero, with the names the stylesheet gave them. */
function heroAnimations(): { name: string; iterations: number; endTime: number }[] {
	return hero()
		.getAnimations({ subtree: true })
		.filter((a): a is CSSAnimation => 'animationName' in a)
		.map((a) => {
			const timing = a.effect!.getComputedTiming();
			return {
				name: a.animationName.replace(/^svelte-[a-z0-9]+-/, ''),
				iterations: timing.iterations as number,
				endTime: timing.endTime as number
			};
		});
}

describe('Hero power-up', () => {
	it('lights the board in one sequence: the glow behind the socket, then the line under the name', async () => {
		await mount(Hero);
		const names = heroAnimations().map((a) => a.name);
		expect(names).toContain('glow-up');
		expect(names).toContain('rule-draw');
	});

	it('plays each animation once and is over well within 5 seconds', async () => {
		await mount(Hero);
		for (const animation of heroAnimations()) {
			expect(animation.iterations, animation.name).toBeLessThan(Infinity);
			expect(animation.endTime, animation.name).toBeLessThan(5000);
		}
	});

	it('never animates the text: the name, tagline and handle line are there from the first frame', async () => {
		await mount(Hero);
		for (const selector of ['h1', '.tagline', '.follow']) {
			const el = hero().querySelector<HTMLElement>(selector)!;
			expect(el.getAnimations(), selector).toHaveLength(0);
			expect(getComputedStyle(el).opacity, selector).toBe('1');
		}
	});

	it('is fully drawn and static under reduced motion', async () => {
		document.documentElement.classList.add('reduced');
		try {
			await mount(Hero);
			expect(heroAnimations()).toEqual([]);
			const rule = getComputedStyle(hero().querySelector('.rule')!);
			expect(rule.clipPath === 'none' || rule.clipPath.includes('-6px')).toBe(true);
		} finally {
			document.documentElement.classList.remove('reduced');
		}
	});
});

describe('Hero text with scripts', () => {
	const root = document.documentElement;
	afterEach(() => root.classList.remove('js', 'reduced'));
	const copy = () => hero().querySelector<HTMLElement>('.copy')!;
	const indicator = () => hero().querySelector<HTMLElement>('.scroll-indicator')!;
	const pulse = () => indicator().querySelector<HTMLElement>('.pulse')!;
	const seconds = (value: string) => parseFloat(value);

	it('keeps the text out of sight until the board is built, and in the accessibility tree', async () => {
		root.classList.add('js');
		const screen = await mount(Hero);
		expect(getComputedStyle(copy()).opacity).toBe('0');
		expect(getComputedStyle(indicator()).opacity).toBe('0');
		// Only out of sight: still there for screen readers, search engines and the layout.
		for (const el of [copy(), indicator()]) {
			const style = getComputedStyle(el);
			expect(style.display).not.toBe('none');
			expect(style.visibility).toBe('visible');
			expect(el.closest('[aria-hidden="true"]')).toBeNull();
		}
		await expect
			.element(screen.getByRole('heading', { level: 1, name: 'Robbin "Roboroads" Schepers' }))
			.toBeInTheDocument();
		await expect.element(screen.getByRole('link', { name: /Verder|Continue/ })).toBeInTheDocument();
	});

	it('brings the text in as the logo finishes, the scroll link 2 s later, its pulse with it', async () => {
		root.classList.add('js');
		await mount(Hero);
		socket()!.el.setAttribute('data-power', 'on');
		const text = getComputedStyle(copy());
		expect(text.animationName).toMatch(/text-in-powered/);
		expect(seconds(text.animationDelay) * 1000).toBe(SOCKET_DRAW_MS);
		const link = getComputedStyle(indicator());
		expect(link.animationName).toMatch(/text-in-powered/);
		expect(seconds(link.animationDelay) * 1000).toBe(SOCKET_DRAW_MS + 2000);
		const light = getComputedStyle(pulse());
		expect(seconds(light.animationDelay) * 1000).toBeGreaterThanOrEqual(SOCKET_DRAW_MS + 2000);
		expect(light.animationIterationCount).toBe('3');
		for (const el of [copy(), indicator()]) for (const a of el.getAnimations()) a.finish();
		expect(getComputedStyle(copy()).opacity).toBe('1');
		expect(getComputedStyle(indicator()).opacity).toBe('1');
	});

	it('shows it all at once when keyboard focus lands in the hero', async () => {
		root.classList.add('js');
		await mount(Hero);
		hero().querySelector<HTMLElement>('.profiles a')!.focus();
		expect(getComputedStyle(copy()).opacity).toBe('1');
		expect(getComputedStyle(indicator()).opacity).toBe('1');
	});

	it('shows it from the first frame under reduced motion and without scripts', async () => {
		root.classList.add('js', 'reduced');
		await mount(Hero);
		expect(getComputedStyle(copy()).opacity).toBe('1');
		expect(getComputedStyle(indicator()).opacity).toBe('1');
		root.classList.remove('js', 'reduced');
		expect(getComputedStyle(copy()).opacity).toBe('1');
		expect(getComputedStyle(indicator()).opacity).toBe('1');
	});
});

describe('Hero size', () => {
	it('is at least the viewport high and starts at the top of the page', async () => {
		await page.viewport(1440, 900);
		await mount(Hero, true);
		const box = hero().getBoundingClientRect();
		expect(box.top).toBeCloseTo(0, 0);
		expect(box.height).toBeGreaterThanOrEqual(900);
		expect(box.height).toBeLessThan(900 + 1);
	});

	for (const locale of ['nl', 'en'] as const) {
		it(`is exactly the viewport on a phone, ${locale}`, async () => {
			setLocale(locale);
			await page.viewport(375, 667);
			await mount(Hero, true);
			const box = hero().getBoundingClientRect();
			expect(box.top).toBeCloseTo(0, 0);
			expect(box.height).toBeCloseTo(667, 0);
		});
	}

	it('puts the scroll indicator inside the first screen', async () => {
		await page.viewport(1440, 900);
		await mount(Hero, true);
		const box = hero().querySelector('a.scroll-indicator')!.getBoundingClientRect();
		expect(box.bottom).toBeLessThanOrEqual(900);
	});

	it('grows at 400% zoom without clipping anything', async () => {
		// 1280x1024 at 400% is 320x256 CSS px.
		await page.viewport(320, 256);
		await mount(Hero, true);
		const box = hero().getBoundingClientRect();
		expect(box.height).toBeGreaterThan(256);
		expect(hero().scrollHeight).toBeLessThanOrEqual(hero().clientHeight);
		for (const part of hero().querySelectorAll('h1, .tagline, .follow, a.scroll-indicator, svg')) {
			expect(part.getBoundingClientRect().bottom).toBeLessThanOrEqual(box.bottom + 0.5);
		}
		const root = document.documentElement;
		expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
	});

	for (const width of [320, 375]) {
		it(`has no horizontal scroll at ${width} CSS px`, async () => {
			await page.viewport(width, 640);
			await mount(Hero, true);
			const root = document.documentElement;
			expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
		});
	}
});

describe('Availability', () => {
	const section = (id: string) => document.querySelector<HTMLElement>(`section#${id}`)!;

	it('has the freelance chip first and the job chip second', async () => {
		await mount(Availability);
		const ids = Array.from(document.querySelectorAll('#availability > section')).map((s) => s.id);
		expect(ids).toEqual(['freelance', 'job']);
	});

	it('has no logo of its own on the company build: the hero logo is the one', async () => {
		await mount(Availability);
		expect(document.querySelector('#availability svg.logo, #availability img')).toBeNull();
	});

	it('is the target of the scroll indicator: focusable, with room under the header', async () => {
		await page.viewport(1440, 900);
		await mount(Availability, true);
		const target = document.getElementById('availability')!;
		expect(target.getAttribute('tabindex')).toBe('-1');
		const style = getComputedStyle(target);
		expect(target.getBoundingClientRect().height).toBeGreaterThanOrEqual(900);
		// The header covers the top 56px after a jump from the very top.
		expect(parseFloat(style.paddingTop)).toBeGreaterThanOrEqual(56);
		const firstChip = target.querySelector('section')!.getBoundingClientRect();
		expect(firstChip.top - target.getBoundingClientRect().top).toBeGreaterThanOrEqual(56);
	});

	it('names each chip by its h2 and registers it with the board', async () => {
		const screen = await mount(Availability);
		const nl = content.nl.availability;
		await expect
			.element(screen.getByRole('heading', { level: 2, name: nl.job.title }))
			.toBeVisible();
		await expect
			.element(screen.getByRole('heading', { level: 2, name: nl.freelance.title }))
			.toBeVisible();
		for (const id of ['job', 'freelance']) {
			const h2 = section(id).querySelector('h2')!;
			expect(section(id).getAttribute('aria-labelledby')).toBe(h2.id);
		}
		expect(document.querySelectorAll('#availability h2')).toHaveLength(2);
		expect(chips().map((c) => [c.id, c.designator])).toEqual([
			['freelance', 'U2'],
			['job', 'U1']
		]);
	});

	it('takes the branches from the gutter each chip faces, and keeps the path colours', async () => {
		await mount(Availability);
		expect(chips().map((c) => c.side)).toEqual(['left', 'right']);
		expect(section('job').dataset.accent).toBe('cyan');
		expect(section('freelance').dataset.accent).toBe('green');
	});

	describe('job chip', () => {
		it('links to LinkedIn, says it is an external site and has no email', async () => {
			const screen = await mount(Availability);
			const link = screen.getByRole('link', {
				name: `${content.nl.availability.job.cta} (externe site)`
			});
			await expect.element(link).toHaveAttribute('href', company.linkedin);
			expect(section('job').querySelector('.email, [href^="mailto"]')).toBeNull();
		});

		it('is an outline button on the company build and the freelance one is filled', async () => {
			await mount(Availability);
			const job = section('job').querySelector('a.cta')!;
			expect(job.classList.contains('cta-job')).toBe(true);
			expect(job.classList.contains('cta-filled')).toBe(false);
			const freelance = section('freelance').querySelector('a.cta')!;
			expect(freelance.classList.contains('cta-freelance')).toBe(true);
			expect(freelance.classList.contains('cta-filled')).toBe(true);
		});

		it('prints the page from a real button', async () => {
			const print = vi.spyOn(window, 'print').mockImplementation(() => {});
			const screen = await mount(Availability);
			const button = screen.getByRole('button', { name: content.nl.availability.job.print });
			expect(button.element().tagName).toBe('BUTTON');
			expect(button.element().getAttribute('type')).toBe('button');
			await button.click();
			expect(print).toHaveBeenCalledTimes(1);
		});

		it('says it in English', async () => {
			setLocale('en');
			const screen = await mount(Availability);
			const en = content.en.availability.job;
			await expect.element(screen.getByRole('heading', { name: en.title })).toBeVisible();
			await expect
				.element(screen.getByRole('link', { name: `${en.cta} (external site)` }))
				.toBeVisible();
			await expect.element(screen.getByRole('button', { name: en.print })).toBeVisible();
		});

		it('shows the soft wording for new roles', async () => {
			await mount(Availability);
			for (const paragraph of content.nl.availability.job.body) {
				expect(section('job').textContent).toContain(paragraph);
			}
		});
	});

	describe('freelance chip', () => {
		it('shows the freelance hours and what I.T. It takes on', async () => {
			await mount(Availability);
			const chip = section('freelance');
			expect(chip.textContent).toContain(content.nl.availability.freelance.hours);
			const items = Array.from(chip.querySelectorAll('li')).map((li) => li.textContent?.trim());
			expect(items).toEqual(content.nl.availability.freelance.takesOn);
		});

		it('has a protected email CTA with the Dutch subject once mounted', async () => {
			await mount(Availability);
			const cta = section('freelance').querySelector<HTMLAnchorElement>('a.email.cta')!;
			expect(cta).not.toBeNull();
			await expect
				.poll(() => cta.getAttribute('href'))
				.toBe(`${scheme}${address}?subject=${encodeURIComponent('Project voor I.T. It')}`);
			expect(cta.textContent).toContain(content.nl.availability.freelance.cta);
			expect(cta.textContent).not.toContain('[at]');
		});

		it('has the English label and subject on the English page', async () => {
			setLocale('en');
			await mount(Availability);
			const en = content.en.availability.freelance;
			const cta = section('freelance').querySelector<HTMLAnchorElement>('a.email.cta')!;
			await expect
				.poll(() => cta.getAttribute('href'))
				.toBe(`${scheme}${address}?subject=${encodeURIComponent(en.emailSubject)}`);
			expect(cta.textContent).toContain(en.cta);
		});

		it('writes no address into the page before the script runs', async () => {
			expect(decodeEmail(emailEncoded)).toBe(address);
			expect(EMAIL_FALLBACK_TEXT).not.toContain('@');
		});
	});

	it('sets the two actions rows on the same line when the chips stand side by side', async () => {
		await page.viewport(1280, 900);
		await mount(Availability, true);
		const bottoms = ['job', 'freelance'].map((id) => {
			const chip = section(id).getBoundingClientRect();
			const actions = section(id).querySelector('.actions')!.getBoundingClientRect();
			return Math.round(chip.bottom - actions.bottom);
		});
		expect(bottoms[0]).toBe(bottoms[1]);
		const [freelance, job] = ['freelance', 'job'].map((id) => section(id).getBoundingClientRect());
		expect(freelance.left).toBeLessThan(job.left);
		expect(Math.round(freelance.top)).toBe(Math.round(job.top));
	});

	it('stacks the chips on a phone, still in order, without sideways scroll', async () => {
		await page.viewport(320, 640);
		await mount(Availability, true);
		const [freelance, job] = ['freelance', 'job'].map((id) => section(id).getBoundingClientRect());
		expect(freelance.bottom).toBeLessThanOrEqual(job.top);
		const root = document.documentElement;
		expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
	});

	it('grows at 400% zoom without clipping', async () => {
		await page.viewport(320, 256);
		await mount(Availability, true);
		const target = document.getElementById('availability')!;
		expect(target.scrollHeight).toBeLessThanOrEqual(target.clientHeight);
		for (const id of ['job', 'freelance']) {
			expect(section(id).getBoundingClientRect().bottom).toBeLessThanOrEqual(
				target.getBoundingClientRect().bottom + 0.5
			);
		}
	});
});

describe('About', () => {
	const about = () => document.querySelector<HTMLElement>('section#about')!;

	it('is chip U3, named by its h2, registered with the board', async () => {
		const screen = await mount(About);
		await expect
			.element(screen.getByRole('heading', { level: 2, name: content.nl.about.title }))
			.toBeVisible();
		expect(about().getAttribute('aria-labelledby')).toBe(about().querySelector('h2')!.id);
		expect(chips().map((c) => [c.id, c.designator, c.side])).toEqual([['about', 'U3', 'both']]);
	});

	for (const locale of ['nl', 'en'] as const) {
		it(`shows every paragraph in ${locale}`, async () => {
			setLocale(locale);
			await mount(About);
			const shown = Array.from(about().querySelectorAll('p')).map((p) => p.textContent?.trim());
			expect(shown).toEqual(content[locale].about.paragraphs);
			expect(about().querySelector('h2')!.textContent).toBe(content[locale].about.title);
		});
	}

	it('sets the first paragraph beside the others on a wide window and stacks them on a phone', async () => {
		await page.viewport(1280, 900);
		await mount(About, true);
		const [first, second] = Array.from(about().querySelectorAll('p')).map((p) =>
			p.getBoundingClientRect()
		);
		expect(first.right).toBeLessThanOrEqual(second.left);

		await page.viewport(414, 896);
		const [one, two] = Array.from(about().querySelectorAll('p')).map((p) =>
			p.getBoundingClientRect()
		);
		expect(one.bottom).toBeLessThanOrEqual(two.top + 1);
		const root = document.documentElement;
		expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
	});
});

describe('Competences', () => {
	const section = () => document.querySelector<HTMLElement>('section#competences')!;

	it('is chip U4, named by its h2, registered with the board', async () => {
		const screen = await mount(Competences);
		await expect
			.element(screen.getByRole('heading', { level: 2, name: content.nl.competences.title }))
			.toBeVisible();
		expect(section().getAttribute('aria-labelledby')).toBe(section().querySelector('h2')!.id);
		expect(chips().map((c) => [c.id, c.designator])).toEqual([['competences', 'U4']]);
	});

	for (const locale of ['nl', 'en'] as const) {
		it(`shows the four competences as h3 with their text in ${locale}`, async () => {
			setLocale(locale);
			await mount(Competences);
			const items = content[locale].competences.items;
			expect(items).toHaveLength(4);
			const titles = Array.from(section().querySelectorAll('h3')).map((h) => h.textContent?.trim());
			expect(titles).toEqual(items.map((item) => item.title));
			for (const item of items) expect(section().textContent).toContain(item.text);
			// Only the chip's own heading is an h2.
			expect(section().querySelectorAll('h2')).toHaveLength(1);
		});
	}

	it('lays the four out as 2 by 2 on a wide window and in one column on a phone', async () => {
		await page.viewport(1280, 900);
		await mount(Competences, true);
		const boxes = () =>
			Array.from(section().querySelectorAll('.item')).map((el) => el.getBoundingClientRect());
		const wide = boxes();
		expect(wide).toHaveLength(4);
		expect(Math.round(wide[0].top)).toBe(Math.round(wide[1].top));
		expect(wide[0].right).toBeLessThanOrEqual(wide[1].left + 1);
		expect(wide[2].top).toBeGreaterThanOrEqual(wide[0].bottom - 1);
		expect(Math.round(wide[2].top)).toBe(Math.round(wide[3].top));

		await page.viewport(414, 896);
		const narrow = boxes();
		for (let i = 1; i < narrow.length; i++) {
			expect(narrow[i].top).toBeGreaterThanOrEqual(narrow[i - 1].bottom - 1);
		}
		const root = document.documentElement;
		expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
	});
});

describe('Contact', () => {
	const section = () => document.querySelector<HTMLElement>('section#contact')!;

	it('is chip U9, named by its h2, registered with the board', async () => {
		const screen = await mount(Contact);
		await expect
			.element(screen.getByRole('heading', { level: 2, name: content.nl.contact.title }))
			.toBeVisible();
		expect(section().getAttribute('aria-labelledby')).toBe(section().querySelector('h2')!.id);
		expect(chips().map((c) => [c.id, c.designator])).toEqual([['contact', 'U9']]);
	});

	it('shows the intro line', async () => {
		const screen = await mount(Contact);
		await expect.element(screen.getByText(content.nl.contact.intro!)).toBeVisible();
	});

	it('shows the protected email address as a mail link once mounted', async () => {
		const screen = await mount(Contact);
		const link = screen.getByRole('link', { name: address });
		await expect.element(link).toHaveAttribute('href', `${scheme}${address}`);
		expect(section().textContent).not.toContain('[at]');
	});

	it('links to LinkedIn and GitHub, each saying that it is an external site', async () => {
		const screen = await mount(Contact);
		const linkedin = screen.getByRole('link', { name: 'LinkedIn (externe site)' });
		await expect.element(linkedin).toHaveAttribute('href', company.linkedin);
		const github = screen.getByRole('link', {
			name: `GitHub ${company.githubHandle} (externe site)`
		});
		await expect.element(github).toHaveAttribute('href', company.github);
	});

	it('has no link to I.T. It: this is I.T. It', async () => {
		await mount(Contact);
		expect(section().textContent).not.toContain(content.nl.contact.labels.company);
		expect(section().querySelector('a[href="https://company.example/"]')).toBeNull();
	});

	it('links to the personal site of Robbin, saying that it is an external site', async () => {
		const screen = await mount(Contact);
		const link = screen.getByRole('link', {
			name: `${content.nl.contact.labels.personal} (externe site)`
		});
		await expect.element(link).toHaveAttribute('href', 'https://personal.example/');
		const anchor = section().querySelector<HTMLAnchorElement>(
			'a[href="https://personal.example/"]'
		)!;
		expect(anchor.textContent).toContain('Persoonlijke site van Robbin');
		expect(anchor.querySelector('.sr-only')!.textContent!.trim()).toBe('(externe site)');
	});

	it('links to the English page of the personal site on the English page', async () => {
		setLocale('en');
		const screen = await mount(Contact);
		const link = screen.getByRole('link', {
			name: `${content.en.contact.labels.personal} (external site)`
		});
		await expect.element(link).toHaveAttribute('href', 'https://personal.example/en/');
	});

	it('puts the personal site last, after the email, LinkedIn and GitHub', async () => {
		await mount(Contact);
		const hrefs = Array.from(section().querySelectorAll('a')).map((a) => a.getAttribute('href'));
		expect(hrefs.slice(1)).toEqual([company.linkedin, company.github, 'https://personal.example/']);
	});

	it('lists the four ways to reach him, in a list', async () => {
		await mount(Contact);
		const items = section().querySelectorAll('ul > li');
		expect(items).toHaveLength(4);
		for (const item of items) expect(item.querySelectorAll('a')).toHaveLength(1);
	});

	it('draws the icon pads as decoration, hidden from screen readers', async () => {
		await mount(Contact);
		const pads = section().querySelectorAll('.pad');
		expect(pads).toHaveLength(4);
		for (const pad of pads) {
			expect(pad.getAttribute('aria-hidden')).toBe('true');
			expect(pad.querySelector('a, button, [tabindex]')).toBeNull();
		}
	});

	it('says it in English', async () => {
		setLocale('en');
		const screen = await mount(Contact);
		await expect.element(screen.getByText(content.en.contact.intro!)).toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 'LinkedIn (external site)' }))
			.toBeVisible();
	});

	it('has no sideways scroll at 320 CSS px', async () => {
		await page.viewport(320, 640);
		await mount(Contact, true);
		const root = document.documentElement;
		expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
	});
});

describe('the page together', () => {
	async function mountAll() {
		const target = mountMain();
		mains.push(target);
		for (const component of [Hero, Availability, About, Competences, Contact]) {
			await render(component, { target });
		}
	}

	it('registers every chip once, in DOM order, with no duplicate ids', async () => {
		await mountAll();
		expect(chips().map((c) => c.designator)).toEqual(['U2', 'U1', 'U3', 'U4', 'U9']);
		const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(document.querySelectorAll('h1')).toHaveLength(1);
		expect(document.querySelectorAll('h2')).toHaveLength(5);
	});

	for (const locale of ['nl', 'en'] as const) {
		it(`survives the WCAG text spacing overrides at 320 CSS px without clipping or scrolling sideways, ${locale}`, async () => {
			setLocale(locale);
			await page.viewport(320, 640);
			const spacing = document.createElement('style');
			// 1.4.12: line height 1.5, letter spacing 0.12em, word spacing 0.16em, paragraph gap 2em.
			spacing.textContent =
				'*{line-height:1.5 !important;letter-spacing:0.12em !important;word-spacing:0.16em !important} p{margin-bottom:2em !important}';
			document.head.append(spacing);
			try {
				await mountAll();
				await fontsLoaded();
				const root = document.documentElement;
				expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
				for (const box of document.querySelectorAll('h1, h2, h3, .cta, .way-link')) {
					expect(box.getBoundingClientRect().right).toBeLessThanOrEqual(root.clientWidth);
				}
			} finally {
				spacing.remove();
			}
		});
	}

	it('has no sideways scroll at 320 CSS px with every section in place', async () => {
		await page.viewport(320, 640);
		await mountAll();
		const root = document.documentElement;
		expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
	});
});
