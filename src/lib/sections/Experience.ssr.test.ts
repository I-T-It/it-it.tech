import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { getContent } from '#lib/content/index.js';
import Experience from './Experience.svelte';

/** What the prerender writes, which is all a visitor without JavaScript ever gets. */
const html = () => render(Experience, { props: {} }).body;

describe('Experience prerender', () => {
	it('writes every role, none of them hidden or marked as a match', () => {
		const out = html();
		const jobs = getContent('nl').experience.jobs;
		expect(out.match(/<li class="job[^"]*"/g)).toHaveLength(jobs.length);
		for (const job of jobs) expect(out).toContain(`id="job-${job.id}"`);
		expect(out).not.toMatch(/<li class="job[^>]*\bhidden\b/);
		expect(out).not.toContain('data-match');
	});

	it('writes the filter at rest: "Alles" on, every other chip off, nothing announced', () => {
		const out = html();
		expect(out).toContain('data-filter');
		const pressed = out.match(/aria-pressed="(true|false)"/g) ?? [];
		expect(pressed.filter((p) => p === 'aria-pressed="true"')).toHaveLength(1);
		expect(pressed.length).toBeGreaterThan(10);
		expect(out).toMatch(/role="status"[^>]*>\s*<\/p>/);
	});

	it('writes the tail collapsed, so the first paint is short', () => {
		expect(html()).toContain('aria-expanded="false"');
	});
});
