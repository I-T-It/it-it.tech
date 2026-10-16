import '../../app.css';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { getContent } from '#lib/content/index.js';
import type { Locale } from '#lib/content/types.js';
import { filterableKeys, skillKeyFor } from '#lib/format/skills.js';
import { overwriteGetLocale } from '#lib/paraglide/runtime.js';
import Experience from './Experience.svelte';
import Skills from './Skills.svelte';
import { skillFilter } from './skillFilter.svelte.js';

const root = document.documentElement;
const setLocale = (locale: Locale) => overwriteGetLocale(() => locale);

/** Sets the address without SvelteKit's router, which is not running in a component test. */
function setAddress(search: string, hash = '') {
	History.prototype.replaceState.call(history, null, '', location.pathname + search + hash);
}

const frames = () =>
	new Promise<void>((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	);

const skillRow = (id: string) =>
	document.querySelector<HTMLElement>(`#skills [data-skill="${id}"]`)!;
const linkIn = (id: string) => skillRow(id).querySelector<HTMLAnchorElement>('a');
const links = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('#skills .name a'));

// A section needs room above and below it to scroll through, like on the real page.
let room: HTMLElement[] = [];
function makeRoom() {
	const spacer = () => {
		const el = document.createElement('div');
		el.style.height = '1500px';
		return el;
	};
	room = [spacer(), spacer()];
	document.body.prepend(room[0]);
	document.body.append(room[1]);
}

beforeEach(() => {
	root.classList.add('js');
	setAddress('');
	skillFilter.restore(new Set());
});

afterEach(async () => {
	setLocale('nl');
	root.classList.remove('js', 'reduced');
	room.forEach((el) => el.remove());
	room = [];
	setAddress('');
	skillFilter.restore(new Set());
	window.scrollTo({ top: 0, behavior: 'instant' });
	await page.viewport(414, 896);
});

describe('Skills: links to the roles', () => {
	it('links the skills that a role has among its tags, and no others', async () => {
		await render(Skills, {});
		const content = getContent('nl');
		const available = filterableKeys(content.experience.jobs);
		const all = content.skills.groups.flatMap((g) => g.skills);
		const withRoles = all.filter((s) => skillKeyFor(s, available));
		const without = all.filter((s) => !skillKeyFor(s, available));
		expect(withRoles.length).toBeGreaterThan(20);
		expect(without.length).toBeGreaterThan(5);
		for (const skill of withRoles) expect(linkIn(skill.id), skill.id).not.toBeNull();
		for (const skill of without) expect(linkIn(skill.id), skill.id).toBeNull();
		expect(links()).toHaveLength(withRoles.length);
	});

	it('links Laravel, Vue.js, Node.js, Tailwind CSS, CI/CD, C++ and C#, which the tags spell differently', async () => {
		await render(Skills, {});
		for (const id of ['laravel', 'vue', 'nodejs', 'tailwind', 'ci-cd', 'cpp', 'csharp']) {
			expect(linkIn(id), id).not.toBeNull();
		}
		expect(linkIn('programming')).toBeNull();
		expect(linkIn('cobol')).toBeNull();
	});

	it('is a link with an address of its own, so it also works when copied or opened in a tab', async () => {
		await render(Skills, {});
		expect(linkIn('laravel')!.getAttribute('href')).toBe('?skill=laravel#experience');
		expect(linkIn('vue')!.getAttribute('href')).toBe('?skill=vue#experience');
	});

	it('shows the title as the link text and adds what it does for screen readers only', async () => {
		const screen = await render(Skills, {});
		const link = linkIn('laravel')!;
		expect(link.querySelector('.sr-only')?.textContent?.trim()).toBe(
			'(toon rollen met deze vaardigheid)'
		);
		expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Laravel (toon rollen met deze vaardigheid)'
		);
		// The name starts with the visible text (2.5.3 Label in Name).
		await expect
			.element(screen.getByRole('link', { name: 'Laravel (toon rollen met deze vaardigheid)' }))
			.toBeVisible();
		expect(link.firstChild?.textContent?.trim()).toBe('Laravel');
	});

	it('speaks English on the English page', async () => {
		setLocale('en');
		const screen = await render(Skills, {});
		await expect
			.element(screen.getByRole('link', { name: 'Laravel (show roles with this skill)' }))
			.toBeVisible();
	});

	it('tells the visitor that the underlined skills filter the roles', async () => {
		const screen = await render(Skills, {});
		await expect
			.element(screen.getByText('Een onderstreepte vaardigheid filtert de rollen bij Ervaring.'))
			.toBeVisible();
	});

	it('underlines the link, so it is not found by colour alone', async () => {
		await render(Skills, {});
		expect(getComputedStyle(linkIn('laravel')!).textDecorationLine).toContain('underline');
	});

	it('has a target of at least 24 by 24 px, and a ring when focused', async () => {
		await page.viewport(320, 700);
		await render(Skills, {});
		for (const link of links()) {
			const box = link.getBoundingClientRect();
			expect(box.height, link.textContent ?? '').toBeGreaterThanOrEqual(24);
			expect(box.width, link.textContent ?? '').toBeGreaterThanOrEqual(24);
		}
		// A click on the empty page gives the test window the focus, so Tab starts from the top.
		await userEvent.click(document.body, { position: { x: 1, y: 1 } });
		(document.activeElement as HTMLElement | null)?.blur();
		await userEvent.tab();
		expect(document.activeElement).toBe(links()[0]);
		const style = getComputedStyle(document.activeElement as HTMLElement);
		expect(style.outlineStyle).not.toBe('none');
		expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2);
	});

	it('leaves the LEDs and the years as they were: the level text is still read', async () => {
		await render(Skills, {});
		const row = skillRow('laravel');
		expect(row.querySelector('.leds-visual')?.getAttribute('aria-hidden')).toBe('true');
		expect(row.querySelector('.years')?.getAttribute('aria-hidden')).toBe('true');
		expect(row.querySelector('.meter .sr-only')?.textContent).toBe('niveau 5 van 5, 12 jaar');
	});
});

describe('Skills: pressing a link', () => {
	it('sets the filter, keeps the page where it is and shows the roles with that skill', async () => {
		makeRoom();
		await render(Experience, {});
		await render(Skills, {});
		const before = location.href;
		await userEvent.click(linkIn('laravel')!);
		expect(skillFilter.active).toBe('laravel');
		// No navigation: the page was not reloaded and the address got the skill.
		await expect.poll(() => location.search + location.hash).toBe('?skill=laravel#experience');
		expect(location.pathname).toBe(new URL(before).pathname);
		expect(
			Array.from(document.querySelectorAll<HTMLElement>('.timeline > li')).filter((r) => !r.hidden)
		).toHaveLength(7);
	});

	it('scrolls to the Experience chip, below the header', async () => {
		// No smooth scrolling (it is off under reduced motion): the position is final at once.
		root.classList.add('reduced');
		makeRoom();
		await render(Experience, {});
		await render(Skills, {});
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
		await frames();
		await userEvent.click(linkIn('laravel')!);
		// The top of the chip stops under the header (56px, the scroll padding), not off the window.
		await expect
			.poll(() => Math.round(document.getElementById('experience')!.getBoundingClientRect().top))
			.toBe(56);
		expect(document.getElementById('experience')!.getBoundingClientRect().bottom).toBeGreaterThan(
			0
		);
	});

	it('moves focus to the chip that is on, so the keyboard continues in the filter', async () => {
		makeRoom();
		await render(Experience, {});
		await render(Skills, {});
		linkIn('docker')!.focus();
		await userEvent.keyboard('{Enter}');
		await expect.poll(() => document.activeElement?.textContent?.trim()).toBe('Docker (5)');
		expect(document.activeElement?.getAttribute('aria-pressed')).toBe('true');
	});

	it('works for a skill of one role, which the filter lists for the occasion', async () => {
		makeRoom();
		await render(Experience, {});
		await render(Skills, {});
		await userEvent.click(linkIn('flutter')!);
		await expect.poll(() => document.activeElement?.textContent?.trim()).toBe('Flutter (1)');
		expect(
			Array.from(document.querySelectorAll<HTMLElement>('.timeline > li')).filter((r) => !r.hidden)
		).toHaveLength(1);
	});

	it('says how many roles it found, for a screen reader', async () => {
		makeRoom();
		await render(Experience, {});
		await render(Skills, {});
		await userEvent.click(linkIn('laravel')!);
		await expect
			.poll(() => document.querySelector('#experience [role="status"]')?.textContent?.trim())
			.toBe('7 rollen met Laravel');
	});

	it('does nothing but set the filter when Experience is not on the page', async () => {
		await render(Skills, {});
		await userEvent.click(linkIn('laravel')!);
		expect(skillFilter.active).toBe('laravel');
	});
});
