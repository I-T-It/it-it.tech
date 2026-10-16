<script lang="ts">
	import { dev } from '$app/env';
	import { onMount, untrack } from 'svelte';
	import {
		GLITCH_START_AFTER_POWER_MS,
		GLITCH_WAIT_MIN_MS,
		MAX_TRANSITIONS_PER_S,
		maxTransitionsInWindow,
		nextGlitch,
		type Frame,
		type GlitchEvent,
		type GlitchKind,
		type Shown
	} from '#lib/glitch/schedule.js';
	import { clearFx, fx, glitch, loadPaused, trackReducedMotion } from '#lib/glitch/state.svelte.js';
	import { createRng, type Rng } from '#lib/pcb/rng.js';

	interface Props {
		/** The photo's alt text: what a screen reader gets while the photo holds the signal. */
		photoAlt: string;
		/** The avatar's alt text, the accessible image while the avatar holds the signal. */
		avatarAlt: string;
		/** The seed of this visit's glitch. Default: a random one, or `?glitch-seed=` in a test run. */
		seed?: number;
	}

	let { photoAlt, avatarAlt, seed }: Props = $props();

	/**
	 * Without a board to power the socket, the glitch arms this long after mount: after the 10 s the
	 * intro takes to show everything when the board never comes.
	 */
	const NO_POWER_ARM_MS = 12_000;

	let host: HTMLElement | undefined = $state();
	let photoEl: HTMLImageElement | undefined = $state();
	let avatarEl: HTMLImageElement | undefined = $state();

	// What the die shows: the whole image underneath, and the glitch running. The fragments the
	// glitch tears off are drawn by GlitchFx from `fx`, outside the die.
	let shown: Shown = $state('photo');
	let kind: GlitchKind | null = $state(null);
	/**
	 * The image that holds the signal: the one the die shows between glitches and the one in the
	 * accessibility tree. The photo and the avatar fight over it. Only a swap hands it over, in the
	 * middle of its glitch; a flash shows the other image for a moment and a tear shows neither, and
	 * both leave it where it was.
	 */
	let holder: Shown = $state('photo');

	// The avatar loads only once the glitch has started, and is used only once it has decoded.
	let avatarMounted = $state(false);
	let avatarReady = $state(false);
	let avatarFailed = $state(false);

	let pageVisible = $state(true);
	let inView = $state(true);

	const usable = () => avatarMounted && avatarReady && !avatarFailed;

	// The socket has power (or the wait for it is over); the glitch arms a little after.
	let powered = false;
	let armTimer: ReturnType<typeof setTimeout> | undefined;
	let safetyTimer: ReturnType<typeof setTimeout> | undefined;

	function arm() {
		if (!glitch.reduced) glitch.armed = true;
	}

	function armIn(ms: number) {
		clearTimeout(armTimer);
		armTimer = setTimeout(arm, ms);
	}

	function onPower() {
		if (powered) return;
		powered = true;
		clearTimeout(safetyTimer);
		if (!glitch.reduced) armIn(GLITCH_START_AFTER_POWER_MS);
	}

	function pickSeed(): number {
		const fromUrl = new URLSearchParams(location.search).get('glitch-seed');
		if (navigator.webdriver && fromUrl && Number.isFinite(Number(fromUrl))) {
			return Number(fromUrl) >>> 0;
		}
		return crypto.getRandomValues(new Uint32Array(1))[0];
	}

	/** One generator for the whole visit, so a restart after a pause is a new run, not a replay. */
	let rng: Rng | undefined;

	/** The photo holds the signal, nothing running: where every pause and every stop leaves the die. */
	function rest() {
		kind = null;
		shown = 'photo';
		holder = 'photo';
		clearFx();
	}

	function rememberPhoto() {
		if (glitch.armed && photoEl) fx.photoSrc = photoEl.currentSrc;
	}

	/**
	 * Plays glitch after glitch until the returned function is called, which also snaps the die to
	 * rest. Each glitch is planned when the one before it is over, from the image that holds the
	 * signal by then. A glitch that needs the whole avatar (a flash, or a swap to it) is played as a
	 * plain tear of the holder while the avatar has not decoded: the signal stays where it is.
	 */
	function play(random: Rng): () => void {
		let timer: ReturnType<typeof setTimeout> | undefined;
		/** The glitch playing may change the whole image; false while the avatar is not ready for it. */
		let whole = true;

		const frame = (event: GlitchEvent, f: Frame) => {
			if (f.at === 0) whole = event.kind === 'tear' || usable();
			kind = whole ? event.kind : 'tear';
			shown = whole ? f.show : holder;
			fx.kind = kind;
			fx.slices = f.slices;
			fx.blocks = f.blocks;
			fx.frame++;
			// The signal changes hands where the whole image does, in the middle of a swap.
			if (whole && event.kind === 'swap') holder = f.show;
		};

		const end = () => {
			kind = null;
			shown = holder;
			clearFx();
		};

		const glitchOnce = () => {
			const planned = nextGlitch(random, 0, holder, { avatar: !avatarFailed });
			if (dev && maxTransitionsInWindow([planned], 1000) > MAX_TRANSITIONS_PER_S) {
				console.error('The photo glitch would flash more than 3 times a second.');
			}
			const steps = [
				...planned.frames.map((f) => ({ at: planned.at + f.at, run: () => frame(planned, f) })),
				{ at: planned.at + planned.duration, run: end }
			];

			let i = 0;
			let cursor = 0;
			const next = () => {
				if (i === steps.length) return glitchOnce();
				const step = steps[i++];
				timer = setTimeout(() => {
					cursor = step.at;
					step.run();
					next();
				}, step.at - cursor);
			};
			next();
		};

		glitchOnce();
		return () => {
			clearTimeout(timer);
			rest();
		};
	}

	onMount(() => {
		const stopMotion = trackReducedMotion();
		loadPaused();
		const socket = host?.closest<HTMLElement>('.photo-socket') ?? null;

		// The board sets data-power="on" on the socket when its leads arrive; the glitch starts
		// once the scroll link is in. A board that never comes must not leave it waiting.
		let powerWatch: MutationObserver | undefined;
		if (socket?.dataset.power === 'on') {
			onPower();
		} else {
			if (socket) {
				powerWatch = new MutationObserver(() => {
					if (socket.dataset.power !== 'on') return;
					powerWatch?.disconnect();
					onPower();
				});
				powerWatch.observe(socket, { attributes: true, attributeFilter: ['data-power'] });
			}
			safetyTimer = setTimeout(() => {
				if (powered) return;
				powered = true;
				arm();
			}, NO_POWER_ARM_MS);
		}

		const onVisibility = () => {
			pageVisible = !document.hidden;
		};
		pageVisible = !document.hidden;
		document.addEventListener('visibilitychange', onVisibility);

		// Out of the window means off: it is the socket that scrolls away, with the toggle on it.
		const watched = socket ?? host;
		const observer =
			watched && typeof IntersectionObserver === 'function'
				? new IntersectionObserver(
						(entries) => {
							const last = entries.at(-1);
							if (last) inView = last.isIntersecting;
						},
						{ threshold: 0 }
					)
				: null;
		if (watched) observer?.observe(watched);

		return () => {
			clearTimeout(armTimer);
			clearTimeout(safetyTimer);
			powerWatch?.disconnect();
			observer?.disconnect();
			document.removeEventListener('visibilitychange', onVisibility);
			stopMotion();
			glitch.armed = false;
			fx.photoSrc = '';
			clearFx();
		};
	});

	// Reduced motion on: no glitch, no avatar, no switch. Off again: a short wait, then back.
	let wasReduced = false;
	$effect(() => {
		if (glitch.reduced) {
			wasReduced = true;
			clearTimeout(armTimer);
			glitch.armed = false;
			avatarMounted = false;
			avatarReady = false;
			avatarFailed = false;
		} else if (wasReduced) {
			wasReduced = false;
			if (powered) armIn(GLITCH_WAIT_MIN_MS);
		}
	});

	// The avatar is asked for once, when the glitch starts and the visitor has not stopped it.
	$effect(() => {
		if (glitch.armed && !glitch.paused && !glitch.reduced) avatarMounted = true;
	});

	// The photo as the browser picked it, for the fragments that tear off it.
	$effect(rememberPhoto);

	// Flashes and swaps wait until the avatar has decoded, so a 100 ms flash is never half an image.
	$effect(() => {
		const el = avatarEl;
		if (!el) return;
		let current = true;
		el.decode().then(
			() => {
				if (!current) return;
				fx.avatarSrc = el.currentSrc;
				avatarReady = true;
			},
			() => {
				if (current) avatarFailed = true;
			}
		);
		return () => {
			current = false;
			fx.avatarSrc = '';
		};
	});

	// The timeline runs while the glitch is armed, not stopped, allowed, on screen and in sight.
	// Whatever stops it snaps the die to the photo; a new run starts with a fresh wait.
	$effect(() => {
		if (!glitch.armed || glitch.paused || glitch.reduced || !pageVisible || !inView) return;
		const random = (rng ??= createRng(seed ?? pickSeed()));
		return untrack(() => play(random));
	});
</script>

<!--
	The photo and the avatar, and over them what the glitch does. They fight over the signal: the one
	that holds it is the image a screen reader finds, and it is the photo until a swap hands it to the
	avatar, and the avatar until a swap hands it back (silently: no live region). A flash shows the
	other image for a moment and what a glitch tears off (slices, blocks, the other image bleeding
	through) is drawn by GlitchFx, outside the die; none of it touches the accessibility tree. The
	avatar is hidden with opacity, not visibility, so it stays in the tree through a flash of the photo.
-->
<div class="glitch" bind:this={host} data-show={shown} data-glitch={kind ?? undefined}>
	<!-- The avatar fills the same frame, so both pictures say the same sizes (a literal: enhanced:img reads it at build time). -->
	<enhanced:img
		class="photo"
		src="../assets/robbin-schepers.jpg"
		alt={photoAlt}
		sizes="(min-width: 40rem) 26rem, 46vw"
		fetchpriority="high"
		bind:this={photoEl}
		aria-hidden={holder === 'avatar' ? 'true' : undefined}
		onload={rememberPhoto}
	/>
	{#if avatarMounted}
		<enhanced:img
			class="avatar"
			src="../assets/roboroads-avatar.png"
			alt={avatarAlt}
			sizes="(min-width: 40rem) 26rem, 46vw"
			decoding="async"
			fetchpriority="low"
			bind:this={avatarEl}
			aria-hidden={holder === 'avatar' ? undefined : 'true'}
			onerror={() => (avatarFailed = true)}
		/>
	{/if}
</div>

<style>
	.glitch {
		position: absolute;
		inset: 0;
	}

	/* enhanced:img puts the class on the <img> inside a <picture>. */
	.photo,
	.avatar {
		display: block;
		width: calc(100% - 2px);
		height: calc(100% - 2px);
		margin: 1px;
		object-fit: cover;
		clip-path: polygon(14% 0, 100% 0, 100% 100%, 0 100%, 0 14%);
	}

	.photo {
		object-position: 45% 30%;
	}

	/*
	 * Over the photo, the same size: it shows only while it holds the signal or a flash says so,
	 * with no fade. Opacity and not visibility, which would take it out of the accessibility tree
	 * for as long as a flash shows the photo over the avatar that holds the signal.
	 */
	.avatar {
		position: absolute;
		top: 0;
		left: 0;
		opacity: 0;
	}

	.glitch[data-show='avatar'] .avatar {
		opacity: 1;
	}

	/* The page in print, and a visitor who asked for less motion, get the photo and nothing else. */
	@media print {
		.avatar {
			display: none !important;
		}
	}

	:global(html.reduced) .avatar {
		display: none !important;
	}
</style>
