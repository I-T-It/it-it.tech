import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import GlitchFx from './GlitchFx.svelte';

describe('GlitchFx prerender', () => {
	it('writes nothing: the layer, its filters and its fragments exist only once the glitch has started', () => {
		const html = render(GlitchFx).body;
		expect(html).not.toContain('class="fx');
		expect(html).not.toContain('<svg');
		expect(html).not.toContain('<img');
		expect(html).not.toContain('frag');
	});
});
