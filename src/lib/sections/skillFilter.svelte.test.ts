import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXPERIENCE_ID, skillFilter } from './skillFilter.svelte.js';

const available = new Set(['laravel', 'vue', 'python']);

/** Sets the address without SvelteKit's router, which is not running in a component test. */
function setAddress(search: string, hash = '') {
	History.prototype.replaceState.call(history, null, '', location.pathname + search + hash);
}

beforeEach(() => {
	setAddress('');
	skillFilter.restore(available);
});

afterEach(() => {
	setAddress('');
	skillFilter.restore(available);
});

describe('skill filter', () => {
	it('names the section it sits in, the anchor of the Experience chip', () => {
		expect(EXPERIENCE_ID).toBe('experience');
	});

	it('is off at first', () => {
		expect(skillFilter.active).toBeUndefined();
	});

	describe('restore (the address is the source)', () => {
		it('reads the skill from the query', () => {
			setAddress('?skill=laravel', '#experience');
			skillFilter.restore(available);
			expect(skillFilter.active).toBe('laravel');
		});

		it('reads any spelling as its key', () => {
			setAddress('?skill=Vue.js');
			skillFilter.restore(available);
			expect(skillFilter.active).toBe('vue');
		});

		it('ignores a skill that no role has, and a missing one', () => {
			setAddress('?skill=rust');
			skillFilter.restore(available);
			expect(skillFilter.active).toBeUndefined();
			setAddress('?other=1');
			skillFilter.restore(available);
			expect(skillFilter.active).toBeUndefined();
		});

		it('turns the filter off again when the address loses its skill', () => {
			setAddress('?skill=laravel');
			skillFilter.restore(available);
			setAddress('', '#experience');
			skillFilter.restore(available);
			expect(skillFilter.active).toBeUndefined();
		});
	});

	describe('select', () => {
		it('sets the filter at once and writes it to the address, with the section', async () => {
			skillFilter.select('laravel');
			expect(skillFilter.active).toBe('laravel');
			await expect.poll(() => location.search + location.hash).toBe('?skill=laravel#experience');
		});

		it('keeps the path and any other query', async () => {
			setAddress('?utm=mail');
			const path = location.pathname;
			skillFilter.select('vue');
			await expect.poll(() => location.search).toBe('?utm=mail&skill=vue');
			expect(location.pathname).toBe(path);
		});

		it('replaces the skill of the address, and does not add a history entry', async () => {
			const length = history.length;
			skillFilter.select('laravel');
			skillFilter.select('python');
			await expect.poll(() => location.search).toBe('?skill=python');
			expect(skillFilter.active).toBe('python');
			expect(history.length).toBe(length);
		});

		it('takes the skill out of the address for no skill, and keeps the section', async () => {
			skillFilter.select('laravel');
			await expect.poll(() => location.search).toBe('?skill=laravel');
			skillFilter.select(undefined);
			expect(skillFilter.active).toBeUndefined();
			await expect.poll(() => location.search + location.hash).toBe('#experience');
		});

		it('reads back what it wrote', async () => {
			skillFilter.select('vue');
			await expect.poll(() => location.search).toBe('?skill=vue');
			skillFilter.restore(available);
			expect(skillFilter.active).toBe('vue');
		});
	});
});
