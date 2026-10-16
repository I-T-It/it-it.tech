<script lang="ts">
	import { dev } from '$app/env';
	import { onMount, untrack } from 'svelte';
	import {
		FIRST_TEASER_MIN_MS,
		GLITCH_START_AFTER_POWER_MS,
		MAX_TRANSITIONS_PER_S,
		maxTransitionsInWindow,
		nextCycle,
		type Band,
		type Frame,
		type GlitchEvent,
		type GlitchKind,
		type Shown
	} from '#lib/glitch/schedule.js';
	import { glitch, loadPaused, trackReducedMotion } from '#lib/glitch/state.svelte.js';
	import { createRng, type Rng } from '#lib/pcb/rng.js';

	interface Props {
		/** The photo's alt text: what a screen reader gets, except while a swap shows the avatar. */
		photoAlt: string;
		/** The avatar's alt text, the accessible image while a swap shows it. */
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
	const REST_BANDS: Band[] = Array.from({ length: 3 }, () => ({
		top: 0,
		height: 0,
		shift: 0,
		source: 'photo',
		tint: 'cyan'
	}));

	let host: HTMLElement | undefined = $state();
	let photoEl: HTMLImageElement | undefined = $state();
	let avatarEl: HTMLImageElement | undefined = $state();

	// What the die shows: the whole image underneath, the glitch running, the bands.
	let shown: Shown = $state('photo');
	let kind: GlitchKind | null = $state(null);
	let bands: Band[] = $state(REST_BANDS);
	/** The avatar is the image in the accessibility tree: between the middles of the two swap glitches. */
	let held = $state(false);

	// The avatar loads only once the glitch has started, and is used only once it has decoded.
	let avatarMounted = $state(false);
	let avatarReady = $state(false);
	let avatarFailed = $state(false);
	let photoSrc = $state('');
	let avatarSrc = $state('');

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

	/** One generator for the whole visit, so a restart after a pause is a new cycle, not a replay. */
	let rng: Rng | undefined;

	/** The photo, nothing running: where every pause and every stop leaves the die. */
	function rest() {
		kind = null;
		shown = 'photo';
		held = false;
		bands = REST_BANDS;
	}

	function rememberPhoto() {
		if (glitch.armed && photoEl) photoSrc = photoEl.currentSrc;
	}

	/**
	 * Plays cycle after cycle until the returned function is called, which also snaps the die to rest.
	 * An event the avatar is not ready for is played as far as it can be: a flicker as a plain
	 * teaser, a swap not at all.
	 */
	function play(random: Rng): () => void {
		let timer: ReturnType<typeof setTimeout> | undefined;
		let swapping = false;
		let flickering = false;

		const frame = (event: GlitchEvent, f: Frame) => {
			const isSwap = event.kind === 'swap-in' || event.kind === 'swap-out';
			if (event.kind === 'swap-in' && f.at === 0) swapping = usable();
			if (event.kind === 'flicker' && f.at === 0) flickering = usable();
			if (isSwap && !swapping) return;
			if (event.kind === 'flicker' && !flickering) {
				kind = 'tease';
				shown = 'photo';
			} else {
				kind = event.kind;
				shown = f.show;
			}
			bands = f.bands;
			if (isSwap) held = f.show === 'avatar';
		};

		const end = (event: GlitchEvent) => {
			const isSwap = event.kind === 'swap-in' || event.kind === 'swap-out';
			if (isSwap && !swapping) return;
			if (event.kind === 'swap-out') swapping = false;
			kind = null;
			bands = REST_BANDS;
		};

		const cycle = () => {
			const planned = nextCycle(random, 0, { avatar: !avatarFailed });
			if (dev && maxTransitionsInWindow(planned.events, 1000) > MAX_TRANSITIONS_PER_S) {
				console.error('The photo glitch would flash more than 3 times a second.');
			}
			const steps: { at: number; run: () => void }[] = [];
			for (const event of planned.events) {
				for (const f of event.frames) {
					steps.push({ at: event.at + f.at, run: () => frame(event, f) });
				}
				steps.push({ at: event.at + event.duration, run: () => end(event) });
			}
			// The cycle is over when its last glitch is, or, without the avatar, where the swap would be.
			steps.push({ at: planned.end, run: () => {} });

			let i = 0;
			let cursor = 0;
			const next = () => {
				if (i === steps.length) return cycle();
				const step = steps[i++];
				timer = setTimeout(() => {
					cursor = step.at;
					step.run();
					next();
				}, step.at - cursor);
			};
			next();
		};

		cycle();
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
			if (powered) armIn(FIRST_TEASER_MIN_MS);
		}
	});

	// The avatar is asked for once, when the glitch starts and the visitor has not stopped it.
	$effect(() => {
		if (glitch.armed && !glitch.paused && !glitch.reduced) avatarMounted = true;
	});

	// The photo as the browser picked it, for the strips that tear off it.
	$effect(rememberPhoto);

	// Flickers and swaps wait until the avatar has decoded, so a 100 ms flash is never half an image.
	$effect(() => {
		const el = avatarEl;
		if (!el) return;
		let current = true;
		el.decode().then(
			() => {
				if (!current) return;
				avatarSrc = el.currentSrc;
				avatarReady = true;
			},
			() => {
				if (current) avatarFailed = true;
			}
		);
		return () => {
			current = false;
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
	The photo, and over it what the glitch does. The photo is the only image a screen reader finds,
	except between the middles of the two swap glitches, when the avatar takes its place (silently:
	no live region). The bands, the strips in them and the avatar's flickers are decoration.
-->
<div class="glitch" bind:this={host} data-show={shown} data-glitch={kind ?? undefined}>
	<!-- The avatar fills the same frame, so both pictures say the same sizes (a literal: enhanced:img reads it at build time). -->
	<enhanced:img
		class="photo"
		src="../assets/robbin-schepers.jpg"
		alt={photoAlt}
		sizes="(min-width: 40rem) 26rem, 46vw"
		bind:this={photoEl}
		aria-hidden={held ? 'true' : undefined}
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
			aria-hidden={held ? undefined : 'true'}
			onerror={() => (avatarFailed = true)}
		/>
	{/if}
	{#if glitch.armed}
		<span class="bands" aria-hidden="true">
			{#each bands as band, i (i)}
				<span
					class="band"
					data-source={band.source}
					data-tint={band.tint}
					style:--t={band.top}
					style:--h={band.height}
					style:--shift={band.shift}
				>
					{#if photoSrc}
						<img class="strip strip-photo" src={photoSrc} alt="" />
					{/if}
					{#if avatarSrc}
						<img class="strip strip-avatar" src={avatarSrc} alt="" />
					{/if}
				</span>
			{/each}
		</span>
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

	/* Over the photo, the same size: it shows only while a swap or a flicker says so, with no fade. */
	.avatar {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
	}

	.glitch[data-show='avatar'] .avatar {
		visibility: visible;
	}

	/*
	 * Three thin strips of an image, torn sideways, with a cyan or green tint: all that moves in a
	 * teaser. Each band is a window on the die; its image is as big as the die and pulled up by
	 * the band's own top, so the strip shows the picture where the band sits, then --shift moves it.
	 */
	.bands {
		position: absolute;
		inset: 1px;
		display: none;
		pointer-events: none;
	}

	.glitch[data-glitch] .bands {
		display: block;
	}

	.band {
		--tint: var(--trace-cyan);
		position: absolute;
		left: 0;
		right: 0;
		top: calc(var(--t) * 100%);
		height: calc(var(--h) * 100%);
		overflow: hidden;
		box-shadow: 0 1px 0 color-mix(in srgb, var(--tint) 70%, transparent);
	}

	.band[data-tint='green'] {
		--tint: var(--trace-green);
	}

	.band::after {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--tint);
		mix-blend-mode: screen;
		opacity: 0.45;
	}

	.strip {
		position: absolute;
		left: 0;
		top: calc(var(--t) / var(--h) * -100%);
		width: 100%;
		height: calc(100% / var(--h));
		max-width: none;
		object-fit: cover;
		object-position: 45% 30%;
		transform: translateX(calc(var(--shift) * 100%));
	}

	.band[data-source='photo'] .strip-avatar,
	.band[data-source='avatar'] .strip-photo {
		display: none;
	}

	/* The page in print, and a visitor who asked for less motion, get the photo and nothing else. */
	@media print {
		.avatar,
		.bands {
			display: none !important;
		}
	}

	:global(html.reduced) .avatar,
	:global(html.reduced) .bands {
		display: none !important;
	}
</style>
