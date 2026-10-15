import { describe, expect, it } from 'vitest';
import { en } from './en.js';
import { getContent } from './index.js';
import { nl } from './nl.js';
import type { Job, SiteContent, TalkGiven, TalkOffer } from './types.js';

const both: [string, SiteContent][] = [
	['nl', nl],
	['en', en]
];

/** All string leaves of a value with a readable path, e.g. `experience.jobs[3].tasks[0]`. */
function leaves(value: unknown, path = ''): [string, string][] {
	if (typeof value === 'string') return [[path, value]];
	if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
	if (value && typeof value === 'object') {
		return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
	}
	return [];
}

/** Paths of all leaves, strings and others alike, to compare the shape of two content files. */
function shape(value: unknown, path = ''): string[] {
	if (Array.isArray(value))
		return [path + '[]', ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
	if (value && typeof value === 'object') {
		return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
	}
	return [path];
}

/** Strings that are links, not copy. They are checked on their own and skipped by the copy checks. */
const isUrlPath = (path: string) => /(^|\.)url$/.test(path);

/** Characters are built from code points so that this file holds no invisible or exotic character. */
const chars = (codes: number[]) => String.fromCharCode(...codes);
const range = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** No-break space, the zero-width and general punctuation spaces, line separators, braille blank, BOM. */
const INVISIBLE = new RegExp(
	`[${chars([0xa0, ...range(0x2000, 0x200f), 0x2028, 0x2029, 0x2800, 0xfeff])}]`
);
/** Em dash, curly single and double quotes, the ellipsis character. */
const TYPOGRAPHY = new RegExp(`[${chars([0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026])}]`);
/** A line that starts like a list item: hyphen, asterisk or bullet. */
const BULLET = new RegExp(`^\\s*[-*${chars([0x2022])}]\\s`);

const copy = (c: SiteContent) => leaves(c).filter(([path]) => !isUrlPath(path));

const allSkills = (c: SiteContent) => c.skills.groups.flatMap((g) => g.skills);

/** The month of the CV export. Nothing in the content may start or end after it. */
const EXPORT_MONTH = '2026-10';
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

describe('getContent', () => {
	it('returns the content of the locale', () => {
		expect(getContent('nl')).toBe(nl);
		expect(getContent('en')).toBe(en);
		expect(nl.locale).toBe('nl');
		expect(en.locale).toBe('en');
	});
});

describe('NL and EN parity', () => {
	it('has the same shape, down to every array length', () => {
		expect(shape(en)).toEqual(shape(nl));
	});

	it('has the same job ids in the same order', () => {
		expect(en.experience.jobs.map((j) => j.id)).toEqual(nl.experience.jobs.map((j) => j.id));
		expect(nl.experience.jobs).toHaveLength(15);
	});

	it('has the same skill groups and skill ids with the same level and years', () => {
		const flat = (c: SiteContent) =>
			c.skills.groups.map((g) => [g.id, g.skills.map((s) => [s.id, s.level, s.years])]);
		expect(flat(en)).toEqual(flat(nl));
	});

	it('has the same talks, competences, education and languages', () => {
		expect(nl.talks.offers).toHaveLength(6);
		expect(nl.talks.given).toHaveLength(9);
		expect(nl.competences.items).toHaveLength(4);
		const offer = (o: TalkOffer) => [
			o.id,
			o.kind,
			o.lang,
			o.duration === undefined,
			o.audience === undefined
		];
		expect(en.talks.offers.map(offer)).toEqual(nl.talks.offers.map(offer));
		const given = (g: TalkGiven) => [
			g.id,
			g.offerId,
			g.date,
			g.url,
			g.event === undefined,
			g.title === undefined
		];
		expect(en.talks.given.map(given)).toEqual(nl.talks.given.map(given));
		expect(en.competences.items.map((c) => c.id)).toEqual(nl.competences.items.map((c) => c.id));
		expect(en.educationLanguages.education.map((e) => [e.id, e.year])).toEqual(
			nl.educationLanguages.education.map((e) => [e.id, e.year])
		);
		expect(en.educationLanguages.languages.map((l) => [l.id, l.level])).toEqual(
			nl.educationLanguages.languages.map((l) => [l.id, l.level])
		);
	});

	it('has the same dates, links, tech tags and intermediaries on every job', () => {
		const facts = (j: Job) => [j.start, j.end, j.tech, j.via, j.results.map((r) => r.url)];
		expect(en.experience.jobs.map(facts)).toEqual(nl.experience.jobs.map(facts));
	});

	it('has both lead lines, both CTA labels and both page metas in each locale', () => {
		for (const [, c] of both) {
			expect(c.hero.lead.company.length).toBeGreaterThan(20);
			expect(c.hero.lead.personal.length).toBeGreaterThan(20);
			expect(c.hero.lead.company).not.toBe(c.hero.lead.personal);
			expect(c.hero.cta.job.length).toBeGreaterThan(5);
			expect(c.hero.cta.freelance.length).toBeGreaterThan(5);
			expect(c.meta.company.title.length).toBeGreaterThan(10);
			expect(c.meta.personal.title.length).toBeGreaterThan(10);
		}
	});

	it('differs between EN and NL, except for names, tags, titles and the tagline', () => {
		const enByPath = new Map(copy(en));
		const sameAllowed = (path: string, value: string) =>
			path.startsWith('profile.') ||
			/\.(id|kind|lang|offerId)$/.test(path) ||
			/jobs\[\d+\]\.(organisation|via|title)$/.test(path) ||
			/jobs\[\d+\]\.tech\[\d+\]$/.test(path) ||
			/groups\[\d+\]\.(title|skills\[\d+\]\.title)$/.test(path) ||
			/^talks\.offers\[\d+\]\.title$/.test(path) ||
			/^talks\.given\[\d+\]\.event$/.test(path) ||
			/^talks\.labels\.kind\.(talk|workshop)$/.test(path) ||
			/education\[\d+\]\.institution$/.test(path) ||
			/^contact\.(title|labels\.(linkedin|github))$/.test(path) ||
			path === 'experience.labels.via' ||
			/\.(date|start|end)$/.test(path) ||
			(/results\[\d+\]\.text$/.test(path) && /^[\w.]+(\s[\w.]+)?$/.test(value));
		const same = copy(nl)
			.filter(([path, value]) => enByPath.get(path) === value)
			.filter(([path, value]) => !sameAllowed(path, value))
			.map(([path]) => path);
		expect(same).toEqual([]);
	});
});

describe('cleaned up export', () => {
	it('has no Branche group, no skill without years and no duplicate skill', () => {
		for (const [, c] of both) {
			const titles = allSkills(c).map((s) => s.title.toLowerCase());
			expect(titles.some((t) => t.includes('branche'))).toBe(false);
			expect(c.skills.groups.map((g) => g.title.toLowerCase())).not.toContain('branche');
			expect(allSkills(c).filter((s) => s.years < 1)).toEqual([]);
			expect(new Set(titles).size).toBe(titles.length);
			const ids = allSkills(c).map((s) => s.id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});

	it('has four groups, in this order', () => {
		for (const [, c] of both) {
			expect(c.skills.groups.map((g) => g.id)).toEqual([
				'languages',
				'frameworks',
				'tools',
				'practices'
			]);
		}
	});

	it('keeps the higher level and years of merged skills', () => {
		const byId = (c: SiteContent) => new Map(allSkills(c).map((s) => [s.id, s]));
		for (const [, c] of both) {
			const skills = byId(c);
			expect(skills.get('agile')).toMatchObject({ level: 4, years: 10 });
			expect(skills.get('photoshop')).toMatchObject({ level: 4, years: 5 });
			expect(skills.get('css')).toMatchObject({ level: 4, years: 14 });
			expect(skills.has('css-3')).toBe(false);
		}
	});

	it('moves sign language to the languages block, with a level and a note', () => {
		for (const [, c] of both) {
			expect(allSkills(c).some((s) => s.id === 'ngt')).toBe(false);
			const ngt = c.educationLanguages.languages.find((l) => l.id === 'ngt');
			expect(ngt?.level).toBe(2);
			expect(ngt?.note?.length).toBeGreaterThan(2);
			expect(c.educationLanguages.languages.map((l) => l.id)).toEqual(['nl', 'en', 'ngt']);
			expect(c.educationLanguages.languages.slice(0, 2).map((l) => l.level)).toEqual([5, 5]);
		}
	});

	it('lists every group by level, then years, highest first', () => {
		for (const [, c] of both) {
			for (const g of c.skills.groups) {
				const keys = g.skills.map((s) => s.level * 100 + s.years);
				expect(keys).toEqual([...keys].sort((a, b) => b - a));
				for (const s of g.skills) {
					expect(Number.isInteger(s.level) && s.level >= 1 && s.level <= 5).toBe(true);
					expect(Number.isInteger(s.years) && s.years >= 1).toBe(true);
				}
			}
		}
	});

	it('has the tools of the plan in the tools group', () => {
		const tools = nl.skills.groups.find((g) => g.id === 'tools')!.skills.map((s) => s.title);
		for (const t of [
			'Git',
			'Docker',
			'Ansible',
			'Kubernetes',
			'CI/CD',
			'Azure Pipelines',
			'Linux',
			'Apache',
			'SSH',
			'MySQL',
			'Elasticsearch',
			'WebSocket',
			'GraphQL',
			'Photoshop'
		]) {
			expect(tools).toContain(t);
		}
	});

	it('has no HTML, no entity and no invisible character in any string', () => {
		for (const [name, c] of both) {
			for (const [path, value] of leaves(c)) {
				const where = `${name}:${path}`;
				expect([where, /[<>]/.test(value)]).toEqual([where, false]);
				expect([where, /&(#\d+|#x[\da-f]+|[a-z]+);/i.test(value)]).toEqual([where, false]);
				expect([where, INVISIBLE.test(value)]).toEqual([where, false]);
			}
		}
	});

	it('has no list markers or "Title:" metadata left over from the export', () => {
		for (const [name, c] of both) {
			for (const [path, value] of copy(c)) {
				const where = `${name}:${path}`;
				expect([where, BULLET.test(value)]).toEqual([where, false]);
				expect([where, /Algemeen \d{2}-\d{2}-\d{4}/.test(value)]).toEqual([where, false]);
				expect([where, /\n/.test(value)]).toEqual([where, false]);
			}
		}
	});

	it('has trimmed strings with no double spaces and none empty', () => {
		for (const [name, c] of both) {
			for (const [path, value] of leaves(c)) {
				const where = `${name}:${path}`;
				expect([where, value === value.trim() && value.length > 0 && !/ {2}/.test(value)]).toEqual([
					where,
					true
				]);
			}
		}
	});

	it('has no em dash and no curly quote', () => {
		for (const [name, c] of both) {
			for (const [path, value] of leaves(c)) {
				const where = `${name}:${path}`;
				expect([where, TYPOGRAPHY.test(value)]).toEqual([where, false]);
			}
		}
	});

	it('has no typo of the export left', () => {
		const typos: [string, RegExp][] = [
			['insentriek', /insentriek/i],
			['uitbereiden', /uitbereid/i],
			['repraren', /repraren/i],
			['onvangen', /\bonvangen\b/i],
			['geneneren', /geneneren/i],
			['tijdleijk', /tijdleijk/i],
			['speeld', /\bafspeeld\b/i],
			['Funtions', /Funtions/],
			['ruizenrad', /ruizenrad/i],
			['rapprteren', /rapprteren/i],
			['synchronsatie', /synchronsatie/i],
			['Get maken', /\bGet maken\b/],
			['Creeren', /\bCreeren\b/],
			['efficienter', /efficienter/i],
			['gen optie', /\bgen optie\b/i],
			['va beleidsafdelingen', /\bva beleidsafdelingen\b/i],
			['hoger kwaliteitsstandaarden', /hoger kwaliteitsstandaarden/i],
			['Typescript', /\bTypescript\b/],
			['VueJS', /\bVueJS\b/i],
			['Belgie', /\bBelgie\b/],
			['scheveningen', /\bscheveningen\b/]
		];
		for (const [name, c] of both) {
			for (const [path, value] of leaves(c)) {
				for (const [typo, pattern] of typos) {
					const where = `${name}:${path} (${typo})`;
					expect([where, pattern.test(value)]).toEqual([where, false]);
				}
			}
		}
	});
});

describe('experience', () => {
	it('has valid dates, an end that is null or not before the start, and exactly 3 ongoing roles', () => {
		for (const [, c] of both) {
			for (const job of c.experience.jobs) {
				expect(job.start).toMatch(MONTH);
				expect(job.start <= EXPORT_MONTH).toBe(true);
				if (job.end !== null) {
					expect(job.end).toMatch(MONTH);
					expect(job.end >= job.start).toBe(true);
					expect(job.end <= EXPORT_MONTH).toBe(true);
				}
			}
			expect(c.experience.jobs.filter((j) => j.end === null)).toHaveLength(3);
		}
	});

	it('lists the newest start first', () => {
		const starts = nl.experience.jobs.map((j) => j.start);
		expect(starts).toEqual([...starts].sort().reverse());
	});

	it('has unique ids and a title, organisation, situation and tasks on every job', () => {
		for (const [, c] of both) {
			const ids = c.experience.jobs.map((j) => j.id);
			expect(new Set(ids).size).toBe(ids.length);
			for (const job of c.experience.jobs) {
				expect(job.title.length).toBeGreaterThan(3);
				expect(job.organisation.length).toBeGreaterThan(1);
				expect(job.situation.length).toBeGreaterThan(0);
				expect(job.tasks.length).toBeGreaterThan(0);
				expect(new Set(job.tech).size).toBe(job.tech.length);
				if (job.via !== undefined) expect(job.via).not.toBe(job.organisation);
			}
		}
	});

	it('shows the Sopra Steria role as via and fills the tags of the CZ C# role', () => {
		for (const [, c] of both) {
			const vws = c.experience.jobs.find((j) => j.organisation === 'Ministerie van VWS');
			expect(vws?.via).toBe('Sopra Steria');
			expect(vws?.end).toBeNull();
			const cz = c.experience.jobs.find((j) => j.via === 'Ordina');
			expect(cz?.organisation).toBe('CZ');
			expect(cz?.tech).toEqual(['C#', '.NET', 'Azure Functions']);
		}
	});

	it('merges CSS 3 into CSS and Photoshop into one tag', () => {
		for (const [, c] of both) {
			const tech = c.experience.jobs.flatMap((j) => j.tech);
			expect(tech).not.toContain('CSS 3');
			expect(tech).not.toContain('Adobe Photoshop');
			expect(tech).not.toContain('elastic search');
		}
	});

	it('has result links that are valid https, unique, without "-" and not inside the text', () => {
		for (const [, c] of both) {
			const urls: string[] = [];
			for (const job of c.experience.jobs) {
				for (const r of job.results) {
					expect(r.text).not.toBe('-');
					expect(r.text.length).toBeGreaterThan(2);
					expect(r.text).not.toMatch(/https?:/);
					if (r.url !== undefined) {
						expect(new URL(r.url).protocol).toBe('https:');
						urls.push(r.url);
					}
				}
			}
			expect(urls.length).toBeGreaterThan(8);
			expect(new Set(urls).size).toBe(urls.length);
		}
	});

	it('has labels with their placeholders', () => {
		for (const [, c] of both) {
			expect(c.experience.labels.via).toContain('{employer}');
			expect(c.experience.labels.present.length).toBeGreaterThan(2);
		}
		expect(nl.experience.labels.present).toBe('heden');
		expect(en.experience.labels.present).toBe('present');
	});
});

describe('talks', () => {
	it('has valid dates in the history, newest first, and links only as valid https', () => {
		for (const [, c] of both) {
			const dates = c.talks.given.map((t) => t.date);
			for (const d of dates) {
				expect(d).toMatch(DATE);
				expect(Number.isNaN(new Date(d).getTime())).toBe(false);
				expect(d.slice(0, 7) <= EXPORT_MONTH).toBe(true);
			}
			expect(dates).toEqual([...dates].sort().reverse());
			const urls = c.talks.given.flatMap((t) => (t.url ? [t.url] : []));
			expect(urls).toHaveLength(4);
			for (const u of urls) expect(new URL(u).protocol).toBe('https:');
			expect(new Set(urls).size).toBe(urls.length);
		}
	});

	it('seeds the catalogue with every distinct talk and workshop of the history', () => {
		for (const [, c] of both) {
			expect(c.talks.offers.map((o) => [o.id, o.kind, o.lang])).toEqual([
				['php-2005-called', 'talk', 'en'],
				['frontend-love', 'talk', 'en'],
				['services-pocket', 'talk', 'en'],
				['flutter-talk', 'talk', 'nl'],
				['flutter-workshop', 'workshop', 'nl'],
				['svelte-talk', 'talk', 'nl']
			]);
		}
	});

	it('has unique ids, a summary on every offer and no empty optional field', () => {
		for (const [, c] of both) {
			const offerIds = c.talks.offers.map((o) => o.id);
			expect(new Set(offerIds).size).toBe(offerIds.length);
			const givenIds = c.talks.given.map((g) => g.id);
			expect(new Set(givenIds).size).toBe(givenIds.length);
			for (const o of c.talks.offers) {
				expect(['talk', 'workshop']).toContain(o.kind);
				expect(['nl', 'en']).toContain(o.lang);
				expect(o.title.length).toBeGreaterThan(3);
				expect(o.summary.length).toBeGreaterThan(20);
				// An optional field is left out until it is known, never filled with a guess.
				for (const field of [o.duration, o.audience]) expect(field?.length ?? 1).toBeGreaterThan(0);
			}
		}
	});

	it('points every occurrence at an offer, or gives it a title of its own', () => {
		for (const [, c] of both) {
			const offerIds = new Set(c.talks.offers.map((o) => o.id));
			for (const g of c.talks.given) {
				if (g.offerId !== undefined) expect(offerIds.has(g.offerId), g.id).toBe(true);
				else expect(g.title?.length, g.id).toBeGreaterThan(3);
			}
			// Every offer of the seed was given at least once; the history is where it comes from.
			const used = new Set(c.talks.given.map((g) => g.offerId));
			for (const id of offerIds) expect(used.has(id), id).toBe(true);
		}
	});

	it('keeps the title of an English talk as it is and translates the others', () => {
		for (const o of nl.talks.offers) {
			const english = en.talks.offers.find((x) => x.id === o.id)!;
			if (o.lang === 'en') expect(english.title, o.id).toBe(o.title);
			else expect(english.title, o.id).not.toBe(o.title);
		}
	});

	it('has the labels the section needs, with their placeholders', () => {
		for (const [, c] of both) {
			const { labels } = c.talks;
			expect(labels.offers.length).toBeGreaterThan(3);
			expect(labels.given.length).toBeGreaterThan(3);
			expect(labels.times.one).toContain('{last}');
			expect(labels.times.many).toContain('{last}');
			expect(labels.times.many).toContain('{count}');
			expect(Object.keys(labels.language).sort()).toEqual(['en', 'nl']);
		}
		expect(nl.talks.labels.offers).toBe('Klaar om te geven');
		expect(nl.talks.labels.given).toBe('Gegeven');
		expect(en.talks.labels.offers).toBe('Ready to give');
		expect(en.talks.labels.given).toBe('Given');
	});

	it('has no booking label and no mail subject: the offers are information only', () => {
		for (const [, c] of both) {
			expect(Object.keys(c.talks.labels).sort()).toEqual([
				'facts',
				'given',
				'kind',
				'language',
				'offers',
				'times'
			]);
		}
	});
});

describe('education', () => {
	it('has the course of the export', () => {
		for (const [, c] of both) {
			expect(c.educationLanguages.education).toHaveLength(1);
			expect(c.educationLanguages.education[0]).toMatchObject({ institution: 'TYD', year: 2023 });
		}
	});
});

describe('variant copy', () => {
	it('has the soft job wording and the freelance hours of the plan', () => {
		expect(nl.availability.freelance.hours).toBe('Doordeweeks vanaf 18:00 en in het weekend');
		expect(en.availability.freelance.hours).toBe('Weekday evenings from 18:00 and weekends');
		expect(nl.availability.job.body.join(' ')).toMatch(/vaste rol/);
		expect(en.availability.job.body.join(' ')).toMatch(/permanent role/);
		expect(nl.availability.job.body.join(' ')).not.toMatch(/op zoek naar een nieuwe baan/i);
	});

	it('states the 9-to-5 job by day and the freelance work in evenings and weekends', () => {
		expect(nl.availability.job.body.join(' ')).toMatch(/negen tot vijf/);
		expect(en.availability.job.body.join(' ')).toMatch(/9 to 5/);
		expect(nl.availability.freelance.title).toBe('Avonden en weekenden: I.T. It');
		expect(nl.availability.job.title).toBe('Overdag: in loondienst');
	});

	it('names what I.T. It takes on', () => {
		for (const [, c] of both) {
			const takes = c.availability.freelance.takesOn.join(' ');
			for (const word of ['Laravel', 'Svelte', 'Vue', 'Flutter']) expect(takes).toContain(word);
			expect(c.availability.freelance.takesOn.length).toBeGreaterThanOrEqual(4);
		}
	});

	it('has the freelance mail subject of the plan, without an address in it', () => {
		expect(nl.availability.freelance.emailSubject).toBe('Project voor I.T. It');
		expect(en.availability.freelance.emailSubject).toBe('Project for I.T. It');
	});

	it('leads the company page with I.T. It and the personal page with Robbin', () => {
		for (const [, c] of both) {
			expect(c.profile.name).toBe('Robbin Schepers');
			expect(c.profile.tagline).toBe('Professional Computer Nerd');
			expect(c.meta.company.title.startsWith('I.T. It')).toBe(true);
			expect(c.meta.company.title).toContain('Robbin Schepers');
			expect(c.meta.personal.title.startsWith('Robbin Schepers')).toBe(true);
			expect(c.meta.personal.title).toContain('I.T. It');
			expect(c.meta.personal.description).toContain('I.T. It');
			expect(c.meta.company.description).toContain('I.T. It');
			expect(c.hero.lead.company).toContain('I.T. It');
			expect(c.hero.lead.personal).toContain('I.T. It');
		}
	});

	it('keeps titles and descriptions within search result lengths', () => {
		for (const [, c] of both) {
			for (const meta of [c.meta.company, c.meta.personal]) {
				expect(meta.title.length).toBeLessThanOrEqual(65);
				expect(meta.description.length).toBeGreaterThanOrEqual(80);
				expect(meta.description.length).toBeLessThanOrEqual(160);
			}
			expect(c.meta.company.title).not.toBe(c.meta.personal.title);
			expect(c.meta.company.description).not.toBe(c.meta.personal.description);
		}
	});

	it('has the labels the sections need', () => {
		for (const [, c] of both) {
			expect(c.skills.labels.level).toContain('{level}');
			expect(c.skills.labels.level).toContain('{max}');
			expect(c.skills.labels.years).toContain('{years}');
			expect(c.skills.labels.yearsOne).toContain('{years}');
			expect(c.contact.labels.company.length).toBeGreaterThan(3);
			expect(c.availability.job.print.length).toBeGreaterThan(3);
		}
		expect(nl.contact.labels.company).toBe('Naar I.T. It');
	});
});

describe('what the content must never hold', () => {
	it('has no email address, no @ and no mail link in any string', () => {
		const mailLink = ['mail', 'to:'].join('');
		for (const [name, c] of both) {
			for (const [path, value] of leaves(c)) {
				const where = `${name}:${path}`;
				expect([where, value.includes('@')]).toEqual([where, false]);
				expect([where, value.toLowerCase().includes(mailLink)]).toEqual([where, false]);
				expect([where, /\[at\]|\[dot\]/i.test(value)]).toEqual([where, false]);
			}
		}
	});

	it('has no phone number, no birth date and no street address', () => {
		const phone = new RegExp(['\\+', '31|\\b0[1-9]\\d?[- ]?\\d{7,8}\\b'].join(''));
		for (const [name, c] of both) {
			for (const [path, value] of copy(c)) {
				const where = `${name}:${path}`;
				expect([where, phone.test(value)]).toEqual([where, false]);
				expect([where, /\b\d{1,2}[- /]\d{1,2}[- /](19|20)\d{2}\b/.test(value)]).toEqual([
					where,
					false
				]);
				expect([where, /\b\d{4} ?[A-Z]{2}\b/.test(value)]).toEqual([where, false]);
			}
		}
	});

	it('does not name its writing tool', () => {
		for (const [name, c] of both) {
			for (const [path, value] of leaves(c)) {
				const where = `${name}:${path}`;
				expect([where, /claude|anthropic|chatgpt/i.test(value) || /\bAI\b/.test(value)]).toEqual([
					where,
					false
				]);
			}
		}
	});
});
