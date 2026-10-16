<script lang="ts">
	import OgCard from '#lib/components/OgCard.svelte';
</script>

<!--
	The preview card of this build and language, 1200 by 630. It is prerendered at /og/ and /en/og/,
	screenshotted by scripts/og-images.mjs into og/nl.png and og/en.png and then removed from the
	output, so on the live site these addresses answer 404. Nothing links here. The dev server
	serves it too: http://localhost:5173/og/.
-->
<OgCard />
