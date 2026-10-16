<script lang="ts">
	import NotFound from '#lib/components/NotFound.svelte';
</script>

<!--
	Prerendered once and moved to 404.html by scripts/build-variant.mjs (see scripts/not-found.mjs),
	which is what GitHub Pages serves, with status 404, for every address the site does not have.
	The folder this route is built in is removed again, so /not-found/ itself answers 404.
-->
<NotFound />
