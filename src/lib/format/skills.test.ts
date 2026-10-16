import { describe, expect, it } from 'vitest';
import { getContent } from '../content/index.js';
import type { Job, Locale } from '../content/types.js';
import {
	filterableKeys,
	jobHasSkill,
	jobsWithSkill,
	readSkillParam,
	skillAddress,
	skillKey,
	skillKeyFor,
	skillOptions
} from './skills.js';

const job = (id: string, tech: string[]): Job => ({
	id,
	title: id,
	organisation: id,
	start: '2020-01',
	end: null,
	tech,
	situation: [],
	tasks: [],
	results: []
});

describe('skillKey', () => {
	it('ignores case, spaces and the accents of a name', () => {
		expect(skillKey('Laravel')).toBe('laravel');
		expect(skillKey('  LARAVEL ')).toBe('laravel');
		expect(skillKey('Azure Pipelines')).toBe('azure-pipelines');
		expect(skillKey('Elasticsearch')).toBe('elasticsearch');
		expect(skillKey('Café')).toBe('cafe');
	});

	it('drops a version: Laravel 10 is Laravel', () => {
		expect(skillKey('Laravel 10')).toBe('laravel');
		expect(skillKey('Vue 3')).toBe('vue');
		expect(skillKey('Python 3.11')).toBe('python');
		expect(skillKey('PHP v8')).toBe('php');
	});

	it('keeps a name that is only a number or ends in digits without a space', () => {
		expect(skillKey('ES2015')).toBe('es2015');
		expect(skillKey('2024')).toBe('2024');
	});

	it('does not mix up C, C++ and C#', () => {
		const keys = [skillKey('C'), skillKey('C++'), skillKey('C#')];
		expect(new Set(keys).size).toBe(3);
		expect(keys).toEqual(['c', 'cpp', 'csharp']);
	});

	it('maps the usual spellings of one tool to one key', () => {
		expect(skillKey('Vue.js')).toBe('vue');
		expect(skillKey('VueJS')).toBe('vue');
		expect(skillKey('Node.js')).toBe('nodejs');
		expect(skillKey('node')).toBe('nodejs');
		expect(skillKey('Tailwind CSS')).toBe('tailwind');
		expect(skillKey('TailwindCSS')).toBe('tailwind');
		expect(skillKey('CI/CD')).toBe('ci-cd');
		expect(skillKey('CICD')).toBe('ci-cd');
		expect(skillKey('.NET')).toBe('dotnet');
		expect(skillKey('JS')).toBe('javascript');
		expect(skillKey('WebSockets')).toBe('websocket');
	});

	it('gives a key that is safe in a URL', () => {
		for (const name of ['Vue.js', 'C++', 'C#', 'CI/CD', '.NET', 'Tailwind CSS', 'Node.js']) {
			expect(skillKey(name)).toMatch(/^[a-z0-9-]+$/);
		}
	});

	it('is the same for a key that is already a key', () => {
		for (const name of ['vue', 'nodejs', 'ci-cd', 'csharp', 'cpp', 'dotnet', 'azure-pipelines']) {
			expect(skillKey(name)).toBe(name);
		}
	});

	it('gives nothing for a name without letters or digits', () => {
		expect(skillKey('')).toBe('');
		expect(skillKey('  - ')).toBe('');
	});
});

describe('jobs and skills', () => {
	const jobs = [
		job('a', ['Laravel', 'PHP', 'Vue.js']),
		job('b', ['Laravel 10', 'Git']),
		job('c', ['php', 'Git', 'Git']),
		job('d', []),
		job('e', ['Python'])
	];

	it('finds a skill in a job, whatever the spelling', () => {
		expect(jobHasSkill(jobs[0], 'laravel')).toBe(true);
		expect(jobHasSkill(jobs[1], 'laravel')).toBe(true);
		expect(jobHasSkill(jobs[2], 'laravel')).toBe(false);
		expect(jobHasSkill(jobs[2], 'php')).toBe(true);
		expect(jobHasSkill(jobs[3], 'php')).toBe(false);
	});

	it('lists the jobs of a skill in their own order', () => {
		expect(jobsWithSkill(jobs, 'php').map((j) => j.id)).toEqual(['a', 'c']);
		expect(jobsWithSkill(jobs, 'vue').map((j) => j.id)).toEqual(['a']);
		expect(jobsWithSkill(jobs, 'rust')).toEqual([]);
	});

	it('knows every skill that at least one job has', () => {
		expect(Array.from(filterableKeys(jobs)).sort()).toEqual([
			'git',
			'laravel',
			'php',
			'python',
			'vue'
		]);
	});

	describe('skillOptions', () => {
		it('keeps the skills of at least two jobs, most jobs first, a job counted once', () => {
			const twice = [...jobs, job('f', ['Git', 'PHP'])];
			expect(skillOptions(twice)).toEqual([
				{ key: 'git', label: 'Git', count: 3 },
				{ key: 'php', label: 'PHP', count: 3 },
				{ key: 'laravel', label: 'Laravel', count: 2 }
			]);
		});

		it('breaks a tie on the label, not on the order of the jobs', () => {
			const tied = [job('a', ['Zeta', 'Alpha']), job('b', ['Zeta', 'Alpha'])];
			expect(skillOptions(tied).map((o) => o.label)).toEqual(['Alpha', 'Zeta']);
		});

		it('uses the spelling of the first job that has it', () => {
			const spelled = [job('a', ['Laravel 10']), job('b', ['Laravel'])];
			expect(skillOptions(spelled)).toEqual([{ key: 'laravel', label: 'Laravel 10', count: 2 }]);
		});

		it('can take a lower bar', () => {
			expect(skillOptions(jobs, { minJobs: 1 }).map((o) => o.key)).toEqual([
				'git',
				'laravel',
				'php',
				'python',
				'vue'
			]);
		});

		it('adds the skill in use even when it is below the bar, so a link to it still shows', () => {
			const keys = skillOptions(jobs, { keep: 'python' }).map((o) => o.key);
			expect(keys).toEqual(['git', 'laravel', 'php', 'python']);
		});

		it('does not add a skill that no job has', () => {
			expect(skillOptions(jobs, { keep: 'rust' })).toHaveLength(3);
		});

		it('gives nothing for no jobs', () => {
			expect(skillOptions([])).toEqual([]);
		});
	});
});

describe('skillKeyFor (a skill of the Skills chip)', () => {
	const available = new Set(['laravel', 'vue', 'nodejs', 'ci-cd', 'csharp']);

	it('finds the key through the title', () => {
		expect(skillKeyFor({ id: 'x', title: 'Laravel' }, available)).toBe('laravel');
		expect(skillKeyFor({ id: 'x', title: 'Vue.js' }, available)).toBe('vue');
		expect(skillKeyFor({ id: 'x', title: 'Node.js' }, available)).toBe('nodejs');
	});

	it('falls back on the id when the title is a phrase', () => {
		expect(skillKeyFor({ id: 'csharp', title: 'C sharp' }, available)).toBe('csharp');
	});

	it('gives nothing for a skill no job has', () => {
		expect(skillKeyFor({ id: 'agile', title: 'Agile' }, available)).toBeUndefined();
		expect(skillKeyFor({ id: 'programming', title: 'Programmeren' }, available)).toBeUndefined();
	});
});

describe('readSkillParam', () => {
	const available = new Set(['laravel', 'vue']);

	it('reads the skill from a query string', () => {
		expect(readSkillParam('?skill=laravel', available)).toBe('laravel');
		expect(readSkillParam('skill=laravel', available)).toBe('laravel');
		expect(readSkillParam('?a=1&skill=laravel&b=2', available)).toBe('laravel');
	});

	it('takes any spelling and gives the key', () => {
		expect(readSkillParam('?skill=Laravel%2010', available)).toBe('laravel');
		expect(readSkillParam('?skill=Vue.js', available)).toBe('vue');
		expect(readSkillParam('?skill=VUE', available)).toBe('vue');
	});

	it('gives nothing for no skill, an empty one, or one no job has', () => {
		expect(readSkillParam('', available)).toBeUndefined();
		expect(readSkillParam('?skill=', available)).toBeUndefined();
		expect(readSkillParam('?other=laravel', available)).toBeUndefined();
		expect(readSkillParam('?skill=rust', available)).toBeUndefined();
	});

	it('takes the first when it is given twice', () => {
		expect(readSkillParam('?skill=vue&skill=laravel', available)).toBe('vue');
	});
});

describe('skillAddress', () => {
	const page = 'https://example.org/it-it.tech/?utm=x#about';

	it('sets the skill and the section and keeps the path and the rest of the query', () => {
		expect(skillAddress(page, 'laravel', 'experience')).toBe(
			'https://example.org/it-it.tech/?utm=x&skill=laravel#experience'
		);
	});

	it('replaces a skill that was there', () => {
		expect(
			skillAddress('https://example.org/en/?skill=php#experience', 'laravel', 'experience')
		).toBe('https://example.org/en/?skill=laravel#experience');
	});

	it('takes the skill out for no skill, and keeps the section', () => {
		expect(
			skillAddress('https://example.org/en/?skill=php#experience', undefined, 'experience')
		).toBe('https://example.org/en/#experience');
	});

	it('writes a key that needs no escaping', () => {
		expect(skillAddress('https://example.org/', 'ci-cd', 'experience')).toBe(
			'https://example.org/?skill=ci-cd#experience'
		);
	});
});

describe('the real content', () => {
	const locales: Locale[] = ['nl', 'en'];

	it.each(locales)('has the same tags in %s as in Dutch, so the keys match', (locale) => {
		const keysOf = (l: Locale) => Array.from(filterableKeys(getContent(l).experience.jobs)).sort();
		expect(keysOf(locale)).toEqual(keysOf('nl'));
	});

	it('finds Laravel in seven roles and offers it first among the frameworks', () => {
		const { jobs } = getContent('nl').experience;
		expect(jobsWithSkill(jobs, 'laravel')).toHaveLength(7);
		const options = skillOptions(jobs);
		expect(options.find((o) => o.key === 'laravel')).toEqual({
			key: 'laravel',
			label: 'Laravel',
			count: 7
		});
		const counts = options.map((o) => o.count);
		expect(counts).toEqual([...counts].sort((a, b) => b - a));
		expect(counts.every((n) => n >= 2)).toBe(true);
	});

	it.each(locales)('links every skill that is also a tag of a role in %s', (locale) => {
		const content = getContent(locale);
		const available = filterableKeys(content.experience.jobs);
		const tags = new Set(
			content.experience.jobs.flatMap((j) => j.tech.map((t) => t.toLowerCase()))
		);
		const skills = content.skills.groups.flatMap((g) => g.skills);
		const linked = skills.filter((s) => skillKeyFor(s, available) !== undefined);

		// A skill whose title is a tag of some role must be found, whatever its id.
		for (const skill of skills.filter((s) => tags.has(s.title.toLowerCase()))) {
			expect(skillKeyFor(skill, available), skill.title).toBeDefined();
		}
		// And a key never points at a skill that no role has.
		for (const skill of linked) {
			expect(available.has(skillKeyFor(skill, available)!), skill.title).toBe(true);
		}
		expect(linked.map((s) => s.title)).toEqual(
			expect.arrayContaining(['Laravel', 'Vue.js', 'Node.js', 'Tailwind CSS', 'CI/CD', 'C#', 'C++'])
		);
	});

	it('gives every skill title and every tag a key a URL can hold', () => {
		const content = getContent('nl');
		const names = [
			...content.experience.jobs.flatMap((j) => j.tech),
			...content.skills.groups.flatMap((g) => g.skills.map((s) => s.title))
		];
		for (const name of names) expect(skillKey(name), name).toMatch(/^[a-z0-9-]+$/);
	});
});
