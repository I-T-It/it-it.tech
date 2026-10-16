import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { getContent } from '#lib/content/index.js';
import Skills from './Skills.svelte';

/** What the prerender writes, which is all a visitor without JavaScript ever gets. */
const html = () => render(Skills, { props: {} }).body;

describe('Skills prerender', () => {
	it('writes every skill as plain text: no link and no hint about links without scripts', () => {
		const out = html();
		expect(out).not.toContain('<a ');
		expect(out).not.toContain('Een onderstreepte vaardigheid');
		const skills = getContent('nl').skills.groups.flatMap((g) => g.skills);
		for (const skill of skills) expect(out).toContain(`data-skill="${skill.id}"`);
	});
});
