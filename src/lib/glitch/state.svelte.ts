import type { Block, GlitchKind, Slice } from './schedule.js';

/**
 * State shared by the photo glitch (GlitchPhoto), its stop switch (GlitchToggle) and the layer
 * its fragments are drawn on (GlitchFx).
 *
 * Client-only in practice: nothing here is set during the prerender, so the server renders the
 * photo and no switch. `paused` is the visitor's choice (WCAG 2.2.2), kept in localStorage and read
 * once per page load; when storage is not available it lives in memory for this load.
 */

/** The localStorage key of the stop switch. */
export const PAUSED_KEY = 'photo-glitch-paused';

export const glitch = $state({
	/** The visitor stopped the glitch with the switch. */
	paused: false,
	/** The glitch has started: the switch is there, and the avatar is on its way. */
	armed: false,
	/** The visitor asks for less motion: no glitch, no switch. */
	reduced: false
});

/**
 * What the fragment layer draws. GlitchPhoto plays the timeline and writes here; GlitchFx, which
 * sits in the socket outside the die (the die clips, and the fragments spill past it), draws it.
 */
export const fx = $state({
	/** The glitch running, or null at rest: nothing is drawn. */
	kind: null as GlitchKind | null,
	slices: [] as Slice[],
	blocks: [] as Block[],
	/** Counts every change of the picture, the end of a glitch included. */
	frame: 0,
	/** The photo and the avatar as the browser picked them (`currentSrc`); the avatar once it has decoded. */
	photoSrc: '',
	avatarSrc: ''
});

/** Nothing running, nothing drawn. The pictures stay known: they are decoded and cached. */
export function clearFx(): void {
	if (fx.kind === null && fx.slices.length === 0 && fx.blocks.length === 0) return;
	fx.kind = null;
	fx.slices = [];
	fx.blocks = [];
	fx.frame++;
}

/** Reads the choice from localStorage. When storage fails, the choice made in this load stays. */
export function loadPaused(): boolean {
	try {
		glitch.paused = window.localStorage.getItem(PAUSED_KEY) === 'true';
	} catch {
		// Blocked storage: the state in memory is all there is.
	}
	return glitch.paused;
}

/** Sets and stores the choice. Not paused is the absence of the key. */
export function setPaused(paused: boolean): void {
	glitch.paused = paused;
	try {
		if (paused) window.localStorage.setItem(PAUSED_KEY, 'true');
		else window.localStorage.removeItem(PAUSED_KEY);
	} catch {
		// Blocked storage: the choice lasts for this page load.
	}
}

/**
 * Keeps `glitch.reduced` in line with html.reduced (the inline script in app.html sets it from the
 * media query) and with the media query itself. Returns the function that stops watching.
 */
export function trackReducedMotion(): () => void {
	const root = document.documentElement;
	const query =
		typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
	const read = () => {
		glitch.reduced = root.classList.contains('reduced') || (query?.matches ?? false);
	};
	read();
	query?.addEventListener('change', read);
	const observer = new MutationObserver(read);
	observer.observe(root, { attributes: true, attributeFilter: ['class'] });
	return () => {
		query?.removeEventListener('change', read);
		observer.disconnect();
	};
}
