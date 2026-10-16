<script lang="ts">
	/*
	 * A brand icon as inline SVG: the path data of Font Awesome Free (brand icons, CC BY 4.0,
	 * https://fontawesome.com/license/free), imported one icon at a time so only the ones used end up
	 * in the bundle. No icon font, no stylesheet, no request to a CDN.
	 */
	import type { IconDefinition } from '@fortawesome/free-brands-svg-icons';

	interface Props {
		icon: IconDefinition;
		class?: string;
	}

	let { icon, class: className }: Props = $props();

	const width = $derived(icon.icon[0]);
	const height = $derived(icon.icon[1]);
	// Free brand icons have one path; a duotone icon would have two.
	const paths = $derived([icon.icon[4]].flat());
</script>

<!-- Decoration: the link around it carries the name. -->
<svg
	class={['icon', className]}
	viewBox="0 0 {width} {height}"
	aria-hidden="true"
	focusable="false"
>
	{#each paths as d (d)}
		<path {d} />
	{/each}
</svg>

<style>
	/* One em high, as wide as its own proportions say, in the colour of the text around it. */
	.icon {
		display: block;
		width: auto;
		height: 1em;
		fill: currentColor;
	}
</style>
