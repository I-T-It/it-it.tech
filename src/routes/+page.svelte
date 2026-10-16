<script lang="ts">
	import PcbBoard from '#lib/components/PcbBoard.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import Hero from '#lib/sections/Hero.svelte';
	import Availability from '#lib/sections/Availability.svelte';
	import About from '#lib/sections/About.svelte';
	import Competences from '#lib/sections/Competences.svelte';
	import Experience from '#lib/sections/Experience.svelte';
	import Projects from '#lib/sections/Projects.svelte';
	import Skills from '#lib/sections/Skills.svelte';
	import Talks from '#lib/sections/Talks.svelte';
	import EducationLanguages from '#lib/sections/EducationLanguages.svelte';
	import Contact from '#lib/sections/Contact.svelte';
</script>

<!-- The title, description, canonical, social tags and structured data of the page. -->
<Seo />

<PcbBoard />

<main id="main" tabindex="-1">
	<Hero />
	<!-- The two availability chips are ordered inside, by the variant. -->
	<Availability />
	<About />
	<Competences />
	<Experience />
	<Projects />
	<Skills />
	<Talks />
	<EducationLanguages />
	<Contact />
</main>
