/**
 * The intro sections on the personal build. The variant is a build-time constant, so this file runs
 * the personal build; the company build is in intro.svelte.test.ts.
 */
import '../../app.css';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { company } from '#lib/content/company.js';
import { getContent } from '#lib/content/index.js';
import { profiles, visibleProfiles } from '#lib/content/profiles.js';
import { EMAIL_FALLBACK_TEXT } from '#lib/email.js';
import { overwriteGetLocale, type Locale } from '#lib/paraglide/runtime.js';
import { SOCKET_DRAW_MS } from '#lib/pcb/growth.js';
import { chips, obstacles, socket } from '#lib/pcb/registry.svelte.js';
import Availability from './Availability.svelte';
import Contact from './Contact.svelte';
import Hero from './Hero.svelte';
import About from './About.svelte';
import Competences from './Competences.svelte';

// The same values as `variants.personal` in site.ts (importActual does not load site.ts in browser mode).
vi.mock('../site.js', () => ({
	site: 'personal',
	variant: {
		site: 'personal',
		heroOrder: ['photo', 'logo'],
		primaryPath: 'job',
		availabilityOrder: ['job', 'freelance']
	},
	COMPANY_SITE_URL: 'https://company.example/'
}));

// Built from parts: the address and the mail scheme are never written out (see CLAUDE.md).
const address = ['info', '@', 'it-it', '.', 'tech'].join('');
const scheme = ['mail', 'to'].join('');

const content = { nl: getContent('nl'), en: getContent('en') };

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
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
	let target: HTMLElement | undefined;
	if (withMain) {
		target = document.createElement('main');
		document.body.append(target);
		mains.push(target);
	}
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
	it('is the page heading with the display name, then the English tagline, and no lead line', async () => {
		const screen = await mount(Hero);
		await expect
			.element(screen.getByRole('heading', { level: 1, name: 'Robbin "Roboroads" Schepers' }))
			.toBeVisible();
		expect(hero().querySelector('h1 .nick')!.textContent).toBe('Roboroads');
		expect(getComputedStyle(hero().querySelector('h1 .nick')!).fontFamily).toContain('Fira Code');
		const tagline = Array.from(hero().querySelectorAll<HTMLElement>('[lang]')).find(
			(el) => el.textContent?.trim() === 'Professional Computer Nerd'
		);
		expect(tagline?.getAttribute('lang')).toBe('en');
		// The tagline says what he does; the personal page has no lead line either.
		expect(hero().querySelector('.lead')).toBeNull();
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
			expect(follow.querySelector('.handle')!.textContent).toBe(company.githubHandle);
			expect(follow.querySelector('a')).toBeNull();
			expect(obstacles()[0].contains(follow)).toBe(true);
		});
	}

	it('has no CTAs: the links are the profile icons and the scroll indicator, no email', async () => {
		await mount(Hero);
		expect(hero().querySelectorAll('button, .cta, .email, [href^="mailto"]')).toHaveLength(0);
		const links = Array.from(hero().querySelectorAll('a'));
		expect(links.map((a) => a.getAttribute('href'))).toEqual([
			...visibleProfiles().map((p) => p.url),
			'#availability'
		]);
		expect(hero().lastElementChild).toBe(hero().querySelector('a.scroll-indicator'));
	});

	for (const locale of ['nl', 'en'] as const) {
		it(`shows the ten profile icons with names and rel me in ${locale}`, async () => {
			setLocale(locale);
			const screen = await mount(Hero);
			const on = locale === 'nl' ? 'Robbin op' : 'Robbin on';
			const notice = locale === 'nl' ? '(externe site)' : '(external site)';
			const row = hero().querySelector<HTMLElement>('ul.profiles')!;
			expect(row.querySelectorAll('a')).toHaveLength(10);
			for (const profile of profiles) {
				const link = screen.getByRole('link', { name: `${on} ${profile.name} ${notice}` });
				await expect.element(link).toHaveAttribute('href', profile.url);
				expect(link.element().getAttribute('rel')).toBe('me noopener');
				expect(link.element().getBoundingClientRect().width).toBeGreaterThanOrEqual(24);
			}
			expect(obstacles()[0].contains(row)).toBe(true);
		});
	}

	it('shows the photo with its alt text, and no logo', async () => {
		const screen = await mount(Hero);
		const photo = screen.getByRole('img', { name: content.nl.hero.photoAlt });
		await expect.element(photo).toBeVisible();
		expect(hero().querySelector('svg.logo')).toBeNull();
	});

	// Not a wait for the image to load: how fast the dev server makes the AVIF, WebP and JPEG
	// versions varies, and the <img> load event with it. Asking for each file proves that it exists
	// and is served as an image, with no timing in the assertion.
	it('offers the photo as AVIF and WebP with a JPEG behind them, and every file is served', async () => {
		await mount(Hero);
		const picture = hero().querySelector('picture')!;
		const types = Array.from(picture.querySelectorAll('source')).map((s) => s.type);
		expect(types).toEqual(expect.arrayContaining(['image/avif', 'image/webp']));

		const img = picture.querySelector('img')!;
		expect(img.getAttribute('src')).toBeTruthy();
		expect(img.getAttribute('width')).toBeTruthy();
		expect(img.getAttribute('height')).toBeTruthy();

		const files = [
			img.getAttribute('src')!,
			...Array.from(picture.querySelectorAll('source')).map(
				(s) => s.getAttribute('srcset')!.split(',')[0].trim().split(' ')[0]
			)
		];
		expect(files.length).toBeGreaterThanOrEqual(3);
		for (const file of files) {
			const response = await fetch(new URL(file, document.baseURI));
			expect(response.ok, file).toBe(true);
			expect(response.headers.get('content-type'), file).toMatch(/^image\//);
		}
	}, 30_000);

	it('says the alt text in English too', async () => {
		setLocale('en');
		const screen = await mount(Hero);
		await expect.element(screen.getByRole('img', { name: content.en.hero.photoAlt })).toBeVisible();
	});

	it('does not hide the photo from screen readers, and hides the footprint', async () => {
		await mount(Hero);
		const img = hero().querySelector('img')!;
		expect(img.closest('[aria-hidden="true"]')).toBeNull();
		const pads = hero().querySelector('.pads')!;
		expect(pads.getAttribute('aria-hidden')).toBe('true');
		expect(pads.querySelector('a, button, [tabindex]')).toBeNull();
		expect(hero().querySelector('.courtyard')!.getAttribute('aria-hidden')).toBe('true');
	});
});

describe('Hero socket and obstacle', () => {
	it('registers the photo frame as the socket', async () => {
		await mount(Hero);
		const handle = socket();
		expect(handle).not.toBeNull();
		expect(handle!.el.querySelector('img')).not.toBeNull();
	});

	it('has 8 ports, two on every side, cyan on the left half and green on the right', async () => {
		await mount(Hero);
		const handle = socket()!;
		const ports = handle.ports();
		expect(ports).toHaveLength(8);
		const rect = handle.el.getBoundingClientRect();
		const centre = rect.left + rect.width / 2;
		const bySide = { top: 0, bottom: 0, left: 0, right: 0 };
		for (const port of ports) {
			const box = port.getBoundingClientRect();
			const x = box.left + box.width / 2;
			const y = box.top + box.height / 2;
			// Inside the socket, on its outer ring.
			expect(x).toBeGreaterThanOrEqual(rect.left);
			expect(x).toBeLessThanOrEqual(rect.right);
			expect(y).toBeGreaterThanOrEqual(rect.top);
			expect(y).toBeLessThanOrEqual(rect.bottom);
			expect(port.dataset.port).toBe(x < centre ? 'cyan' : 'green');
			const edge = Math.min(x - rect.left, rect.right - x, y - rect.top, rect.bottom - y);
			expect(edge).toBeLessThan(rect.width / 11);
			if (y - rect.top < rect.height / 11) bySide.top++;
			else if (rect.bottom - y < rect.height / 11) bySide.bottom++;
			else if (x < centre) bySide.left++;
			else bySide.right++;
		}
		expect(bySide).toEqual({ top: 2, bottom: 2, left: 2, right: 2 });
	});

	it('frames the photo with a ring of pads and keeps it square', async () => {
		await mount(Hero);
		expect(hero().querySelectorAll('.pad').length).toBeGreaterThanOrEqual(36);
		const box = socket()!.el.getBoundingClientRect();
		expect(box.width).toBeCloseTo(box.height, 0);
		const photo = hero().querySelector('img')!.getBoundingClientRect();
		// The photo sits inside the pad ring, not under it.
		expect(photo.left - box.left).toBeGreaterThan(box.width / 11);
		expect(box.right - photo.right).toBeGreaterThan(box.width / 11);
	});

	it('registers the text block as the only obstacle', async () => {
		await mount(Hero);
		const list = obstacles();
		expect(list).toHaveLength(1);
		expect(list[0].contains(hero().querySelector('h1'))).toBe(true);
		expect(list[0].contains(socket()!.el)).toBe(false);
	});

	it('leaves a corridor between socket and text for the traces that come in from below', async () => {
		await mount(Hero);
		const gap =
			obstacles()[0].getBoundingClientRect().top - socket()!.el.getBoundingClientRect().bottom;
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
	it('lights the glow, the 8 ports and the line under the name, each once, within 5 seconds', async () => {
		await mount(Hero);
		const all = heroAnimations();
		const names = all.map((a) => a.name);
		expect(names).toContain('glow-up');
		expect(names).toContain('rule-draw');
		expect(names.filter((n) => n === 'port-on')).toHaveLength(8);
		for (const animation of all) {
			expect(animation.iterations, animation.name).toBeLessThan(Infinity);
			expect(animation.endTime, animation.name).toBeLessThan(5000);
		}
	});

	it('is static under reduced motion: the ports are lit from the first frame', async () => {
		document.documentElement.classList.add('reduced');
		try {
			await mount(Hero);
			expect(heroAnimations()).toEqual([]);
			for (const port of socket()!.ports()) {
				expect(getComputedStyle(port).boxShadow).not.toBe('none');
			}
		} finally {
			document.documentElement.classList.remove('reduced');
		}
	});

	it('marks two ports, one on each side, for the lead traces of the board', async () => {
		await mount(Hero);
		const leads = socket()!
			.ports()
			.filter((port) => port.hasAttribute('data-lead'));
		expect(leads.map((port) => port.style.gridColumn).sort()).toEqual(['1', '11']);
	});

	it('draws the outline in two halves, each from where a lead touches it', async () => {
		await mount(Hero);
		const halves = [...hero().querySelectorAll<SVGPolylineElement>('.courtyard .outline')];
		expect(halves).toHaveLength(2);
		const leads = socket()!
			.ports()
			.filter((port) => port.hasAttribute('data-lead'));
		const rowOf = (port: HTMLElement) => ((Number(port.style.gridRow) - 0.5) / 11) * 100;
		const left = leads.find((port) => port.style.gridColumn === '1')!;
		const right = leads.find((port) => port.style.gridColumn === '11')!;
		const first = (half: SVGPolylineElement) => half.points.getItem(0);
		expect(first(halves[0]).x).toBeCloseTo(0.5);
		expect(first(halves[0]).y).toBeCloseTo(rowOf(left), 1);
		expect(first(halves[1]).x).toBeCloseTo(99.5);
		expect(first(halves[1]).y).toBeCloseTo(rowOf(right), 1);
		// Each half ends where the other starts: together they are the whole outline.
		const last = (half: SVGPolylineElement) => half.points.getItem(half.points.numberOfItems - 1);
		expect(last(halves[0])).toMatchObject({ x: first(halves[1]).x, y: first(halves[1]).y });
		expect(last(halves[1])).toMatchObject({ x: first(halves[0]).x, y: first(halves[0]).y });
	});

	describe('with scripts', () => {
		afterEach(() => document.documentElement.classList.remove('js'));

		it('waits for the board to power the socket, then draws the outline and lights the ports', async () => {
			document.documentElement.classList.add('js');
			await mount(Hero);
			const outline = hero().querySelector<SVGPolylineElement>('.courtyard .outline')!;
			expect(getComputedStyle(outline).animationDelay).toBe('6s');
			socket()!.el.setAttribute('data-power', 'on');
			expect(getComputedStyle(outline).animationName).toMatch(/outline-draw-powered/);
			expect(getComputedStyle(outline).animationDelay).toBe('0s');
			const port = socket()!.ports()[0];
			expect(getComputedStyle(port).animationName).toMatch(/port-on-powered/);
		});

		it('is done drawing when the board is: within the time the board gives it', async () => {
			document.documentElement.classList.add('js');
			await mount(Hero);
			socket()!.el.setAttribute('data-power', 'on');
			const ends = socket()!
				.el.getAnimations({ subtree: true })
				.map((animation) => Number(animation.effect!.getComputedTiming().endTime));
			expect(ends.length).toBeGreaterThan(0);
			expect(Math.max(...ends)).toBeLessThanOrEqual(SOCKET_DRAW_MS);
		});
	});
});

describe('Hero focal point', () => {
	it('makes the photo the biggest thing in the hero on a desktop window', async () => {
		await page.viewport(1440, 900);
		await mount(Hero, true);
		const frame = socket()!.el.getBoundingClientRect();
		const copy = obstacles()[0].getBoundingClientRect();
		// A big frame, at least 400px a side, and taller than the whole text block under it.
		expect(frame.width).toBeGreaterThanOrEqual(400);
		expect(frame.height).toBeGreaterThan(copy.height);
		// The photo itself is more than 320px a side, inside its pad ring.
		const photo = hero().querySelector('img')!.getBoundingClientRect();
		expect(photo.width).toBeGreaterThanOrEqual(320);
	});

	it('keeps the photo big on a short laptop window and the hero one window high', async () => {
		await page.viewport(1280, 720);
		await mount(Hero, true);
		const frame = socket()!.el.getBoundingClientRect();
		expect(frame.width).toBeGreaterThanOrEqual(280);
		const box = hero().getBoundingClientRect();
		expect(box.height).toBeCloseTo(720, 0);
	});

	it('is the only visual in the hero: no logo next to the photo', async () => {
		await mount(Hero);
		expect(hero().querySelector('svg')).not.toBeNull(); // the footprint outline
		expect(hero().querySelector('svg.logo')).toBeNull();
		expect(hero().querySelectorAll('img')).toHaveLength(1);
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

	it('grows at 400% zoom without clipping anything', async () => {
		await page.viewport(320, 256);
		await mount(Hero, true);
		const box = hero().getBoundingClientRect();
		expect(box.height).toBeGreaterThan(256);
		expect(hero().scrollHeight).toBeLessThanOrEqual(hero().clientHeight);
		for (const part of hero().querySelectorAll(
			'h1, .tagline, .follow, a.scroll-indicator, .socket'
		)) {
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

	it('has the job chip first and the freelance chip second', async () => {
		await mount(Availability);
		const ids = Array.from(document.querySelectorAll('#availability > section')).map((s) => s.id);
		expect(ids).toEqual(['job', 'freelance']);
		expect(chips().map((c) => [c.id, c.designator, c.side])).toEqual([
			['job', 'U1', 'left'],
			['freelance', 'U2', 'right']
		]);
	});

	it('fills the job CTA, which links to LinkedIn, and outlines the freelance one', async () => {
		await mount(Availability);
		const job = section('job').querySelector('a.cta')!;
		expect(job.getAttribute('href')).toBe(company.linkedin);
		expect(job.classList.contains('cta-filled')).toBe(true);
		const freelance = section('freelance').querySelector('a.cta')!;
		expect(freelance.classList.contains('cta-filled')).toBe(false);
		expect(freelance.classList.contains('cta-freelance')).toBe(true);
	});

	it('links the freelance CTA to I.T. It in Dutch, naming it as an external site', async () => {
		const screen = await mount(Availability);
		const link = screen.getByRole('link', {
			name: `${content.nl.availability.freelance.cta} (externe site)`
		});
		await expect.element(link).toHaveAttribute('href', 'https://company.example/');
	});

	it('links the freelance CTA to the English page of I.T. It in English', async () => {
		setLocale('en');
		const screen = await mount(Availability);
		const link = screen.getByRole('link', {
			name: `${content.en.availability.freelance.cta} (external site)`
		});
		await expect.element(link).toHaveAttribute('href', 'https://company.example/en/');
	});

	it('shows no email at all: no mail link, no address, no spelled-out fallback', async () => {
		await mount(Availability);
		const root = document.getElementById('availability')!;
		expect(root.querySelector('.email')).toBeNull();
		expect(root.querySelector(`a[href^="${scheme}"]`)).toBeNull();
		expect(root.textContent).not.toContain('[at]');
		expect(root.textContent).not.toContain(EMAIL_FALLBACK_TEXT);
		expect(root.innerHTML).not.toContain(address);
		expect(root.innerHTML).not.toContain(scheme);
	});

	it('shows I.T. It as a small logo in the freelance chip only, and names it', async () => {
		await page.viewport(1280, 900);
		const screen = await mount(Availability, true);
		const logos = document.querySelectorAll<SVGElement>('#availability svg.logo');
		expect(logos).toHaveLength(1);
		expect(section('freelance').contains(logos[0])).toBe(true);
		expect(section('job').querySelector('svg.logo')).toBeNull();
		// Small and still: a mark next to the title, not a picture.
		const box = logos[0].getBoundingClientRect();
		expect(box.width).toBeGreaterThanOrEqual(80);
		expect(box.width).toBeLessThanOrEqual(130);
		expect(logos[0].classList.contains('animate')).toBe(false);
		await expect.element(screen.getByRole('img', { name: content.nl.hero.logoAlt })).toBeVisible();
		// The chip is still named by its h2.
		expect(section('freelance').getAttribute('aria-labelledby')).toBe(
			section('freelance').querySelector('h2')!.id
		);
	});

	it('keeps the logo beside the title on a phone, without sideways scroll', async () => {
		await page.viewport(320, 640);
		await mount(Availability, true);
		const logo = document.querySelector('#availability svg.logo')!.getBoundingClientRect();
		expect(logo.right).toBeLessThanOrEqual(320);
		const root = document.documentElement;
		expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
	});

	it('still shows the freelance hours and what I.T. It takes on', async () => {
		await mount(Availability);
		expect(section('freelance').textContent).toContain(content.nl.availability.freelance.hours);
		expect(section('freelance').querySelectorAll('li')).toHaveLength(4);
	});

	it('prints the page from the print button', async () => {
		const print = vi.spyOn(window, 'print').mockImplementation(() => {});
		const screen = await mount(Availability);
		await screen.getByRole('button', { name: content.nl.availability.job.print }).click();
		expect(print).toHaveBeenCalledTimes(1);
	});
});

describe('Contact', () => {
	const section = () => document.querySelector<HTMLElement>('section#contact')!;

	it('lists LinkedIn, GitHub and a link to I.T. It, in that order, and no email', async () => {
		const screen = await mount(Contact);
		const labels = Array.from(section().querySelectorAll('a')).map((a) => a.getAttribute('href'));
		expect(labels).toEqual([company.linkedin, company.github, 'https://company.example/']);
		await expect
			.element(
				screen.getByRole('link', { name: `${content.nl.contact.labels.company} (externe site)` })
			)
			.toBeVisible();
		expect(section().querySelector('.email')).toBeNull();
		expect(section().querySelector(`a[href^="${scheme}"]`)).toBeNull();
		expect(section().textContent).not.toContain('[at]');
		expect(section().textContent).not.toContain(content.nl.contact.labels.email);
		expect(section().innerHTML).not.toContain(address);
	});

	it('links to the English page of I.T. It on the English page', async () => {
		setLocale('en');
		const screen = await mount(Contact);
		const link = screen.getByRole('link', {
			name: `${content.en.contact.labels.company} (external site)`
		});
		await expect.element(link).toHaveAttribute('href', 'https://company.example/en/');
	});

	it('has three rows with three decorative pads', async () => {
		await mount(Contact);
		expect(section().querySelectorAll('ul > li')).toHaveLength(3);
		const pads = section().querySelectorAll('.pad');
		expect(pads).toHaveLength(3);
		for (const pad of pads) expect(pad.getAttribute('aria-hidden')).toBe('true');
	});

	it('has no sideways scroll at 320 CSS px', async () => {
		await page.viewport(320, 640);
		await mount(Contact, true);
		const root = document.documentElement;
		expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
	});
});

describe('the page together', () => {
	it('survives the WCAG text spacing overrides at 320 CSS px without sideways scroll', async () => {
		await page.viewport(320, 640);
		const spacing = document.createElement('style');
		// 1.4.12: line height 1.5, letter spacing 0.12em, word spacing 0.16em, paragraph gap 2em.
		spacing.textContent =
			'*{line-height:1.5 !important;letter-spacing:0.12em !important;word-spacing:0.16em !important} p{margin-bottom:2em !important}';
		document.head.append(spacing);
		try {
			const target = document.createElement('main');
			document.body.append(target);
			mains.push(target);
			for (const component of [Hero, Availability, About, Competences, Contact]) {
				await render(component, { target });
			}
			await fontsLoaded();
			const root = document.documentElement;
			expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
			const box = hero().getBoundingClientRect();
			for (const part of hero().querySelectorAll('h1, .tagline, .follow, a.scroll-indicator')) {
				expect(part.getBoundingClientRect().bottom).toBeLessThanOrEqual(box.bottom + 0.5);
			}
		} finally {
			spacing.remove();
		}
	});

	it('registers every chip once, with the job chip first, and leaves no email anywhere', async () => {
		const target = document.createElement('main');
		document.body.append(target);
		mains.push(target);
		for (const component of [Hero, Availability, About, Competences, Contact]) {
			await render(component, { target });
		}
		expect(chips().map((c) => c.designator)).toEqual(['U1', 'U2', 'U3', 'U4', 'U9']);
		// The photo leads the page; the only logo is the small one by the I.T. It chip.
		const logos = Array.from(target.querySelectorAll<SVGElement>('svg.logo'));
		expect(logos).toHaveLength(1);
		expect(logos[0].getBoundingClientRect().width).toBeLessThan(
			socket()!.el.getBoundingClientRect().width / 2
		);
		const html = target.innerHTML;
		expect(html).not.toContain(address);
		expect(html).not.toContain(scheme);
		expect(html).not.toContain('[at]');
		expect(target.querySelector('.email')).toBeNull();
		const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
