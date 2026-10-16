<script lang="ts">
	interface Props {
		/** Draw the logo on load: the traces first, then the pads pop, then the letters fade in. */
		animate?: boolean;
		/** Width. A number is CSS pixels, a string any CSS length. Default: the width of the parent. */
		size?: number | string;
		/**
		 * The name for screen readers ("I.T. It"). Without it the logo is decoration: hidden from
		 * screen readers. The caller passes the text, this component holds no copy.
		 */
		title?: string;
		class?: string;
	}

	let { animate = false, size, title, class: className }: Props = $props();

	// Gradient ids must be unique per instance: the header and the hero both draw the logo.
	const uid = $props.id();

	const width = $derived(typeof size === 'number' ? `${size}px` : size);
</script>

<!--
	Drawn from itit_svg_color.svg: two 45-degree traces (cyan from the left, green from the right
	fading to white), two pads and the letters, cropped to the artwork.
	pathLength="1" lets the draw animation use a dash of 1 whatever the length of the trace.
-->
<svg
	class={['logo', className]}
	class:animate
	viewBox="70 65 860 297"
	role={title ? 'img' : undefined}
	aria-label={title}
	aria-hidden={title ? undefined : 'true'}
	focusable="false"
	style:width
>
	<defs>
		<linearGradient
			id="{uid}-cyan"
			x1="-30.486915%"
			y1="24.9610967%"
			x2="120.060809%"
			y2="63.6454581%"
		>
			<stop stop-color="#00E7FF" offset="0%" />
			<stop stop-color="#FFFFFF" offset="100%" />
		</linearGradient>
		<linearGradient
			id="{uid}-green"
			x1="132.029982%"
			y1="36.3043148%"
			x2="-54.8131144%"
			y2="57.120735%"
		>
			<stop stop-color="#3FD83F" offset="0%" />
			<stop stop-color="#FFFFFF" offset="100%" />
		</linearGradient>
	</defs>

	<g transform="translate(75 70)" fill="none" fill-rule="evenodd">
		<polyline
			class="trace trace-cyan"
			pathLength="1"
			stroke="url(#{uid}-cyan)"
			stroke-width="9"
			points="437.859079 202.200206 437.859079 93.064912 344.487805 0.273584051 0.409048685 0 0 193.975481 92.7913279 287.093736 161.480995 287.093736"
		/>
		<polyline
			class="trace trace-green"
			pathLength="1"
			stroke="url(#{uid}-green)"
			stroke-width="9"
			transform="translate(221.929229 0)"
			points="0 203.399777 0 287.093736 628.142184 287.093736 628.142184 92.2693625 535.33875 0 285.680579 0"
		/>

		<circle class="pad pad-green" fill="#C9F4C9" cx="222.699" cy="202.156" r="16.815" />
		<circle class="pad pad-cyan" fill="#D9FBFF" cx="438.439" cy="202.156" r="16.815" />

		<!--
			Ports: the two open trace ends (the last point of each polyline above), where the board
			joins its socket traces to the logo. Real elements, so the board reads their rendered
			position, whatever the size. They draw nothing. Both take a lead trace of the hero
			(data-lead): when the leads arrive, the logo's traces draw from here.
		-->
		<circle class="port" data-port="cyan" data-lead cx="161.480995" cy="287.093736" r="1" />
		<circle
			class="port"
			data-port="green"
			data-lead
			transform="translate(221.929229 0)"
			cx="285.680579"
			cy="0"
			r="1"
		/>

		<g class="letters" fill="#FFFFFF" fill-rule="nonzero">
			<path
				transform="translate(77.127371 87.520197)"
				d="M77,128 L77,111.489855 L49.354217,111.489855 L49.354217,16.417391 L77,16.417391 L77,0 L0,0 L0,16.417391 L27.645783,16.417391 L27.645783,111.489855 L0,111.489855 L0,128 L77,128 Z M270.770093,128 L270.770093,17.344928 L307.779439,17.344928 L310,0 L211,0 L211,17.344928 L249.304673,17.344928 L249.304673,128 L270.770093,128 Z"
			/>
			<path
				transform="translate(562.127371 78.520197)"
				d="M77,128 L77,111.489855 L49.354217,111.489855 L49.354217,16.417391 L77,16.417391 L77,0 L0,0 L0,16.417391 L27.645783,16.417391 L27.645783,111.489855 L0,111.489855 L0,128 L77,128 Z M164.481481,130 C169.91358,130 175.12963,129.288014 180.12963,127.864042 C185.12963,126.440069 189.419753,124.582714 193,122.291976 L193,122.291976 L185.5,108.547548 C182.969136,109.909609 180.20679,111.024022 177.212963,111.890788 C174.219136,112.757553 170.932099,113.190936 167.351852,113.190936 C161.364198,113.190936 157.058642,111.906265 154.435185,109.336924 C151.811728,106.767583 150.5,102.851659 150.5,97.589153 L150.5,97.589153 L150.5,44.561664 L181.148148,44.561664 L183.462963,29.42422 L150.5,29.42422 L150.5,5 L129.759259,7.507429 L129.759259,29.42422 L108,29.42422 L108,44.561664 L129.759259,44.561664 L129.759259,97.774889 C129.759259,107.433135 132.70679,115.218549 138.601852,121.131129 C144.496914,127.04371 153.123457,130 164.481481,130 Z"
			/>
		</g>
	</g>
</svg>

<style>
	.logo {
		display: block;
		width: 100%;
		height: auto;
	}

	.port {
		fill: none;
		stroke: none;
		pointer-events: none;
	}

	/*
	 * The draw: about two seconds in all, and nothing flashes. The traces draw from their open ends
	 * (the ports) back to the pads, the pads pop, the letters fade in.
	 */
	.animate .trace {
		animation: draw 1.4s cubic-bezier(0.45, 0, 0.2, 1) backwards;
	}

	.animate .trace-green {
		animation-delay: 0.12s;
	}

	.animate .pad {
		transform-box: fill-box;
		transform-origin: center;
		animation: pop 0.4s cubic-bezier(0.3, 1.6, 0.5, 1) 1.45s backwards;
	}

	.animate .letters {
		animation: fade 0.6s ease-out 1.6s backwards;
	}

	/*
	 * In the hero the board powers the logo: the board's two lead traces run into the ports, and
	 * when they arrive (about 4 s in) the board sets data-power="on" on the socket round the logo.
	 * The logo waits, dark, until then and draws from there in 2.2 s, ending with the board's
	 * field (SOCKET_DRAW_MS in growth.ts). Should the board never come, it draws after 6 s.
	 */
	:global(html.js:not(.reduced)) .animate .trace {
		animation-delay: 6s;
	}

	:global(html.js:not(.reduced)) .animate .trace-green {
		animation-delay: 6.12s;
	}

	:global(html.js:not(.reduced)) .animate .pad {
		animation-delay: 7.45s;
	}

	:global(html.js:not(.reduced)) .animate .letters {
		animation-delay: 7.6s;
	}

	/* A new name starts the animation over, from the moment the power comes on. */
	:global(html.js:not(.reduced) [data-power='on']) .animate .trace {
		animation-name: draw-powered;
		animation-delay: 0s;
	}

	:global(html.js:not(.reduced) [data-power='on']) .animate .trace-green {
		animation-delay: 0.12s;
	}

	:global(html.js:not(.reduced) [data-power='on']) .animate .pad {
		animation-name: pop-powered;
		animation-delay: 1.45s;
	}

	:global(html.js:not(.reduced) [data-power='on']) .animate .letters {
		animation-name: fade-powered;
		animation-delay: 1.6s;
	}

	/* From the end of the line (offset -1: nothing shows yet) back to its start. */
	@keyframes draw {
		from {
			stroke-dasharray: 1;
			stroke-dashoffset: -1;
		}
		to {
			stroke-dasharray: 1;
			stroke-dashoffset: 0;
		}
	}

	@keyframes draw-powered {
		from {
			stroke-dasharray: 1;
			stroke-dashoffset: -1;
		}
		to {
			stroke-dasharray: 1;
			stroke-dashoffset: 0;
		}
	}

	@keyframes pop-powered {
		from {
			transform: scale(0);
		}
		to {
			transform: scale(1);
		}
	}

	@keyframes fade-powered {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes pop {
		from {
			transform: scale(0);
		}
		to {
			transform: scale(1);
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Reduced motion: the finished logo, from the first paint. */
	@media (prefers-reduced-motion: reduce) {
		.animate .trace,
		.animate .pad,
		.animate .letters {
			animation: none;
		}
	}

	:global(html.reduced) .animate .trace,
	:global(html.reduced) .animate .pad,
	:global(html.reduced) .animate .letters {
		animation: none;
	}
</style>
