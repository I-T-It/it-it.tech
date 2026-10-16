import type { CareerPath } from './site.js';

/** The id of every section on the page: the anchor of its menu entry and the id of its chip. */
export type SectionId =
	| 'hero'
	| CareerPath
	| 'about'
	| 'competences'
	| 'experience'
	| 'projects'
	| 'skills'
	| 'talks'
	| 'education'
	| 'contact';

/**
 * Every section of the page, in the order they appear in the DOM. The two availability chips swap
 * places with the variant (`availabilityOrder` in site.ts). The menu lists exactly these, so a
 * section added to the page gets an entry here, in its messages, and in the header.
 */
export function sectionIds(availabilityOrder: readonly CareerPath[]): SectionId[] {
	return [
		'hero',
		...availabilityOrder,
		'about',
		'competences',
		'experience',
		'projects',
		'skills',
		'talks',
		'education',
		'contact'
	];
}
