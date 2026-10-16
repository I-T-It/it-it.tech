/**
 * Skills and roles, matched by name. The tags of a role ("Vue.js", "Laravel 10") and the titles of
 * the Skills chip are written by hand and do not always agree, so both go through `skillKey`: one
 * lower-case key per tool that is safe in a URL (`?skill=laravel`). Nothing here holds copy.
 *
 * The alias map is a list of spellings of the same tool, not copy: it stays in code so the content
 * contract does not change. Add a line when a new tag spells a known skill another way.
 */
import type { Job } from '../content/types.js';

/** The query parameter that holds the skill: `?skill=laravel`. */
export const SKILL_PARAM = 'skill';

/** Spellings (as keys, before the alias) that mean another key. */
const ALIASES: Readonly<Record<string, string>> = {
	'vue-js': 'vue',
	vuejs: 'vue',
	'node-js': 'nodejs',
	node: 'nodejs',
	'tailwind-css': 'tailwind',
	tailwindcss: 'tailwind',
	cplusplus: 'cpp',
	cicd: 'ci-cd',
	net: 'dotnet',
	'dot-net': 'dotnet',
	js: 'javascript',
	ts: 'typescript',
	websockets: 'websocket',
	'web-socket': 'websocket',
	'web-sockets': 'websocket'
};

/** " 10", " v8", " 3.11" at the end of a name: a version, not part of the name. */
const VERSION = /\s+v?\d+(?:\.\d+)*$/i;

/**
 * The key of a skill or tag: "Laravel 10" and "laravel" are `laravel`, "Vue.js" is `vue`, "C++" is
 * `cpp` and "C#" is `csharp`. Letters and digits only, with single hyphens between words.
 */
export function skillKey(name: string): string {
	const slug = name
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.trim()
		.replace(VERSION, '')
		.toLowerCase()
		// Before the punctuation goes: C++ and C# must not collapse into C.
		.replace(/\+/g, 'plus')
		.replace(/#/g, 'sharp')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return ALIASES[slug] ?? slug;
}

/** The keys of the tags of one role. */
function keysOf(job: Pick<Job, 'tech'>): Set<string> {
	return new Set(job.tech.map(skillKey).filter(Boolean));
}

/** True when the role has the skill among its tags. */
export function jobHasSkill(job: Pick<Job, 'tech'>, key: string): boolean {
	return keysOf(job).has(key);
}

/** The roles that have the skill, in the order they came in. */
export function jobsWithSkill<T extends Pick<Job, 'tech'>>(jobs: readonly T[], key: string): T[] {
	return jobs.filter((job) => jobHasSkill(job, key));
}

/** Every skill that at least one role has. */
export function filterableKeys(jobs: readonly Pick<Job, 'tech'>[]): Set<string> {
	const keys = new Set<string>();
	for (const job of jobs) for (const key of keysOf(job)) keys.add(key);
	return keys;
}

export interface SkillOption {
	key: string;
	/** The tag as the first role that has it writes it. */
	label: string;
	/** Roles that have it. */
	count: number;
}

export interface SkillOptionsConfig {
	/** Skills of fewer roles than this are left out. Default 2. */
	minJobs?: number;
	/** A skill to list whatever its count, e.g. the one in use. Ignored when no role has it. */
	keep?: string;
}

/**
 * The skills to offer as a filter: those of `minJobs` roles or more, most roles first and the
 * label (alphabetical) for a tie.
 */
export function skillOptions(
	jobs: readonly Pick<Job, 'tech'>[],
	{ minJobs = 2, keep }: SkillOptionsConfig = {}
): SkillOption[] {
	const found = new Map<string, SkillOption>();
	for (const job of jobs) {
		const seen = new Set<string>();
		for (const tag of job.tech) {
			const key = skillKey(tag);
			if (!key || seen.has(key)) continue;
			seen.add(key);
			const option = found.get(key);
			if (option) option.count++;
			else found.set(key, { key, label: tag, count: 1 });
		}
	}
	return Array.from(found.values())
		.filter((option) => option.count >= minJobs || option.key === keep)
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * The key a skill of the Skills chip filters on, or nothing when no role has it. The title decides
 * ("Vue.js" is `vue`); the id is the second try, for a title that is a phrase.
 */
export function skillKeyFor(
	skill: { id: string; title: string },
	available: ReadonlySet<string>
): string | undefined {
	for (const candidate of [skillKey(skill.title), skillKey(skill.id)]) {
		if (candidate && available.has(candidate)) return candidate;
	}
	return undefined;
}

/**
 * The skill in a query string ("?skill=Vue.js" gives `vue`), or nothing when it is missing, empty
 * or not one that a role has. The first `skill` wins.
 */
export function readSkillParam(search: string, available: ReadonlySet<string>): string | undefined {
	const value = new URLSearchParams(search).get(SKILL_PARAM);
	const key = value ? skillKey(value) : '';
	return key && available.has(key) ? key : undefined;
}

/**
 * The address of the page with the skill set (or taken out for `undefined`) and the hash of the
 * section the filter sits in. The path, the base path, the language and any other query stay.
 */
export function skillAddress(href: string, key: string | undefined, section: string): string {
	const url = new URL(href);
	if (key) url.searchParams.set(SKILL_PARAM, key);
	else url.searchParams.delete(SKILL_PARAM);
	url.hash = section;
	return url.href;
}
