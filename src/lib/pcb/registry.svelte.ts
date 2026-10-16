/**
 * Meeting point of the sections and the PCB board.
 *
 * Module-level and client-only: sections attach with `{@attach}`, which never runs during
 * prerender, so no context ancestor is needed. The board reads `chips()`, `obstacles()`,
 * `socket()` and `hero()` after `document.fonts.ready`, lays out around them and drives each
 * chip's `state`.
 *
 * ```svelte
 * <section {@attach (el) => { const chip = registerChip(el, { id: 'about', designator: 'U3', side: 'both' }); return () => chip.destroy(); }}>
 * <section {@attach registerHero}> <!-- the hero: the board fills it with a field of traces -->
 * <div {@attach registerSocket}>  <!-- the hero logo or photo frame, with [data-port] children -->
 * ```
 *
 * The socket is the hero element the socket traces plug into: the logo (company) or the photo's
 * footprint (personal). Its ports are the `[data-port]` elements inside it, at any depth; the board
 * ends one or more traces on the centre of each. The board keeps traces out of the socket's own
 * rect, so it needs no `registerObstacle` as well.
 */

export type ChipSide = 'both' | 'left' | 'right';

/** `off`: dark. `booting`: pins light one after another. `on`: faint glow, LED lit. */
export type ChipState = 'off' | 'booting' | 'on';

export interface ChipOptions {
	/** Unique across the page, e.g. "about". Registering the same id twice throws. */
	id: string;
	/** "U3". The chip prints it in the top left corner. */
	designator: string;
	/** Which sides of the chip get branches from the spine. */
	side: ChipSide;
}

/** How long a flashed pin keeps `data-flash`, in milliseconds. */
export const PIN_FLASH_MS = 350;

export class ChipHandle {
	readonly id: string;
	readonly designator: string;
	readonly side: ChipSide;
	readonly el: HTMLElement;
	/** Reactive. The board writes it, the Chip component reads it into `data-state`. */
	state = $state<ChipState>('off');

	#destroyed = false;
	// Plain collections on purpose: nothing reads them reactively. Changes go out through onChange().
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#flashTimers = new Map<Element, ReturnType<typeof setTimeout>>();
	#onDestroy: (handle: ChipHandle) => void;

	constructor(el: HTMLElement, options: ChipOptions, onDestroy: (handle: ChipHandle) => void) {
		this.el = el;
		this.id = options.id;
		this.designator = options.designator;
		this.side = options.side;
		this.#onDestroy = onDestroy;
	}

	get destroyed(): boolean {
		return this.#destroyed;
	}

	/** The pin elements, in DOM order. Every pin is a real element with `data-pin`. */
	pins(): HTMLElement[] {
		return Array.from(this.el.querySelectorAll<HTMLElement>('[data-pin]'));
	}

	/**
	 * Lights pin `index` for a moment by setting `data-flash` on it. CSS draws the flash.
	 * An index with no pin does nothing.
	 */
	flashPin(index: number): void {
		if (this.#destroyed) return;
		const pin = this.pins()[index];
		if (!pin) return;
		clearTimeout(this.#flashTimers.get(pin));
		pin.setAttribute('data-flash', 'true');
		this.#flashTimers.set(
			pin,
			setTimeout(() => {
				pin.removeAttribute('data-flash');
				this.#flashTimers.delete(pin);
			}, PIN_FLASH_MS)
		);
	}

	/** Unregisters the chip. Safe to call more than once. */
	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		for (const [pin, timer] of this.#flashTimers) {
			clearTimeout(timer);
			pin.removeAttribute('data-flash');
		}
		this.#flashTimers.clear();
		this.#onDestroy(this);
	}
}

/** The hero element the socket traces plug into. */
export interface SocketHandle {
	readonly el: HTMLElement;
	/** The port elements (`[data-port]`, at any depth), in DOM order, read live. */
	ports(): HTMLElement[];
}

/** The hero section the board fills with its trace field. */
export interface HeroHandle {
	readonly el: HTMLElement;
	/** The links and buttons inside it (the scroll indicator), read live: the field goes round them. */
	controls(): HTMLElement[];
}

// Plain collections on purpose: nothing reads them reactively. Changes go out through onChange().
/* eslint-disable svelte/prefer-svelte-reactivity */
const chipMap = new Map<string, ChipHandle>();
const obstacleList: { el: HTMLElement }[] = [];
const socketList: SocketHandle[] = [];
const heroList: HeroHandle[] = [];
const listeners = new Set<() => void>();
/* eslint-enable svelte/prefer-svelte-reactivity */

function notify(): void {
	for (const listener of [...listeners]) listener();
}

/** Registers a section as a chip. Returns its handle. Throws when the id is already taken. */
export function registerChip(el: HTMLElement, options: ChipOptions): ChipHandle {
	if (chipMap.has(options.id)) {
		throw new Error(`Chip "${options.id}" is already registered`);
	}
	const handle = new ChipHandle(el, options, (h) => {
		if (chipMap.get(h.id) === h) {
			chipMap.delete(h.id);
			notify();
		}
	});
	chipMap.set(options.id, handle);
	notify();
	return handle;
}

/**
 * Registers an element the traces must route around (hero logo, photo). Returns the function that
 * unregisters it. That function is safe to call more than once.
 */
export function registerObstacle(el: HTMLElement): () => void {
	const entry = { el };
	obstacleList.push(entry);
	notify();
	return () => {
		const index = obstacleList.indexOf(entry);
		if (index === -1) return;
		obstacleList.splice(index, 1);
		notify();
	};
}

/**
 * Registers the hero socket. Its ports are its `[data-port]` children. Returns the function that
 * unregisters it, safe to call more than once. When more than one is registered, the latest wins.
 */
export function registerSocket(el: HTMLElement): () => void {
	const handle: SocketHandle = {
		el,
		ports: () => Array.from(el.querySelectorAll<HTMLElement>('[data-port]'))
	};
	socketList.push(handle);
	notify();
	return () => {
		const index = socketList.indexOf(handle);
		if (index === -1) return;
		socketList.splice(index, 1);
		notify();
	};
}

/** The registered socket, or null when there is none. */
export function socket(): SocketHandle | null {
	return socketList.at(-1) ?? null;
}

/**
 * Registers the hero section. The board fills it, edge to edge across the window, with a field of
 * traces that leaves an ellipse round the hero's content clear: the socket and the obstacles inside
 * the section. Returns the function that unregisters it, safe to call more than once. When more
 * than one is registered, the latest wins.
 */
export function registerHero(el: HTMLElement): () => void {
	const handle: HeroHandle = {
		el,
		controls: () => Array.from(el.querySelectorAll<HTMLElement>('a, button'))
	};
	heroList.push(handle);
	notify();
	return () => {
		const index = heroList.indexOf(handle);
		if (index === -1) return;
		heroList.splice(index, 1);
		notify();
	};
}

/** The registered hero, or null when there is none. */
export function hero(): HeroHandle | null {
	return heroList.at(-1) ?? null;
}

/** Snapshot of the registered chips, in registration order. */
export function chips(): ChipHandle[] {
	return [...chipMap.values()];
}

/** Snapshot of the registered obstacle elements. */
export function obstacles(): HTMLElement[] {
	return obstacleList.map((entry) => entry.el);
}

/**
 * Calls `callback` whenever a chip, an obstacle, the socket or the hero is registered or
 * unregistered. It does not fire for `state` changes. Returns the function that stops the
 * listening.
 */
export function onChange(callback: () => void): () => void {
	listeners.add(callback);
	return () => {
		listeners.delete(callback);
	};
}
