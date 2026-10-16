import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { glitch, loadPaused, PAUSED_KEY, setPaused, trackReducedMotion } from './state.svelte.js';

const root = document.documentElement;

beforeEach(() => {
	localStorage.removeItem(PAUSED_KEY);
	glitch.paused = false;
	glitch.armed = false;
	glitch.reduced = false;
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	root.classList.remove('reduced');
	localStorage.removeItem(PAUSED_KEY);
});

describe('the paused state', () => {
	it('is not paused until someone pauses it, and nothing is armed', () => {
		expect(loadPaused()).toBe(false);
		expect(glitch.paused).toBe(false);
		expect(glitch.armed).toBe(false);
	});

	it('keeps the key it writes, so the pause survives a reload', () => {
		expect(PAUSED_KEY).toBe('photo-glitch-paused');
	});

	it('writes the choice to localStorage and reads it back on a fresh load', () => {
		setPaused(true);
		expect(glitch.paused).toBe(true);
		expect(localStorage.getItem(PAUSED_KEY)).toBe('true');

		// A new page load starts from the default and asks the storage.
		glitch.paused = false;
		expect(loadPaused()).toBe(true);
		expect(glitch.paused).toBe(true);

		setPaused(false);
		expect(glitch.paused).toBe(false);
		expect(localStorage.getItem(PAUSED_KEY)).toBeNull();
		glitch.paused = true;
		expect(loadPaused()).toBe(false);
	});

	it('works in memory, without errors, when localStorage throws on get and set', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		expect(loadPaused()).toBe(false);
		expect(() => setPaused(true)).not.toThrow();
		expect(glitch.paused).toBe(true);
		// The read fails too: the choice made in this page load stays.
		expect(loadPaused()).toBe(true);
		expect(() => setPaused(false)).not.toThrow();
		expect(glitch.paused).toBe(false);
	});

	it('works when the localStorage property itself throws', () => {
		vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});
		expect(() => setPaused(true)).not.toThrow();
		expect(loadPaused()).toBe(true);
	});
});

describe('reduced motion', () => {
	/** A media query that can be flipped, like the one in the browser. */
	function stubQuery(matches: boolean) {
		const listeners = new Set<() => void>();
		const query = {
			matches,
			addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
			removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener)
		};
		vi.stubGlobal('matchMedia', () => query);
		return {
			listeners,
			set(value: boolean) {
				query.matches = value;
				for (const listener of [...listeners]) listener();
			}
		};
	}

	it('reads html.reduced', async () => {
		stubQuery(false);
		root.classList.add('reduced');
		const stop = trackReducedMotion();
		expect(glitch.reduced).toBe(true);
		root.classList.remove('reduced');
		await vi.waitFor(() => expect(glitch.reduced).toBe(false));
		stop();
	});

	it('reads the media query, live', () => {
		const query = stubQuery(true);
		const stop = trackReducedMotion();
		expect(glitch.reduced).toBe(true);
		query.set(false);
		expect(glitch.reduced).toBe(false);
		query.set(true);
		expect(glitch.reduced).toBe(true);
		stop();
		expect(query.listeners.size).toBe(0);
	});

	it('stops watching html.reduced once stopped', async () => {
		stubQuery(false);
		const stop = trackReducedMotion();
		stop();
		root.classList.add('reduced');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(glitch.reduced).toBe(false);
	});
});
