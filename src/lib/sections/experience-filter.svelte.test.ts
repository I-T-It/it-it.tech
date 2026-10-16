import '../../app.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { getContent } from '#lib/content/index.js';
import type { Locale } from '#lib/content/types.js';
import { jobsWithSkill, skillOptions } from '#lib/format/skills.js';
import { overwriteGetLocale } from '#lib/paraglide/runtime.js';
import Experience from './Experience.svelte';
import { skillFilter } from './skillFilter.svelte.js';

const root = document.documentElement;

const setLocale = (locale: Locale) => overwriteGetLocale(() => locale);

/** Sets the address without SvelteKit's router, which is not running in a component test. */
function setAddress(search: string, hash = '') {
	History.prototype.replaceState.call(history, null, '', location.pathname + search + hash);
}

/** A frame or two, for effects and observers to catch up. */
const frames = () =>
	new Promise<void>((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	);

const jobsOf = (locale: Locale) => getContent(locale).experience.jobs;
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('.timeline > li'));
const shown = () => rows().filter((row) => !row.hidden);
const filter = () => document.querySelector<HTMLElement>('[data-filter]')!;
const status = () => filter().querySelector<HTMLElement>('[role="status"]')!;
const buttons = () => Array.from(filter().querySelectorAll<HTMLButtonElement>('ul button'));
const button = (name: string) =>
	buttons().find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === name)!;
const pressed = () => buttons().filter((b) => b.getAttribute('aria-pressed') === 'true');
const more = () => filter().querySelector<HTMLButtonElement>('button[aria-expanded]');

beforeEach(() => {
	root.classList.add('js');
	setAddress('');
	skillFilter.restore(new Set());
	// Transitions would make computed styles a moving target.
	const style = document.createElement('style');
	style.id = 'no-motion';
	style.textContent = '.job *, .job *::before, .job *::after { transition: none !important; }';
	document.head.append(style);
});

afterEach(async () => {
	setLocale('nl');
	root.classList.remove('js', 'reduced');
	document.getElementById('no-motion')?.remove();
	vi.restoreAllMocks();
	setAddress('');
	skillFilter.restore(new Set());
	await page.viewport(414, 896);
});

describe('Experience filter: the controls', () => {
	it('is a labelled group above the list, with the label saying what the numbers are', async () => {
		const screen = await render(Experience, {});
		const group = screen.getByRole('group', { name: 'Filter op vaardigheid (aantal rollen)' });
		await expect.element(group).toBeVisible();
		const list = document.querySelector('.timeline')!;
		expect(
			filter().compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
			'the filter comes before the list'
		).toBeTruthy();
	});

	it('starts on "Alles" with the number of roles, and lists the skills of two roles or more', async () => {
		await render(Experience, {});
		const jobs = jobsOf('nl');
		expect(buttons()[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(`Alles (${jobs.length})`);
		expect(pressed()).toEqual([buttons()[0]]);

		const offered = skillOptions(jobs);
		const names = offered.map((o) => `${o.label} (${o.count})`);
		const first = buttons()
			.slice(1)
			.map((b) => b.textContent?.replace(/\s+/g, ' ').trim());
		// The first ones are the most used, in order; the rest wait behind the "more" button.
		expect(first).toEqual(names.slice(0, first.length));
		expect(first.length).toBeGreaterThanOrEqual(10);
		expect(button('Laravel (9)')).toBeDefined();
		expect(names.every((n) => !n.endsWith('(1)'))).toBe(true);
	});

	it('uses real buttons that say whether they are on, and nothing else for the state', async () => {
		await render(Experience, {});
		for (const b of buttons()) {
			expect(b.tagName).toBe('BUTTON');
			expect(b.type).toBe('button');
			expect(['true', 'false']).toContain(b.getAttribute('aria-pressed'));
		}
	});

	it('speaks English on the English page', async () => {
		setLocale('en');
		const screen = await render(Experience, {});
		await expect
			.element(screen.getByRole('group', { name: 'Filter by skill (number of roles)' }))
			.toBeVisible();
		expect(buttons()[0].textContent?.replace(/\s+/g, ' ').trim()).toBe(
			`All (${jobsOf('en').length})`
		);
	});

	it('is hidden without JS (no html.js), where every role shows anyway', async () => {
		root.classList.remove('js');
		await render(Experience, {});
		expect(getComputedStyle(filter()).display).toBe('none');
		expect(shown()).toHaveLength(jobsOf('nl').length);
	});

	describe('the long tail', () => {
		it('puts the skills beyond the first twelve behind a button that says how many', async () => {
			await render(Experience, {});
			const total = skillOptions(jobsOf('nl')).length;
			const visible = buttons().length - 1;
			expect(total).toBeGreaterThan(visible);
			const toggle = more()!;
			expect(toggle.getAttribute('aria-expanded')).toBe('false');
			expect(toggle.textContent?.trim()).toBe(`Nog ${total - visible} tonen`);
			expect(toggle.getAttribute('aria-controls')).toBe(filter().querySelector('ul')!.id);
		});

		it('opens to every skill, says "Minder tonen" and closes again', async () => {
			await render(Experience, {});
			const total = skillOptions(jobsOf('nl')).length;
			const before = buttons().length;

			await userEvent.click(more()!);
			expect(more()!.getAttribute('aria-expanded')).toBe('true');
			expect(more()!.textContent?.trim()).toBe('Minder tonen');
			expect(buttons()).toHaveLength(total + 1);

			await userEvent.click(more()!);
			expect(more()!.getAttribute('aria-expanded')).toBe('false');
			expect(buttons()).toHaveLength(before);
		});

		it('keeps the skill in use on screen when it is in the tail', async () => {
			setAddress('?skill=apache');
			await render(Experience, {});
			await expect.poll(() => pressed().map((b) => b.textContent?.trim())).toEqual(['Apache (2)']);
			expect(more()!.getAttribute('aria-expanded')).toBe('false');
		});

		it('keeps a skill of one role on screen too, e.g. when a link from Skills asks for it', async () => {
			setAddress('?skill=python');
			await render(Experience, {});
			await expect.poll(() => pressed().map((b) => b.textContent?.trim())).toEqual(['Python (1)']);
		});
	});

	describe('size and focus', () => {
		it('has targets of at least 24 by 24 px, and room between them', async () => {
			await page.viewport(320, 700);
			await render(Experience, {});
			for (const b of [...buttons(), more()!]) {
				const box = b.getBoundingClientRect();
				expect(box.width, b.textContent ?? '').toBeGreaterThanOrEqual(24);
				expect(box.height, b.textContent ?? '').toBeGreaterThanOrEqual(24);
			}
		});

		it('takes the keyboard: Tab reaches a chip, which shows a 2px ring, and Enter and Space press it', async () => {
			await render(Experience, {});
			// A click on the empty page gives the test window the focus, so Tab starts from the top.
			await userEvent.click(document.body, { position: { x: 1, y: 1 } });
			(document.activeElement as HTMLElement | null)?.blur();
			await userEvent.tab();
			expect(document.activeElement).toBe(buttons()[0]);
			const outline = getComputedStyle(buttons()[0]);
			expect(outline.outlineStyle).not.toBe('none');
			expect(parseFloat(outline.outlineWidth)).toBeGreaterThanOrEqual(2);

			await userEvent.tab();
			expect(document.activeElement).toBe(buttons()[1]);
			await userEvent.keyboard('{Enter}');
			expect(buttons()[1].getAttribute('aria-pressed')).toBe('true');
			await userEvent.keyboard(' ');
			expect(buttons()[1].getAttribute('aria-pressed')).toBe('false');
			expect(document.activeElement).toBe(buttons()[1]);
		});

		it('does not mark the state by colour alone: a pressed chip differs in shape and weight', async () => {
			await render(Experience, {});
			await userEvent.click(button('Laravel (9)'));
			const on = getComputedStyle(button('Laravel (9)'));
			const off = getComputedStyle(button('PHP (11)'));
			expect(on.backgroundColor).not.toBe(off.backgroundColor);
			const dot = (el: HTMLElement) => getComputedStyle(el, '::before');
			expect(dot(button('Laravel (9)')).content).not.toBe('none');
			expect(dot(button('Laravel (9)')).backgroundColor).not.toBe(
				dot(button('PHP (11)')).backgroundColor
			);
		});
	});
});

describe('Experience filter: filtering', () => {
	it('shows only the roles that have the skill, and hides the others from everyone', async () => {
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		const expected = jobsWithSkill(jobsOf('nl'), 'laravel').map((j) => `job-${j.id}`);
		expect(expected).toHaveLength(9);
		expect(shown().map((row) => row.id)).toEqual(expected);
		for (const row of rows().filter((r) => r.hidden)) {
			expect(getComputedStyle(row).display).toBe('none');
		}
		expect(button('Laravel (9)').getAttribute('aria-pressed')).toBe('true');
		expect(pressed()).toHaveLength(1);
	});

	it('finds a role by a tag in another spelling: Vue.js is `vue`', async () => {
		await render(Experience, {});
		await userEvent.click(button('Vue.js (7)'));
		expect(shown().map((row) => row.id)).toEqual(
			jobsWithSkill(jobsOf('nl'), 'vue').map((j) => `job-${j.id}`)
		);
	});

	it('keeps the order of the roles', async () => {
		await render(Experience, {});
		await userEvent.click(button('PHP (11)'));
		const all = rows().map((row) => row.id);
		const kept = shown().map((row) => row.id);
		expect(kept.length).toBeGreaterThan(1);
		expect(kept).toEqual(all.filter((id) => kept.includes(id)));
	});

	it('takes the filter off with "Alles", and with a second press on the same skill', async () => {
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		await userEvent.click(buttons()[0]);
		expect(shown()).toHaveLength(jobsOf('nl').length);
		expect(pressed()).toEqual([buttons()[0]]);

		await userEvent.click(button('Laravel (9)'));
		await userEvent.click(button('Laravel (9)'));
		expect(shown()).toHaveLength(jobsOf('nl').length);
		expect(pressed()).toEqual([buttons()[0]]);
	});

	it('switches from one skill to another, one at a time', async () => {
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		await userEvent.click(button('Docker (7)'));
		expect(pressed().map((b) => b.textContent?.trim())).toEqual(['Docker (7)']);
		expect(shown()).toHaveLength(7);
	});

	it('marks the tag that matched in every role, with more than colour', async () => {
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		for (const row of shown()) {
			const marked = Array.from(row.querySelectorAll<HTMLElement>('.tech li[data-match]'));
			expect(
				marked.map((el) => el.textContent?.trim()),
				row.id
			).toEqual(['Laravel']);
			const other = row.querySelector<HTMLElement>('.tech li:not([data-match])');
			if (other) {
				const on = getComputedStyle(marked[0]);
				const off = getComputedStyle(other);
				expect(on.backgroundColor).not.toBe(off.backgroundColor);
				expect(Number(on.fontWeight)).toBeGreaterThan(Number(off.fontWeight));
			}
		}
	});

	it('marks nothing when no skill is chosen', async () => {
		await render(Experience, {});
		expect(document.querySelectorAll('[data-match]')).toHaveLength(0);
		await userEvent.click(button('Laravel (9)'));
		await userEvent.click(buttons()[0]);
		expect(document.querySelectorAll('[data-match]')).toHaveLength(0);
	});

	it('follows the filter when something else sets it, like a link in Skills', async () => {
		await render(Experience, {});
		skillFilter.select('docker');
		await expect.poll(() => shown().length).toBe(7);
		expect(pressed().map((b) => b.textContent?.trim())).toEqual(['Docker (7)']);
	});
});

describe('Experience filter: what is announced', () => {
	it('has a polite live region that is empty at first, so nothing is read on load', async () => {
		await render(Experience, {});
		const region = status();
		expect(region.getAttribute('role')).toBe('status');
		expect(region.textContent?.trim()).toBe('');
		// The region is in the page before the text changes, which is what makes it announce.
		expect(region.isConnected).toBe(true);
		expect(filter().contains(region)).toBe(true);
	});

	it('says how many roles have the skill', async () => {
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		expect(status().textContent?.trim()).toBe('9 rollen met Laravel');
	});

	it('says "1 rol" in the singular', async () => {
		setAddress('?skill=python');
		await render(Experience, {});
		await expect.poll(() => status().textContent?.trim()).toBe('1 rol met Python');
	});

	it('says that all roles are back after the reset', async () => {
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		await userEvent.click(buttons()[0]);
		expect(status().textContent?.trim()).toBe(`Alle ${jobsOf('nl').length} rollen`);
	});

	it('speaks English, singular and plural', async () => {
		setLocale('en');
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		expect(status().textContent?.trim()).toBe('9 roles with Laravel');
		await userEvent.click(buttons()[0]);
		expect(status().textContent?.trim()).toBe(`All ${jobsOf('en').length} roles`);
		skillFilter.select('python');
		await expect.poll(() => status().textContent?.trim()).toBe('1 role with Python');
	});

	it('keeps room for the line, so the list does not jump when the text appears', async () => {
		await render(Experience, {});
		const before = filter().getBoundingClientRect().height;
		await userEvent.click(button('Laravel (9)'));
		expect(filter().getBoundingClientRect().height).toBe(before);
	});
});

describe('Experience filter: the address', () => {
	it('writes the skill and the section to the address, so the link can be sent', async () => {
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		await expect.poll(() => location.search + location.hash).toBe('?skill=laravel#experience');
		await userEvent.click(buttons()[0]);
		await expect.poll(() => location.search + location.hash).toBe('#experience');
	});

	it('restores the filter from the address on load', async () => {
		setAddress('?skill=vue', '#experience');
		await render(Experience, {});
		await expect.poll(() => shown().length).toBe(7);
		expect(pressed().map((b) => b.textContent?.trim())).toEqual(['Vue.js (7)']);
		expect(status().textContent?.trim()).toBe('7 rollen met Vue.js');
	});

	it('reads any spelling: ?skill=Node.js', async () => {
		setAddress('?skill=Node.js');
		await render(Experience, {});
		await expect.poll(() => shown().length).toBe(7);
	});

	it('shows every role for a skill that no role has', async () => {
		setAddress('?skill=cobol');
		await render(Experience, {});
		await frames();
		expect(shown()).toHaveLength(jobsOf('nl').length);
		expect(pressed()).toEqual([buttons()[0]]);
	});

	it('shows everything first and filters once the page is up: the prerender has no filter', async () => {
		// The first render has no address to read; the filter is applied by an effect after mount.
		setAddress('?skill=docker');
		await render(Experience, {});
		await expect.poll(() => shown().length).toBe(7);
		expect(rows()).toHaveLength(jobsOf('nl').length);
	});
});

describe('Experience filter: the timeline', () => {
	const visibleVias = () => Array.from(document.querySelectorAll('.job:not([hidden]) .via'));
	const visibleTraces = () => Array.from(document.querySelectorAll('.job:not([hidden]) .trace'));

	it('keeps a via for every role on show, and a trace between them but not under the last', async () => {
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		expect(visibleVias()).toHaveLength(9);
		expect(visibleTraces()).toHaveLength(8);
		const last = shown().at(-1)!;
		expect(last.querySelector('.trace')).toBeNull();
		expect(
			shown()
				.slice(0, -1)
				.every((row) => row.querySelector('.trace'))
		).toBe(true);
	});

	it('gives the last role on show no room under it, and the one before it room', async () => {
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		const role = (row: HTMLElement) => getComputedStyle(row.querySelector('.role')!);
		expect(role(shown().at(-1)!).paddingBottom).toBe('0px');
		expect(parseFloat(role(shown()[0]).paddingBottom)).toBeGreaterThan(0);
	});

	it('puts the traces back when the filter goes', async () => {
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		await userEvent.click(buttons()[0]);
		expect(visibleVias()).toHaveLength(jobsOf('nl').length);
		expect(visibleTraces()).toHaveLength(jobsOf('nl').length - 1);
	});

	it('lights the vias of roles that were hidden when they come back, where an observer does it', async () => {
		vi.spyOn(CSS, 'supports').mockReturnValue(false);
		await render(Experience, {});
		await userEvent.click(button('Laravel (9)'));
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
		await frames();
		// The roles come back while the window is at the bottom: some of them end up above it, and
		// nothing will scroll past them to light them.
		skillFilter.select(undefined);
		await frames();
		const above = Array.from(document.querySelectorAll<HTMLElement>('.via')).filter(
			(via) => via.getBoundingClientRect().bottom < 0
		);
		expect(above.length).toBeGreaterThan(0);
		await expect.poll(() => above.filter((via) => !via.hasAttribute('data-lit'))).toEqual([]);
	});
});

describe('Experience filter: the page around it', () => {
	it('fits a 320px window with the controls open and nothing running out of the chip', async () => {
		await page.viewport(320, 700);
		const main = document.createElement('main');
		document.body.append(main);
		await render(Experience, { target: main });
		await userEvent.click(more()!);
		await frames();
		const html = document.documentElement;
		expect(html.scrollWidth).toBeLessThanOrEqual(html.clientWidth);
		const edge = document.querySelector('section')!.getBoundingClientRect().right;
		const strays = Array.from(filter().querySelectorAll('*'))
			.filter((el) => el.getBoundingClientRect().width > 0)
			.filter((el) => el.getBoundingClientRect().right > edge + 0.5);
		expect(strays).toEqual([]);
		main.remove();
	});

	it('prints every role and no filter: the printed CV is the whole CV', async () => {
		await render(Experience, {});
		// The test window cannot print, so read the print rules instead.
		const printRules = Array.from(document.styleSheets)
			.flatMap((sheet) => Array.from(sheet.cssRules))
			.filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule)
			.filter((rule) => rule.media.mediaText === 'print')
			.flatMap((rule) => Array.from(rule.cssRules))
			.filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule);
		const hideFilter = printRules.find((rule) => rule.selectorText.includes('data-filter'));
		expect(hideFilter?.style.display).toBe('none');
		const showRoles = printRules.find((rule) => rule.selectorText.includes('[hidden]'));
		expect(showRoles?.selectorText).toContain('.job');
		expect(showRoles?.style.display).not.toBe('none');
		expect(showRoles?.style.display).not.toBe('');
	});
});
