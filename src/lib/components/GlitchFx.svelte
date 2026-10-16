<script lang="ts">
	import { TINT_RGB, sliceSpan, type Block, type Slice, type Tint } from '#lib/glitch/schedule.js';
	import { fx, glitch } from '#lib/glitch/state.svelte.js';

	/** A smear is one column of the picture stretched this many times along the row. */
	const SMEAR = 120;

	const color = (tint: Tint) => `rgb(${TINT_RGB[tint].join(' ')})`;

	/** The avatar is drawn only once it has decoded; until then its fragments are cut from the photo. */
	const sourceOf = (source: 'photo' | 'avatar') =>
		source === 'avatar' && fx.avatarSrc ? 'avatar' : 'photo';

	// The filters are set in the style attribute: in a stylesheet a url(#id) can be read against
	// the stylesheet's address, and the SVG filters live in this document.
	const sliceFilter = (slice: Slice) => (slice.split ? 'url(#glitch-split)' : undefined);
	const blockFilter = (block: Block) =>
		block.look === 'negative'
			? 'invert(1) hue-rotate(180deg)'
			: block.look === 'posterise'
				? 'url(#glitch-posterise) saturate(1.6) contrast(1.15)'
				: undefined;
</script>

<!--
	What the glitch tears off the picture, drawn over the socket and not inside the die: the die
	clips, and the fragments spill out of it onto the board. Whole slices of the photo or the
	avatar jump sideways; blocks of either come out in the wrong colours. Decoration all through:
	nothing here is announced, focusable or clickable, and each fragment is a window on an <img>
	with no alt text. GlitchPhoto plays the timeline and writes what to draw to `fx`; this draws
	it, and only while a glitch runs. The SVG is the two filters the fragments use.
-->
{#if glitch.armed && !glitch.reduced}
	<span class="fx" aria-hidden="true" data-fx={fx.kind ?? undefined} data-frame={fx.frame}>
		<svg class="defs" width="0" height="0" focusable="false" aria-hidden="true">
			<defs>
				<!-- Two ghosts, cyan and magenta (never red), a little apart: the signal split in two. -->
				<filter
					id="glitch-split"
					x="-5%"
					y="-5%"
					width="110%"
					height="110%"
					primitiveUnits="objectBoundingBox"
					color-interpolation-filters="sRGB"
				>
					<feColorMatrix
						in="SourceGraphic"
						type="matrix"
						values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"
						result="cyan"
					/>
					<feOffset in="cyan" dx="-0.025" dy="0" result="cyan-apart" />
					<feColorMatrix
						in="SourceGraphic"
						type="matrix"
						values="1 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
						result="magenta"
					/>
					<feOffset in="magenta" dx="0.025" dy="0" result="magenta-apart" />
					<feBlend in="cyan-apart" in2="magenta-apart" mode="screen" />
				</filter>
				<!-- Four flat levels a channel: the picture crushed. -->
				<filter id="glitch-posterise" color-interpolation-filters="sRGB">
					<feComponentTransfer>
						<feFuncR type="discrete" tableValues="0 0.35 0.7 1" />
						<feFuncG type="discrete" tableValues="0 0.35 0.7 1" />
						<feFuncB type="discrete" tableValues="0 0.35 0.7 1" />
					</feComponentTransfer>
				</filter>
			</defs>
		</svg>
		{#if fx.kind}
			{#each fx.slices as slice, i (i)}
				{@const [from, to] = sliceSpan(slice)}
				<span
					class="frag"
					data-part="slice"
					data-source={sourceOf(slice.source)}
					data-cast={slice.cast ? '' : undefined}
					data-split={slice.split ? '' : undefined}
					style:--l={from}
					style:--w={to - from}
					style:--t={slice.top}
					style:--h={slice.height}
					style:--dx={slice.shift}
					style:--dy={0}
					style:--tint={color(slice.tint)}
					style:filter={sliceFilter(slice)}
				>
					<span class="col">
						{#if fx.photoSrc}<img
								class="pic of-photo"
								src={fx.photoSrc}
								alt=""
								draggable="false"
							/>{/if}
						{#if fx.avatarSrc}<img
								class="pic of-avatar"
								src={fx.avatarSrc}
								alt=""
								draggable="false"
							/>{/if}
					</span>
				</span>
			{/each}
			{#each fx.blocks as block, i (i)}
				<span
					class="frag"
					data-part="block"
					data-look={block.look}
					data-source={sourceOf(block.source)}
					style:--l={block.left}
					style:--w={block.width}
					style:--t={block.top}
					style:--h={block.height}
					style:--dx={block.dx}
					style:--dy={block.dy}
					style:--m={block.look === 'smear' ? SMEAR : 1}
					style:--tint={color(block.tint)}
					style:filter={blockFilter(block)}
				>
					<span class="col">
						{#if fx.photoSrc}<img
								class="pic of-photo"
								src={fx.photoSrc}
								alt=""
								draggable="false"
							/>{/if}
						{#if fx.avatarSrc}<img
								class="pic of-avatar"
								src={fx.avatarSrc}
								alt=""
								draggable="false"
							/>{/if}
					</span>
				</span>
			{/each}
		{/if}
	</span>
{/if}

<style>
	/*
	 * The same box as the picture inside the die (the die is inset by --die-inset, set on the
	 * socket, and the picture by a pixel more). Nothing clips here: what is torn off may lie
	 * outside it. The hero clips sideways, so a fragment never makes the page scroll.
	 */
	.fx {
		position: absolute;
		inset: calc(var(--die-inset, 0px) + 1px);
		display: none;
		isolation: isolate;
		pointer-events: none;
	}

	.fx[data-fx] {
		display: block;
	}

	.defs {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}

	/*
	 * A window on the picture: --l, --t, --w and --h are its place in die units, --dx and --dy
	 * where the whole picture sits behind it (so --dx = 0 shows the picture where it is, and a
	 * slice moved by 0.3 shows the row from 0.3 further left).
	 */
	.frag {
		--tint: rgb(0 231 255);
		--m: 1;
		position: absolute;
		left: calc(var(--l) * 100%);
		top: calc(var(--t) * 100%);
		width: calc(var(--w) * 100%);
		height: calc(var(--h) * 100%);
		overflow: hidden;
		isolation: isolate;
	}

	.col {
		position: absolute;
		inset: 0;
	}

	/* A smear: the window's first 120th, stretched over the whole of it, so one column runs along the row. */
	.frag[data-look='smear'] .col {
		right: auto;
		width: calc(100% / 120);
		overflow: hidden;
		transform: scaleX(120);
		transform-origin: 0 0;
	}

	/* Width and offset are in windows; in a smear the column is a 120th of one, so they grow by --m. */
	.pic {
		position: absolute;
		left: calc((var(--dx) - var(--l)) / var(--w) * 100% * var(--m));
		top: calc((var(--dy) - var(--t)) / var(--h) * 100%);
		width: calc(100% / var(--w) * var(--m));
		height: calc(100% / var(--h));
		max-width: none;
		object-fit: cover;
	}

	.frag[data-source='photo'] .of-avatar,
	.frag[data-source='avatar'] .of-photo {
		display: none;
	}

	/* The cast: one hue over the picture, its lightness kept, so a colour goes wrong and nothing flashes. */
	.frag::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
		background: var(--tint);
		mix-blend-mode: color;
		opacity: 0;
	}

	.frag[data-cast]::before {
		opacity: 0.7;
	}

	.frag[data-look='tint']::before {
		opacity: 1;
	}

	.frag[data-look='posterise']::before {
		opacity: 0.5;
	}

	.frag[data-look='smear']::before {
		opacity: 0.65;
	}

	/* A hairline of the tint along the top and the bottom edge: the cut of the tear. */
	.frag::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 2;
		box-shadow:
			inset 0 1px 0 var(--tint),
			inset 0 -1px 0 var(--tint);
	}

	/* The page in print, and a visitor who asked for less motion, get the photo and nothing else. */
	@media print {
		.fx {
			display: none !important;
		}
	}

	:global(html.reduced) .fx {
		display: none !important;
	}
</style>
