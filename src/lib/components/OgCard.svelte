<script lang="ts">
	import { onMount } from 'svelte';
	import { company } from '#lib/content/company.js';
	import { getContent } from '#lib/content/index.js';
	import { OG_HEIGHT, OG_SEED, OG_WIDTH, titleLine } from '#lib/og.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import type { Point, Rect } from '#lib/pcb/geometry.js';
	import { heroEllipse } from '#lib/pcb/hero.js';
	import { layoutBoard } from '#lib/pcb/layout.js';
	import { Renderer } from '#lib/pcb/renderer.js';
	import { site, siteUrl } from '#lib/site.js';
	import Logo from '#lib/components/Logo.svelte';
	import OgPortrait from '#lib/components/OgPortrait.svelte';

	const content = getContent(getLocale());
	const meta = content.meta[site];

	/** The web address as the card shows it: the host of this build, e.g. deschepers.nl. */
	const host = new URL(siteUrl).host;

	let root = $state<HTMLElement>();
	let canvas = $state<HTMLCanvasElement>();
	let socket = $state<HTMLElement>();
	let copy = $state<HTMLElement>();
	let ready = $state(false);

	/** Fonts in: the faces load on first use, and the board is laid out round the text they set. */
	async function fontsLoaded(): Promise<void> {
		await Promise.all([
			document.fonts.load('600 48px "Fira Code Variable"'),
			document.fonts.load('500 24px "Fira Code Variable"')
		]);
		await document.fonts.ready;
	}

	/** A photo that failed to load would leave a hole in the card: fail instead of drawing it. */
	async function imagesLoaded(card: HTMLElement): Promise<void> {
		for (const img of card.querySelectorAll('img')) {
			await img.decode();
			if (img.naturalWidth === 0) throw new Error(`The card image ${img.currentSrc} did not load`);
		}
	}

	/** Lays the board out round the socket and the text, draws it whole, once. */
	function drawBoard(card: HTMLElement, surface: HTMLCanvasElement): void {
		const origin = card.getBoundingClientRect();
		const rectOf = (el: Element): Rect => {
			const r = el.getBoundingClientRect();
			return { x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height };
		};
		const centreOf = (el: Element): Point => {
			const r = rectOf(el);
			return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
		};

		const area: Rect = { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT };
		const socketRect = rectOf(socket!);
		const text = [...copy!.children].map(rectOf);
		const ports = [...socket!.querySelectorAll('[data-port]')];
		const leads = ports.flatMap((port, i) => (port.hasAttribute('data-lead') ? [i] : []));
		const ellipse = heroEllipse([socketRect, ...text], area);
		const board = layoutBoard({
			width: OG_WIDTH,
			height: OG_HEIGHT,
			chips: [],
			obstacles: text,
			socket: { rect: socketRect, ports: ports.map(centreOf), leads },
			hero: ellipse ? { rect: area, ellipse } : undefined,
			seed: OG_SEED
		});

		const renderer = new Renderer(surface, surface.getContext('2d')!);
		renderer.resize(OG_WIDTH, OG_HEIGHT, window.devicePixelRatio || 1);
		renderer.setBoard(board);
		// Every trace whole: a card is a still of the finished board.
		renderer.draw({
			view: { scrollX: 0, scrollY: 0, width: OG_WIDTH, height: OG_HEIGHT },
			drawn: () => Infinity,
			pulses: []
		});
	}

	onMount(() => {
		let gone = false;
		void (async () => {
			await fontsLoaded();
			await imagesLoaded(root!);
			if (gone) return;
			drawBoard(root!, canvas!);
			ready = true;
		})();
		return () => {
			gone = true;
		};
	});
</script>

<svelte:head>
	<!-- Built, screenshotted and removed again: never indexed, never linked. -->
	<meta name="robots" content="noindex" />
	<title>{meta.title}</title>
</svelte:head>

<main class="og" bind:this={root} data-og-ready={ready ? '' : undefined}>
	<canvas class="board" width={OG_WIDTH} height={OG_HEIGHT} aria-hidden="true" bind:this={canvas}
	></canvas>

	<div class="stage">
		<div class="socket" class:logo-socket={site === 'company'} bind:this={socket}>
			{#if site === 'company'}
				<Logo title={content.hero.logoAlt} />
			{:else}
				<OgPortrait alt={content.hero.photoAlt} />
			{/if}
		</div>

		<div class="copy" bind:this={copy}>
			{#if site === 'company'}
				<h1>{titleLine(meta.title)}</h1>
			{:else}
				<h1>
					{company.givenName}
					<span class="q">"</span><span class="nick">{company.nickname}</span><span class="q"
						>"</span
					>
					{company.familyName}
				</h1>
			{/if}
			<span class="rule" aria-hidden="true"></span>
			<div class="line">
				{#if site === 'personal'}
					<p class="tagline" lang="en">{content.profile.tagline}</p>
				{/if}
				<p class="host">{host}</p>
			</div>
		</div>
	</div>
</main>

<style>
	/* The card is a picture of a fixed size, whatever the window. */
	.og {
		position: relative;
		flex: none;
		overflow: hidden;
		width: 1200px;
		height: 630px;
		margin: 0;
		padding: 0;
		background: linear-gradient(90deg, var(--board-navy), var(--board-moss));
	}

	.board {
		position: absolute;
		inset: 0;
		width: 1200px;
		height: 630px;
	}

	.stage {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 32px;
	}

	.socket {
		position: relative;
		isolation: isolate;
		width: 264px;
		height: 264px;
	}

	/*
	 * The logo's lead trace leaves through the space between it and the text, as in the hero: that
	 * space is wide enough for the board to route through. Narrower, the lead runs over the text.
	 */
	.logo-socket {
		width: 560px;
		height: auto;
		margin-block-end: 36px;
	}

	/* The light under the socket, as in the hero. */
	.socket::before {
		content: '';
		position: absolute;
		inset: -45%;
		z-index: -1;
		background: radial-gradient(
			closest-side,
			color-mix(in srgb, var(--trace-cyan) 22%, transparent),
			color-mix(in srgb, var(--trace-green) 12%, transparent) 55%,
			transparent
		);
	}

	.copy {
		display: grid;
		justify-items: center;
		text-align: center;
	}

	h1 {
		margin: 0;
		font-size: 52px;
		line-height: 1.15;
		letter-spacing: -0.02em;
		text-wrap: nowrap;
	}

	.nick {
		color: var(--trace-cyan);
	}

	.q {
		color: var(--ink-muted);
	}

	/* A trace under the title: cyan from the left, green from the right, a pad at each end. */
	.rule {
		position: relative;
		display: block;
		width: 100%;
		height: 2px;
		margin-block: 16px 18px;
		background: linear-gradient(90deg, var(--trace-cyan), var(--ink) 50%, var(--trace-green));
	}

	.rule::before,
	.rule::after {
		content: '';
		position: absolute;
		top: 50%;
		width: 9px;
		height: 9px;
		margin-top: -4.5px;
		border-radius: 50%;
	}

	.rule::before {
		left: -4px;
		background: var(--pad-cyan);
	}

	.rule::after {
		right: -4px;
		background: var(--pad-green);
	}

	.line {
		display: flex;
		align-items: center;
		gap: 28px;
	}

	.line p {
		margin: 0;
		max-width: none;
	}

	/* The part marking on a chip: the tagline in a thin box with a pin-1 dot. */
	.tagline {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		padding: 6px 18px;
		border: 1px solid var(--silk);
		background: var(--chip-fill);
		font-family: var(--font-display);
		font-size: 24px;
		letter-spacing: 0.02em;
	}

	.tagline::before {
		content: '';
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--silk);
	}

	.host {
		color: var(--ink-muted);
		font-family: var(--font-display);
		font-size: 30px;
		font-weight: 500;
		letter-spacing: 0.02em;
	}
</style>
