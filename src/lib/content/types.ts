/**
 * Content contract. S2 fills `nl.ts` and `en.ts` with a `SiteContent` each, S6 and S7 render it.
 * Copy lives in these files and in messages/*.json, never in components.
 * Fields that hold running text are arrays of paragraphs or list items, never HTML.
 */
import type { Site } from '../site.js';

export type Locale = 'nl' | 'en';

/** Year and month, "2023-03". Talks may carry a day, "2023-03-14". */
export type YearMonth = string;

/** Title and description for the <title> and meta description of one variant. */
export interface PageMeta {
	title: string;
	description: string;
}

/** Heading and optional intro shared by every section. */
export interface SectionHead {
	title: string;
	intro?: string;
}

export interface Profile {
	/** "Robbin Schepers", the h1 on both builds. */
	name: string;
	/** "Professional Computer Nerd", English in both locales. */
	tagline: string;
}

export interface Hero {
	/** One lead line per variant, shown under the tagline. */
	lead: { company: string; personal: string };
	/** CTA labels. The variant decides which one is filled. */
	cta: { job: string; freelance: string };
	logoAlt: string;
	photoAlt: string;
}

/** The U1 chip (job path). */
export interface JobAvailability extends SectionHead {
	/** Paragraphs. Says he works a 9-5 job and is open to new roles, in the soft wording. */
	body: string[];
	/** LinkedIn button label. */
	cta: string;
	/** Label of the "print my CV" button. */
	print: string;
}

/** The U2 chip (freelance path). */
export interface FreelanceAvailability extends SectionHead {
	body: string[];
	/** Freelance hours, e.g. weekday evenings from 18:00 and weekends. */
	hours: string;
	/** What I.T. It takes on, one item per line. */
	takesOn: string[];
	/** Label of the CTA: the protected email on company, the link to I.T. It on personal. */
	cta: string;
	/** Subject of the mail, e.g. "Project voor I.T. It". Not a secret; the address is. */
	emailSubject: string;
}

export interface Availability {
	job: JobAvailability;
	freelance: FreelanceAvailability;
}

/** U3. */
export interface About extends SectionHead {
	paragraphs: string[];
}

/** One of the four competences in U4. */
export interface Competence {
	id: string;
	title: string;
	text: string;
}

/** A line under "Resultaat" of a job. Only public results carry a url. */
export interface JobResult {
	text: string;
	url?: string;
}

/**
 * Where the work came from: `itit` is Robbin's own company (freelance), `sopra-steria` is the
 * consultancy he works for. A role without a source is direct employment and shows no "via".
 */
export type JobSource = 'itit' | 'sopra-steria';

/** One role in U5. Ongoing roles have `end: null` and show "heden" / "present". */
export interface Job {
	id: string;
	/** Function title. */
	title: string;
	/** The client or employer the work was for. */
	organisation: string;
	/** Shown as "via {source}" with the name from `experience.labels.sources`. */
	source?: JobSource;
	start: YearMonth;
	end: YearMonth | null;
	tech: string[];
	situation: string[];
	tasks: string[];
	results: JobResult[];
}

export interface Experience extends SectionHead {
	/** Newest start first. */
	jobs: Job[];
	labels: {
		present: string;
		/** Contains "{employer}", e.g. "via {employer}". */
		via: string;
		/** The name that fills "{employer}" for each source, e.g. "I.T. It (freelance)". */
		sources: Record<JobSource, string>;
		situation: string;
		tasks: string;
		results: string;
	};
}

/** Where a project stands. `live` is out, `soon` is about to be, `wip` is being built, `past` is over. */
export type ProjectStatus = 'live' | 'soon' | 'wip' | 'past';

/** A public link of a project. The label names what the link leads to, e.g. "Source on GitHub". */
export interface ProjectLink {
	label: string;
	url: string;
}

/** One entry in U10: a project of his own, open source or personal, apart from any client. */
export interface Project {
	id: string;
	title: string;
	status: ProjectStatus;
	/** Paragraphs. */
	description: string[];
	tech: string[];
	/** Empty when nothing about the project is public. */
	links: ProjectLink[];
}

export interface Projects extends SectionHead {
	projects: Project[];
	labels: {
		/** The visible word for each status. */
		status: Record<ProjectStatus, string>;
	};
}

/** Level 1 to 5. The lit LED count in U6 equals the level. */
export interface Skill {
	id: string;
	title: string;
	level: 1 | 2 | 3 | 4 | 5;
	years: number;
}

export interface SkillGroup {
	id: 'languages' | 'frameworks' | 'tools' | 'practices';
	title: string;
	skills: Skill[];
}

export interface Skills extends SectionHead {
	groups: SkillGroup[];
	labels: {
		/** Contains "{level}" and "{max}", e.g. "niveau {level} van {max}". */
		level: string;
		/** Contains "{years}", e.g. "{years} years". */
		years: string;
		/** Same with the singular, used when the skill has 1 year, e.g. "{years} year". */
		yearsOne: string;
	};
}

/** One entry in U7. A link is shown only when `url` exists. */
export interface Talk {
	id: string;
	date: YearMonth;
	title: string;
	url?: string;
}

export interface Talks extends SectionHead {
	/** Newest first. */
	talks: Talk[];
}

export interface Education {
	id: string;
	title: string;
	institution: string;
	year: number;
}

export interface SpokenLanguage {
	id: string;
	title: string;
	/** 1 to 5. */
	level: 1 | 2 | 3 | 4 | 5;
	/** Free text next to the level, e.g. "basis". */
	note?: string;
}

/** U8. */
export interface EducationLanguages extends SectionHead {
	education: Education[];
	languages: SpokenLanguage[];
	labels: { education: string; languages: string };
}

/** U9. The addresses and links themselves live in company.ts; these are the labels. */
export interface Contact extends SectionHead {
	labels: {
		/** Company build only. */
		email: string;
		linkedin: string;
		github: string;
		/** Personal build: the link to I.T. It, e.g. "Naar I.T. It". */
		company: string;
	};
}

export interface SiteContent {
	locale: Locale;
	meta: Record<Site, PageMeta>;
	profile: Profile;
	hero: Hero;
	availability: Availability;
	about: About;
	competences: SectionHead & { items: Competence[] };
	experience: Experience;
	projects: Projects;
	skills: Skills;
	talks: Talks;
	educationLanguages: EducationLanguages;
	contact: Contact;
}
