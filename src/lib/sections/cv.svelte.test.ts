import '../../app.css';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { getContent } from '#lib/content/index.js';
import type { Job, Locale } from '#lib/content/types.js';
import { chips } from '#lib/pcb/registry.svelte.js';
import { overwriteGetLocale } from '#lib/paraglide/runtime.js';
import EducationLanguages from './EducationLanguages.svelte';
import Experience, { newestFirst } from './Experience.svelte';
import Skills, { sortSkills } from './Skills.svelte';
import Talks, { foreignPhrase, newestTalksFirst } from './Talks.svelte';

const root = document.documentElement;
const CYAN = 'rgb(0, 231, 255)';

function setLocale(locale: Locale) {
	overwriteGetLocale(() => locale);
}

/** A frame or two, for scroll-driven animations and observers to catch up. */
const frames = () =>
	new Promise<void>((resolve) =>
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
	);

/** Scroll at once: the page scrolls smoothly otherwise, and a test cannot wait for that. */
const jump = (top: number) => window.scrollTo({ top, behavior: 'instant' });

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

afterEach(async () => {
	setLocale('nl');
	root.classList.remove('js', 'reduced');
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	room.forEach((el) => el.remove());
	room = [];
	jump(0);
	await page.viewport(414, 896);
});

describe('Experience (U5)', () => {
	const jobsOf = (locale: Locale) => getContent(locale).experience.jobs;
	const row = (id: string) => document.querySelector<HTMLElement>(`#job-${id}`)!;
	const rows = () => Array.from(document.querySelectorAll<HTMLElement>('.timeline > li'));

	// The browser tests need no transitions: computed styles would be a moving target.
	let noMotion: HTMLStyleElement;
	beforeEach(() => {
		noMotion = document.createElement('style');
		noMotion.textContent = '.job *, .job *::before, .job *::after { transition: none !important; }';
		document.head.append(noMotion);
	});
	afterEach(() => noMotion.remove());

	describe('content', () => {
		it('is a chip labelled by its h2, registered as U5', async () => {
			const screen = await render(Experience, {});
			const content = getContent('nl').experience;
			await expect.element(screen.getByRole('region', { name: content.title })).toBeVisible();
			expect(document.querySelector('section#experience h2')?.textContent).toBe(content.title);
			const [handle] = chips();
			expect(handle.id).toBe('experience');
			expect(handle.designator).toBe('U5');
			expect(handle.side).toBe('both');
		});

		it('shows the intro under the heading', async () => {
			const screen = await render(Experience, {});
			await expect.element(screen.getByText(getContent('nl').experience.intro!)).toBeVisible();
		});

		it('lists every role, newest start first, with the function as a heading', async () => {
			await render(Experience, {});
			const jobs = jobsOf('nl');
			expect(rows()).toHaveLength(jobs.length);
			expect(rows().map((el) => el.id)).toEqual(jobs.map((job) => `job-${job.id}`));
			const starts = rows().map((el) => el.querySelector('time')!.getAttribute('datetime')!);
			expect(starts).toEqual([...starts].sort().reverse());
			for (const job of jobs) {
				expect(row(job.id).querySelector('h3')?.textContent).toBe(job.title);
			}
		});

		it('puts a list that arrives out of order right, and keeps the order of equal starts', () => {
			// The content promises newest first; the section does not depend on it.
			const job = (id: string, start: string): Job => ({
				id,
				title: id,
				organisation: id,
				start,
				end: null,
				tech: [],
				situation: [],
				tasks: [],
				results: []
			});
			const sorted = newestFirst([
				job('a', '2020-01'),
				job('b', '2024-05'),
				job('c', '2022-09'),
				job('d', '2024-05')
			]);
			expect(sorted.map((j) => j.id)).toEqual(['b', 'd', 'c', 'a']);
		});

		it('names the employer behind the organisation: "via Sopra Steria" on the VWS role', async () => {
			await render(Experience, {});
			const vws = row('vws');
			expect(vws.querySelector('.org')?.textContent).toContain('Ministerie van VWS');
			expect(vws.querySelector('.org')?.textContent).toContain('via Sopra Steria');
		});

		it('writes "via" only where there is an employer that differs from the organisation', async () => {
			await render(Experience, {});
			for (const job of jobsOf('nl')) {
				const text = row(job.id).querySelector('.org')!.textContent!;
				const differs = job.via && job.via.trim() !== job.organisation.trim();
				expect(text.includes('via '), `${job.id}: ${text}`).toBe(Boolean(differs));
			}
		});

		it('ends the three ongoing roles with "heden" and the rest with a month', async () => {
			await render(Experience, {});
			const ongoing = jobsOf('nl').filter((job) => job.end === null);
			expect(ongoing).toHaveLength(3);
			for (const job of jobsOf('nl')) {
				const period = row(job.id).querySelector('.period')!;
				expect(period.textContent).toContain(job.end === null ? 'heden' : '');
				expect(period.querySelectorAll('time')).toHaveLength(job.end === null ? 1 : 2);
				expect(period.textContent).toMatch(/\d{4}/);
			}
			expect(row('vws').querySelector('.period')?.textContent).toBe('apr 2026 – heden');
		});

		it('lists the technologies of the role', async () => {
			await render(Experience, {});
			for (const job of jobsOf('nl')) {
				const tags = Array.from(row(job.id).querySelectorAll('.tech li')).map(
					(li) => li.textContent
				);
				expect(tags).toEqual(job.tech);
			}
		});

		it('hides the Resultaat label for a role without results', async () => {
			await render(Experience, {});
			const bare = jobsOf('nl').filter((job) => job.results.length === 0);
			expect(bare.length).toBeGreaterThanOrEqual(2);
			for (const job of bare) {
				const labels = Array.from(row(job.id).querySelectorAll('dt')).map((dt) => dt.textContent);
				expect(labels).toEqual(['Situatie', 'Taken']);
			}
			const full = jobsOf('nl').find((job) => job.results.length > 0)!;
			const labels = Array.from(row(full.id).querySelectorAll('dt')).map((dt) => dt.textContent);
			expect(labels).toEqual(['Situatie', 'Taken', 'Resultaat']);
		});

		it('links a result that has a public url and prints the rest as plain text', async () => {
			await render(Experience, {});
			let linked = 0;
			let plain = 0;
			for (const job of jobsOf('nl')) {
				const items = Array.from(row(job.id).querySelectorAll('.results li'));
				expect(items).toHaveLength(job.results.length);
				job.results.forEach((result, i) => {
					const a = items[i].querySelector('a');
					if (result.url) {
						linked++;
						expect(a?.getAttribute('href')).toBe(result.url);
						expect(a?.textContent).toContain(result.text);
					} else {
						plain++;
						expect(a).toBeNull();
						expect(items[i].textContent).toBe(result.text);
					}
				});
			}
			expect(linked).toBeGreaterThan(0);
			expect(plain).toBeGreaterThan(0);
			// The internal ZaakVolgSysteem result is text, not a link.
			expect(row('vws').querySelector('.results a')).toBeNull();
		});

		it('says that a result link leaves the site, for screen readers only', async () => {
			await render(Experience, {});
			const withLink = jobsOf('nl').find((job) => job.results.some((r) => r.url))!;
			const link = row(withLink.id).querySelector<HTMLAnchorElement>('.results a')!;
			const notice = link.querySelector<HTMLElement>('.sr-only')!;
			expect(notice.textContent).toContain('(externe site)');
			expect(link.hasAttribute('target')).toBe(false);
			expect(notice.getBoundingClientRect().width).toBeLessThanOrEqual(1);
		});

		it('speaks English on the English page', async () => {
			setLocale('en');
			await render(Experience, {});
			const content = getContent('en').experience;
			expect(document.querySelector('section#experience h2')?.textContent).toBe(content.title);
			const vws = row('vws');
			expect(vws.querySelector('.org')?.textContent).toContain('via Sopra Steria');
			expect(vws.querySelector('.period')?.textContent).toBe('Apr 2026 – present');
			expect(Array.from(vws.querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual([
				content.labels.situation,
				content.labels.tasks,
				content.labels.results
			]);
			expect(content.labels.situation).toBe('Situation');
		});
	});

	describe('details', () => {
		const detailsOf = (id: string) => row(id).querySelector('details')!;

		it('are closed at first and hold the situation, the tasks and the results', async () => {
			await render(Experience, {});
			for (const job of jobsOf('nl')) {
				expect(detailsOf(job.id).open).toBe(false);
				expect(detailsOf(job.id).querySelectorAll('dt').length).toBeGreaterThanOrEqual(2);
			}
		});

		it('is a native disclosure that opens and closes', async () => {
			const screen = await render(Experience, {});
			const job: Job = jobsOf('nl').find((j) => j.id === 'vws')!;
			const details = detailsOf('vws');
			const situation = screen.getByText(job.situation[0]);
			await expect.element(situation).not.toBeVisible();

			details.querySelector('summary')!.click();
			expect(details.open).toBe(true);
			await expect.element(situation).toBeVisible();

			details.querySelector('summary')!.click();
			expect(details.open).toBe(false);
			await expect.element(situation).not.toBeVisible();
		});

		it('names the control after what is inside and after the role', async () => {
			await render(Experience, {});
			const vws = jobsOf('nl').find((job) => job.id === 'vws')!;
			const name = detailsOf('vws').querySelector('summary')!.textContent!;
			// The visible words come first (2.5.3), then the role, so 15 identical buttons are told apart.
			expect(name.startsWith('Situatie, taken en resultaat')).toBe(true);
			expect(name).toContain(vws.title);
			expect(name).toContain(vws.organisation);
		});

		it('leaves out the missing label from the control name too', async () => {
			await render(Experience, {});
			const bare = jobsOf('nl').find((job) => job.results.length === 0)!;
			const name = detailsOf(bare.id).querySelector('summary')!.textContent!;
			expect(name.startsWith('Situatie en taken')).toBe(true);
		});

		it('keeps the control name in English on the English page', async () => {
			setLocale('en');
			await render(Experience, {});
			const name = detailsOf('vws').querySelector('summary')!.textContent!;
			const { situation, tasks, results } = getContent('en').experience.labels;
			// "Situation, tasks and result": the labels of the content, in a list for the language.
			expect(name.toLowerCase()).toMatch(
				new RegExp(`^${situation}, ${tasks} and ${results}`.toLowerCase())
			);
		});

		it('is at least 24px high, takes the keyboard and shows a 2px focus ring', async () => {
			await render(Experience, {});
			const first = rows()[0].querySelector<HTMLElement>('summary')!;
			expect(first.getBoundingClientRect().height).toBeGreaterThanOrEqual(24);
			first.focus();
			expect(document.activeElement).toBe(first);
			const style = getComputedStyle(first);
			expect(style.outlineStyle).toBe('solid');
			expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2);
			await userEvent.keyboard('{Enter}');
			expect(first.closest('details')?.open).toBe(true);
			await userEvent.keyboard(' ');
			expect(first.closest('details')?.open).toBe(false);
		});
	});

	describe('timeline', () => {
		const vias = () => Array.from(document.querySelectorAll<HTMLElement>('.timeline .via'));
		const traces = () => Array.from(document.querySelectorAll<HTMLElement>('.timeline .trace'));
		const color = (el: HTMLElement) => getComputedStyle(el).borderTopColor;
		const drawn = (el: HTMLElement) => new DOMMatrix(getComputedStyle(el).transform).d;

		const list = () => document.querySelector<HTMLElement>('.timeline')!;
		/** Scrolls so that the top of the list is `offset` px below the top of the window. */
		const scrollList = async (offset: number) => {
			jump(list().getBoundingClientRect().top + window.scrollY - offset);
			await frames();
		};

		it('has a via for every job, and the whole trace is decoration', async () => {
			await render(Experience, {});
			expect(vias()).toHaveLength(jobsOf('nl').length);
			for (const via of vias()) {
				expect(via.closest('[aria-hidden="true"]')).not.toBeNull();
				expect(via.closest('details')).toBeNull();
			}
			for (const trace of traces()) {
				expect(trace.closest('[aria-hidden="true"]')).not.toBeNull();
			}
			// Nothing in the rail can take focus or be read.
			expect(document.querySelectorAll('.rail a, .rail button, .rail [tabindex]')).toHaveLength(0);
		});

		it('joins the vias: a trace under each job but the last', async () => {
			await render(Experience, {});
			expect(traces()).toHaveLength(jobsOf('nl').length - 1);
		});

		it('draws every via and trace under reduced motion, whatever the scroll position', async () => {
			root.classList.add('js', 'reduced');
			await render(Experience, {});
			await frames();
			for (const via of vias()) expect(color(via)).toBe(CYAN);
			for (const trace of traces()) expect(drawn(trace)).toBe(1);
			expect(document.querySelectorAll('.timeline[data-driver]')).toHaveLength(0);
		});

		it('is fully drawn without JS: no html.js, nothing waits', async () => {
			vi.spyOn(CSS, 'supports').mockReturnValue(false);
			await render(Experience, {});
			await frames();
			for (const via of vias()) expect(color(via)).toBe(CYAN);
			for (const trace of traces()) expect(drawn(trace)).toBe(1);
		});

		describe('where the browser has scroll-driven animation', () => {
			beforeEach(() => root.classList.add('js'));

			it('lets CSS draw it: a view timeline on each via and trace, no observer', async () => {
				await render(Experience, {});
				expect(document.querySelector('.timeline')?.getAttribute('data-driver')).toBeNull();
				const via = getComputedStyle(vias()[0]);
				const trace = getComputedStyle(traces()[0]);
				expect(via.animationName).not.toBe('none');
				expect(trace.animationName).not.toBe('none');
				expect(via.animationTimeline).toContain('view(');
				expect(trace.animationTimeline).toContain('view(');
				// None of them is lit by a script.
				expect(document.querySelectorAll('.via[data-lit]')).toHaveLength(0);
			});

			it('follows the scroll, down and back up', async () => {
				await page.viewport(414, 700);
				await render(Experience, {});
				makeRoom();
				const first = vias()[0];
				const last = vias()[vias().length - 1];

				// The list has just come into the window at the bottom: it is below the front, so
				// nothing is drawn.
				await scrollList(690);
				expect(color(first)).not.toBe(CYAN);
				expect(color(last)).not.toBe(CYAN);
				expect(drawn(traces()[0])).toBeLessThan(0.01);

				// The list top is at 20% of the window: the first via is above the front (60%), the
				// last is still far below it.
				await scrollList(140);
				expect(color(first)).toBe(CYAN);
				expect(drawn(traces()[0])).toBeGreaterThan(0.99);
				expect(color(last)).not.toBe(CYAN);
				expect(drawn(traces()[traces().length - 1])).toBeLessThan(0.01);

				// The end of the list is at 30% of the window: everything is drawn.
				jump(list().getBoundingClientRect().bottom + window.scrollY - 210);
				await frames();
				expect(color(last)).toBe(CYAN);
				for (const trace of traces()) expect(drawn(trace)).toBeGreaterThan(0.99);

				// And back up: a view timeline runs both ways.
				await scrollList(690);
				expect(color(first)).not.toBe(CYAN);
				expect(color(last)).not.toBe(CYAN);
				expect(drawn(traces()[0])).toBeLessThan(0.01);
			});

			it('reaches a via exactly when the front, 60% down the window, does', async () => {
				await page.viewport(414, 700);
				await render(Experience, {});
				makeRoom();
				const via = vias()[1];
				const front = 0.6 * window.innerHeight;
				const viaTop = () => via.getBoundingClientRect().top;
				const scrollVia = async (y: number) => {
					jump(viaTop() + window.scrollY - y);
					await frames();
				};

				await scrollVia(front + 40);
				expect(color(via)).not.toBe(CYAN);
				await scrollVia(front - 40);
				expect(color(via)).toBe(CYAN);
			});
		});

		describe('where it has not (an observer lights each via instead)', () => {
			beforeEach(() => {
				root.classList.add('js');
				vi.spyOn(CSS, 'supports').mockReturnValue(false);
			});

			it('marks the list as observer-driven and starts dark', async () => {
				await page.viewport(414, 700);
				await render(Experience, {});
				makeRoom();
				expect(list().getAttribute('data-driver')).toBe('io');
				await frames();
				// The list is far below the window: nothing is lit and no trace is drawn.
				expect(vias().some((via) => via.hasAttribute('data-lit'))).toBe(false);
				for (const via of vias()) expect(color(via)).not.toBe(CYAN);
				for (const trace of traces()) expect(drawn(trace)).toBe(0);
			});

			it('lights the vias that are above the front of the window, and only those', async () => {
				await page.viewport(414, 700);
				await render(Experience, {});
				makeRoom();
				await scrollList(100);
				await expect.poll(() => vias()[0].hasAttribute('data-lit')).toBe(true);
				expect(color(vias()[0])).toBe(CYAN);
				// The trace under a lit via is drawn.
				expect(drawn(traces()[0])).toBe(1);
				expect(vias()[vias().length - 1].hasAttribute('data-lit')).toBe(false);
				// Roles lower than the front, 60% of the window, are dark.
				const front = 0.6 * window.innerHeight;
				for (const via of vias()) {
					const y = via.getBoundingClientRect().top;
					if (y > front + 20) expect(via.hasAttribute('data-lit')).toBe(false);
				}
			});

			it('lights each via as it is scrolled to, and keeps it lit', async () => {
				await page.viewport(414, 700);
				await render(Experience, {});
				makeRoom();
				await scrollList(100);
				await expect.poll(() => vias()[0].hasAttribute('data-lit')).toBe(true);
				const last = vias()[vias().length - 1];
				expect(last.hasAttribute('data-lit')).toBe(false);

				// Scroll down through the list, role by role: each via lights as it passes the front.
				for (const via of vias()) {
					jump(via.getBoundingClientRect().top + window.scrollY - 200);
					await expect.poll(() => via.hasAttribute('data-lit')).toBe(true);
				}
				expect(color(last)).toBe(CYAN);

				// Scrolling back up does not put the lights out.
				await scrollList(690);
				expect(vias().every((via) => via.hasAttribute('data-lit'))).toBe(true);
				expect(color(vias()[0])).toBe(CYAN);
			});

			it('lights every via that was scrolled past, e.g. after a link to a section further down', async () => {
				await page.viewport(414, 700);
				await render(Experience, {});
				makeRoom();
				jump(document.documentElement.scrollHeight);
				await expect.poll(() => vias().every((via) => via.hasAttribute('data-lit'))).toBe(true);
				expect(color(vias()[vias().length - 1])).toBe(CYAN);
			});

			it('lights everything at once under reduced motion and runs no observer', async () => {
				root.classList.add('reduced');
				const observe = vi.spyOn(IntersectionObserver.prototype, 'observe');
				await render(Experience, {});
				await frames();
				for (const via of vias()) expect(color(via)).toBe(CYAN);
				for (const trace of traces()) expect(drawn(trace)).toBe(1);
				expect(observe).not.toHaveBeenCalled();
			});

			it('lights everything when there is no IntersectionObserver', async () => {
				vi.stubGlobal('IntersectionObserver', undefined);
				await render(Experience, {});
				await frames();
				for (const via of vias()) expect(color(via)).toBe(CYAN);
			});
		});
	});
});

describe('Skills (U6)', () => {
	const GREEN = 'rgb(63, 216, 63)';
	const DARK = 'rgba(0, 0, 0, 0)';
	const skills = (locale: Locale = 'nl') => getContent(locale).skills;
	const groups = () => Array.from(document.querySelectorAll<HTMLElement>('.group'));
	const skill = (id: string) => document.querySelector<HTMLElement>(`[data-skill="${id}"]`)!;
	const leds = (el: Element) => Array.from(el.querySelectorAll<HTMLElement>('.led'));
	const litLeds = (el: Element) => leds(el).filter((led) => led.dataset.lit === 'true');
	const fill = (el: HTMLElement) => getComputedStyle(el).backgroundColor;
	const lastLed = (group: Element) => litLeds(group).at(-1)!;
	/** Scrolls so that the top of the group is `offset` px below the top of the window. */
	const scrollGroup = async (group: HTMLElement, offset: number) => {
		jump(group.getBoundingClientRect().top + window.scrollY - offset);
		await frames();
	};

	let noMotion: HTMLStyleElement;
	beforeEach(() => {
		noMotion = document.createElement('style');
		noMotion.textContent = '.group * { transition: none !important; }';
		document.head.append(noMotion);
	});
	afterEach(() => noMotion.remove());

	describe('content', () => {
		it('is a chip labelled by its h2, registered as U6', async () => {
			const screen = await render(Skills, {});
			await expect.element(screen.getByRole('region', { name: skills().title })).toBeVisible();
			const [handle] = chips();
			expect(handle.id).toBe('skills');
			expect(handle.designator).toBe('U6');
			await expect.element(screen.getByText(skills().intro!)).toBeVisible();
		});

		it('shows the four groups, each under an h3', async () => {
			await render(Skills, {});
			expect(groups().map((g) => g.dataset.group)).toEqual(skills().groups.map((g) => g.id));
			expect(groups().map((g) => g.querySelector('h3')?.textContent)).toEqual(
				skills().groups.map((g) => g.title)
			);
		});

		it('lists the skills of each group by level, then years', async () => {
			await render(Skills, {});
			for (const group of skills().groups) {
				const el = groups().find((g) => g.dataset.group === group.id)!;
				const ids = Array.from(el.querySelectorAll<HTMLElement>('[data-skill]')).map(
					(li) => li.dataset.skill
				);
				const sorted = sortSkills(group.skills);
				expect(ids).toEqual(sorted.map((s) => s.id));
				expect(ids).toHaveLength(group.skills.length);
				for (let i = 1; i < sorted.length; i++) {
					const [a, b] = [sorted[i - 1], sorted[i]];
					expect(a.level > b.level || (a.level === b.level && a.years >= b.years)).toBe(true);
				}
			}
		});

		it('puts a list that arrives out of order right and keeps the order of equal skills', () => {
			const s = (id: string, level: 1 | 2 | 3 | 4 | 5, years: number) => ({
				id,
				title: id,
				level,
				years
			});
			const sorted = sortSkills([
				s('a', 3, 5),
				s('b', 5, 1),
				s('c', 3, 9),
				s('d', 5, 1),
				s('e', 4, 2)
			]);
			expect(sorted.map((x) => x.id)).toEqual(['b', 'd', 'e', 'c', 'a']);
		});

		it('lights as many LEDs as the level, out of five', async () => {
			await render(Skills, {});
			for (const group of skills().groups) {
				for (const item of group.skills) {
					const row = skill(item.id);
					expect(leds(row), item.id).toHaveLength(5);
					expect(litLeds(row), item.id).toHaveLength(item.level);
				}
			}
		});

		it('says the level and the years in words, for screen readers', async () => {
			await render(Skills, {});
			expect(skill('php').querySelector('.meter .sr-only')?.textContent).toBe(
				'niveau 5 van 5, 15 jaar'
			);
			expect(skill('typescript').querySelector('.meter .sr-only')?.textContent).toBe(
				'niveau 4 van 5, 2 jaar'
			);
			expect(skill('cobol').querySelector('.meter .sr-only')?.textContent).toBe(
				'niveau 1 van 5, 1 jaar'
			);
		});

		it('uses the singular for one year in English', async () => {
			setLocale('en');
			await render(Skills, {});
			expect(skill('dart').querySelector('.meter .sr-only')?.textContent).toBe(
				'level 4 of 5, 1 year'
			);
			expect(skill('php').querySelector('.meter .sr-only')?.textContent).toBe(
				'level 5 of 5, 15 years'
			);
			expect(document.querySelector('section#skills h2')?.textContent).toBe(skills('en').title);
		});

		it('shows the years next to the LEDs, hidden from a screen reader that has them in the level text', async () => {
			await render(Skills, {});
			const years = skill('php').querySelector<HTMLElement>('.years')!;
			expect(years.textContent).toBe('15 jaar');
			expect(years.getAttribute('aria-hidden')).toBe('true');
			expect(skill('php').querySelector('.leds-visual')?.getAttribute('aria-hidden')).toBe('true');
		});

		it('has the level text of every skill and no button; only the links to roles can be focused', async () => {
			await render(Skills, {});
			expect(document.querySelectorAll('section#skills .meter .sr-only')).toHaveLength(
				skills().groups.reduce((n, g) => n + g.skills.length, 0)
			);
			expect(
				document.querySelectorAll('section#skills button, section#skills [tabindex]')
			).toHaveLength(0);
			for (const link of document.querySelectorAll('section#skills a')) {
				expect(link.closest('.name'), link.textContent ?? '').not.toBeNull();
			}
		});
	});

	describe('LED sequence', () => {
		beforeEach(() => root.classList.add('js'));

		it('asks every row to wait for its group', async () => {
			await render(Skills, {});
			const rows = document.querySelectorAll('.leds');
			expect(rows.length).toBeGreaterThan(40);
			for (const row of rows) expect(row.getAttribute('data-sequence')).toBe('true');
		});

		it('keeps the LEDs dark until their group has come into view', async () => {
			await page.viewport(414, 700);
			await render(Skills, {});
			makeRoom();
			await frames();
			for (const group of groups()) expect(group.hasAttribute('data-lit')).toBe(false);
			for (const led of litLeds(document.body)) expect(fill(led)).toBe(DARK);
		});

		it('lights the LEDs of a group, in order, when it enters, and only that group', async () => {
			noMotion.remove();
			await page.viewport(414, 700);
			await render(Skills, {});
			makeRoom();
			const [first, second] = groups();
			await scrollGroup(first, 200);
			await expect.poll(() => first.hasAttribute('data-lit')).toBe(true);

			// One after another: each delay is longer than the one before, from 0.
			const delays = litLeds(first.querySelector('.leds')!).map((led) =>
				parseFloat(getComputedStyle(led).transitionDelay)
			);
			expect(delays[0]).toBe(0);
			for (let i = 1; i < delays.length; i++) expect(delays[i]).toBeGreaterThan(delays[i - 1]);

			await expect.poll(() => fill(lastLed(first))).toBe(CYAN);
			// The group below the window waits.
			expect(second.getBoundingClientRect().top).toBeGreaterThan(window.innerHeight);
			expect(second.hasAttribute('data-lit')).toBe(false);
			expect(fill(lastLed(second))).toBe(DARK);
		});

		it('lights the groups in the colour of their side: cyan on the left, green on the right', async () => {
			await page.viewport(1200, 900);
			await render(Skills, {});
			makeRoom();
			const [left, right] = groups();
			expect(left.getBoundingClientRect().left).toBeLessThan(right.getBoundingClientRect().left);
			await scrollGroup(left, 100);
			await expect
				.poll(() => left.hasAttribute('data-lit') && right.hasAttribute('data-lit'))
				.toBe(true);
			expect(fill(lastLed(left))).toBe(CYAN);
			expect(fill(lastLed(right))).toBe(GREEN);
		});

		it('runs once: the group stays lit when it leaves and comes back, and is no longer watched', async () => {
			await page.viewport(414, 700);
			const disconnect = vi.spyOn(IntersectionObserver.prototype, 'disconnect');
			await render(Skills, {});
			makeRoom();
			const [first] = groups();
			await scrollGroup(first, 200);
			await expect.poll(() => first.hasAttribute('data-lit')).toBe(true);
			expect(disconnect).toHaveBeenCalled();

			// Out of the window, far above and then far below...
			jump(0);
			await frames();
			expect(first.hasAttribute('data-lit')).toBe(true);
			jump(document.documentElement.scrollHeight);
			await frames();
			expect(first.hasAttribute('data-lit')).toBe(true);

			// ...and back: still lit, and no attribute changes anywhere in the group, so nothing starts over.
			const changes: string[] = [];
			const watcher = new MutationObserver((records) =>
				records.forEach((r) => changes.push(`${r.attributeName}`))
			);
			watcher.observe(first, { attributes: true, subtree: true });
			await scrollGroup(first, 200);
			await frames();
			watcher.disconnect();
			expect(changes).toEqual([]);
			expect(first.hasAttribute('data-lit')).toBe(true);
			expect(fill(lastLed(first))).toBe(CYAN);
		});

		it('lights at once under reduced motion, with no observer', async () => {
			root.classList.add('reduced');
			const observe = vi.spyOn(IntersectionObserver.prototype, 'observe');
			await render(Skills, {});
			makeRoom();
			await frames();
			for (const group of groups()) expect(group.hasAttribute('data-lit')).toBe(true);
			for (const led of litLeds(document.body)) {
				expect(fill(led)).not.toBe(DARK);
				expect(parseFloat(getComputedStyle(led).transitionDuration)).toBe(0);
			}
			expect(observe).not.toHaveBeenCalled();
		});

		it('lights at once where there is no IntersectionObserver', async () => {
			vi.stubGlobal('IntersectionObserver', undefined);
			await render(Skills, {});
			for (const group of groups()) expect(group.hasAttribute('data-lit')).toBe(true);
		});

		it('is lit without JS: no html.js, no wait', async () => {
			root.classList.remove('js');
			await page.viewport(414, 700);
			await render(Skills, {});
			makeRoom();
			await frames();
			for (const led of litLeds(document.body)) expect(fill(led)).not.toBe(DARK);
		});
	});
});

describe('Talks (U7)', () => {
	const talks = (locale: Locale = 'nl') => getContent(locale).talks;
	const items = () => Array.from(document.querySelectorAll<HTMLElement>('[data-talk]'));
	const item = (id: string) => document.querySelector<HTMLElement>(`[data-talk="${id}"]`)!;
	const ENGLISH_TITLES = [
		'php-2005-called',
		'frontend-js-eindhoven',
		'frontend-festival',
		'services-join-belgie'
	];

	it('is a chip labelled by its h2, registered as U7', async () => {
		const screen = await render(Talks, {});
		await expect.element(screen.getByRole('region', { name: talks().title })).toBeVisible();
		const [handle] = chips();
		expect(handle.id).toBe('talks');
		expect(handle.designator).toBe('U7');
		await expect.element(screen.getByText(talks().intro!)).toBeVisible();
	});

	it('lists every talk, newest first, with its date', async () => {
		await render(Talks, {});
		expect(items().map((el) => el.dataset.talk)).toEqual(talks().talks.map((t) => t.id));
		const dates = items().map((el) => el.querySelector('time')!.getAttribute('datetime')!);
		expect(dates).toEqual([...dates].sort().reverse());
		expect(item('php-2005-called').querySelector('time')?.textContent).toBe('21 jun 2024');
		expect(item('flutter-frontmania').querySelector('time')?.textContent).toBe('5 okt 2022');
	});

	it('puts a list that arrives out of order right', () => {
		const t = (id: string, date: string) => ({ id, title: id, date });
		const sorted = newestTalksFirst([
			t('a', '2022-04-13'),
			t('b', '2024-06-21'),
			t('c', '2022-04-13')
		]);
		expect(sorted.map((x) => x.id)).toEqual(['b', 'a', 'c']);
	});

	it('writes English dates on the English page', async () => {
		setLocale('en');
		await render(Talks, {});
		expect(item('php-2005-called').querySelector('time')?.textContent).toBe('21 Jun 2024');
		expect(document.querySelector('section#talks h2')?.textContent).toBe(talks('en').title);
	});

	it('links a talk only when it has a url', async () => {
		await render(Talks, {});
		let linked = 0;
		let plain = 0;
		for (const talk of talks().talks) {
			const a = item(talk.id).querySelector('a');
			if (talk.url) {
				linked++;
				expect(a?.getAttribute('href')).toBe(talk.url);
				expect(a?.textContent).toContain(talk.title);
			} else {
				plain++;
				expect(a).toBeNull();
			}
		}
		expect(linked).toBe(4);
		expect(plain).toBe(5);
	});

	it('says that a link leaves the site, for screen readers only', async () => {
		await render(Talks, {});
		const link = item('frontend-festival').querySelector('a')!;
		const notice = link.querySelector<HTMLElement>('.sr-only')!;
		expect(notice.textContent).toContain('(externe site)');
		expect(notice.getBoundingClientRect().width).toBeLessThanOrEqual(1);
		expect(link.hasAttribute('target')).toBe(false);
	});

	it('keeps the title as the content has it, however it is marked up', async () => {
		await render(Talks, {});
		for (const talk of talks().talks) {
			const title = item(talk.id).querySelector('.title')!;
			expect(title.textContent).toBe(talk.title + (talk.url ? ' (externe site)' : ''));
		}
	});

	describe('English titles on the Dutch page', () => {
		it('are marked lang="en" and nothing else is', async () => {
			await render(Talks, {});
			for (const talk of talks().talks) {
				const spans = item(talk.id).querySelectorAll('[lang]');
				expect(spans.length > 0, talk.id).toBe(ENGLISH_TITLES.includes(talk.id));
				for (const span of spans) expect(span.getAttribute('lang')).toBe('en');
			}
		});

		it('mark the English words and leave the Dutch around them alone', async () => {
			await render(Talks, {});
			const span = (id: string) => item(id).querySelector('[lang="en"]')!.textContent;
			expect(span('php-2005-called')).toBe('2005 Called! They Want Your Opinion About PHP Back!');
			expect(span('frontend-js-eindhoven')).toBe('Falling in Love with Front-end all over again');
			expect(span('frontend-festival')).toBe('Falling in Love with Front-end all over again');
			expect(span('services-join-belgie')).toBe('Talk "Services down to your pocket"');
			expect(item('frontend-festival').querySelector('.title')?.textContent).toContain(
				'(talk op Frontend Festival)'
			);
		});

		it('are not marked on the English page, where the whole page is English', async () => {
			setLocale('en');
			await render(Talks, {});
			expect(document.querySelectorAll('section#talks [lang]')).toHaveLength(0);
		});

		it('are found by comparing the Dutch title with the English one', () => {
			const same = '2005 Called! They Want Your Opinion About PHP Back!';
			expect(foreignPhrase(same, same)).toBe(same);
			expect(
				foreignPhrase(
					'Falling in Love with Front-end all over again (talk op Frontend Festival)',
					'Falling in Love with Front-end all over again (talk at Frontend Festival)'
				)
			).toBe('Falling in Love with Front-end all over again');
			expect(
				foreignPhrase(
					'Talk "Services down to your pocket" met Remi Appels op JOIN België',
					'Talk "Services down to your pocket" with Remi Appels at JOIN Belgium'
				)
			).toBe('Talk "Services down to your pocket"');
			// A Dutch title shares no run of words with its translation.
			expect(
				foreignPhrase('Workshop Flutter Ordina Noord', 'Flutter workshop at Ordina Noord')
			).toBeUndefined();
			expect(
				foreignPhrase('Talk Flutter FrontMania', 'Flutter talk at FrontMania')
			).toBeUndefined();
			// A word or two in common is not a passage in another language.
			expect(foreignPhrase('Talk Svelte nu', 'Talk Svelte now')).toBeUndefined();
		});
	});
});

describe('EducationLanguages (U8)', () => {
	const section = (locale: Locale = 'nl') => getContent(locale).educationLanguages;
	const language = (id: string) => document.querySelector<HTMLElement>(`[data-language="${id}"]`)!;

	it('is a chip labelled by its h2, registered as U8', async () => {
		const screen = await render(EducationLanguages, {});
		await expect.element(screen.getByRole('region', { name: section().title })).toBeVisible();
		const [handle] = chips();
		expect(handle.id).toBe('education');
		expect(handle.designator).toBe('U8');
	});

	it('has an h3 for the education and one for the languages', async () => {
		await render(EducationLanguages, {});
		const headings = Array.from(document.querySelectorAll('section#education h3')).map(
			(h) => h.textContent
		);
		expect(headings).toEqual([section().labels.education, section().labels.languages]);
		expect(headings).toEqual(['Opleiding', 'Talen']);
	});

	it('shows the course with its institution and year', async () => {
		await render(EducationLanguages, {});
		const course = section().education[0];
		const el = document.querySelector<HTMLElement>(`[data-education="${course.id}"]`)!;
		expect(el.textContent).toContain(course.title);
		expect(el.textContent).toContain(course.institution);
		expect(el.textContent).toContain(String(course.year));
		expect(course.title).toBe('Cursus Nederlandse Gebarentaal');
	});

	it('lights as many LEDs as the language level, and says it in words', async () => {
		await render(EducationLanguages, {});
		for (const lang of section().languages) {
			const el = language(lang.id);
			expect(el.querySelectorAll('.led'), lang.id).toHaveLength(5);
			expect(el.querySelectorAll('.led[data-lit="true"]'), lang.id).toHaveLength(lang.level);
		}
		expect(language('nl').querySelector('.sr-only')?.textContent).toBe('niveau 5 van 5');
		expect(language('en').querySelector('.sr-only')?.textContent).toBe('niveau 5 van 5');
	});

	it('shows the note next to the level of NGT and reads it with the level, once', async () => {
		await render(EducationLanguages, {});
		const ngt = language('ngt');
		expect(ngt.querySelector('.sr-only')?.textContent).toBe('niveau 2 van 5, basis');
		const note = ngt.querySelector<HTMLElement>('.note')!;
		expect(note.textContent).toBe('basis');
		expect(note.getAttribute('aria-hidden')).toBe('true');
		expect(language('nl').querySelector('.note')).toBeNull();
	});

	it('speaks English on the English page', async () => {
		setLocale('en');
		await render(EducationLanguages, {});
		expect(document.querySelector('section#education h2')?.textContent).toBe(section('en').title);
		expect(language('ngt').querySelector('.sr-only')?.textContent).toBe('level 2 of 5, basic');
		expect(
			Array.from(document.querySelectorAll('section#education h3')).map((h) => h.textContent)
		).toEqual(['Education', 'Languages']);
	});

	it('does not wait for a group to be lit: the LEDs are simply on', async () => {
		root.classList.add('js');
		await render(EducationLanguages, {});
		const lit = language('nl').querySelectorAll<HTMLElement>('.led[data-lit="true"]');
		expect(lit).toHaveLength(5);
		for (const led of lit) {
			expect(getComputedStyle(led).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
		}
	});
});

describe('the four chips on one page', () => {
	it('keep one h2 each and put h3 headings under it', async () => {
		await render(Experience, {});
		await render(Skills, {});
		await render(Talks, {});
		await render(EducationLanguages, {});
		const ids = Array.from(document.querySelectorAll('section')).map((s) => s.id);
		expect(ids).toEqual(['experience', 'skills', 'talks', 'education']);
		for (const id of ids) {
			const headings = Array.from(document.querySelectorAll(`section#${id} :is(h2, h3, h4)`)).map(
				(h) => h.tagName
			);
			expect(headings[0], id).toBe('H2');
			expect(
				headings.filter((h) => h === 'H2'),
				id
			).toHaveLength(1);
			expect(headings.includes('H4'), id).toBe(false);
		}
		expect(chips().map((c) => c.designator)).toEqual(['U5', 'U6', 'U7', 'U8']);
	});

	it('fit a 320px window without a sideways scroll, with every role open', async () => {
		await page.viewport(320, 700);
		// The page puts the chips in <main>, which keeps a gutter for the pins on both sides.
		const main = document.createElement('main');
		document.body.append(main);
		room.push(main);
		await render(Experience, { target: main });
		await render(Skills, { target: main });
		await render(Talks, { target: main });
		await render(EducationLanguages, { target: main });
		for (const details of document.querySelectorAll('details')) details.open = true;
		await frames();
		const html = document.documentElement;
		expect(html.scrollWidth).toBeLessThanOrEqual(html.clientWidth);
		for (const el of document.querySelectorAll('section, .pin')) {
			const box = el.getBoundingClientRect();
			expect(box.left, el.id).toBeGreaterThanOrEqual(0);
			expect(box.right, el.id).toBeLessThanOrEqual(html.clientWidth);
		}
		// Nothing runs out of its chip, even where the page does not scroll for it.
		for (const section of document.querySelectorAll('section')) {
			const edge = section.getBoundingClientRect().right;
			const strays = Array.from(section.querySelectorAll('.body *'))
				.filter((el) => !el.closest('.sr-only') && el.getBoundingClientRect().width > 0)
				.filter((el) => el.getBoundingClientRect().right > edge + 0.5)
				.map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
			expect(strays, section.id).toEqual([]);
		}
	});
});
