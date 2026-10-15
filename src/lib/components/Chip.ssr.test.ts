import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Chip from './Chip.svelte';

/** What the prerender writes, which is all a visitor without JavaScript ever gets. */
function prerender(props: { side?: 'both' | 'left' | 'right' } = {}): string {
	const children = createRawSnippet(() => ({
		render: () => '<div><h2 id="about-title">Over mij</h2><p>Tekst</p></div>'
	}));
	return render(Chip, {
		props: { id: 'about', designator: 'U3', labelledby: 'about-title', children, ...props }
	}).body;
}

describe('Chip prerender', () => {
	it('writes the section with the content and the designator', () => {
		const html = prerender();
		expect(html).toContain('<section');
		expect(html).toContain('id="about"');
		expect(html).toContain('aria-labelledby="about-title"');
		expect(html).toContain('Over mij');
		expect(html).toContain('U3');
	});

	it('writes no data-state, so the chip is on without JS and under reduced motion', () => {
		expect(prerender()).not.toContain('data-state');
	});

	it('writes two pins per side and hides them from screen readers', () => {
		const html = prerender();
		expect(html.match(/data-pin-side="left"/g)).toHaveLength(2);
		expect(html.match(/data-pin-side="right"/g)).toHaveLength(2);
		expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(4);
	});
});
