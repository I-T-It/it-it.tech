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

/** One role in U5. Ongoing roles have `end: null` and show "heden" / "present". */
export interface Job {
	id: string;
	/** Function title. */
	title: string;
	organisation: string;
	/** Intermediary, shown as "via {via}" when it differs from the organisation. */
	via?: string;
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
		situation: string;
		tasks: string;
		results: string;
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

/** A talk or workshop that is ready to give: one entry of the catalogue in U7. */
export interface TalkOffer {
	id: string;
	kind: 'talk' | 'workshop';
	/**
	 * Title of the talk. An English title stays as it is in both locales (`titleLang: 'en'`); a
	 * Dutch title is translated for the English page.
	 */
	title: string;
	/** Two sentences at most, in the language of the page. */
	summary: string;
	/** Free text, e.g. "45 minuten". Left out until it is known. */
	duration?: string;
	/** Free text, e.g. "Developers". Left out until it is known. */
	audience?: string;
	/**
	 * The languages the talk can be given in, at least one. Kept as data: the page says it once
	 * for every offer in `labels.offersNote`, and a card shows no language of its own. Not the
	 * language of the title.
	 */
	langs: Locale[];
	/**
	 * The language of the title as it was written. The Dutch page marks an English title
	 * `lang="en"`, so a screen reader switches voice (WCAG 3.1.2). A talk can be given in Dutch
	 * under an English title.
	 */
	titleLang: Locale;
}

/** One time a talk or workshop was given: one entry of the history in U7. */
export interface TalkGiven {
	id: string;
	/** The offer this was an occurrence of. Without one, `title` says what it was. */
	offerId?: string;
	/** A day ("2023-03-14") or a month ("2023-03"). */
	date: YearMonth;
	/**
	 * The language it was given in this time. Shown next to the event. Left out where it is not
	 * known: it is never guessed from the offer.
	 */
	lang?: Locale;
	/** Where it was given: a meetup, a conference or a company. Left out where it is not known. */
	event?: string;
	/**
	 * What this occurrence was called, when that differs from the offer (a training that was an
	 * occurrence of the workshop, a demo in the talk of someone else). Written in the language of
	 * the page: an English title belongs on the offer, with `lang: 'en'`. It holds "{talk}" where
	 * `talk` goes.
	 */
	title?: string;
	/**
	 * The talk of someone else that this was a part of, quoted in `title` at "{talk}". It keeps its
	 * own title in both locales, and `lang` is the language of that title, so the page can mark it.
	 */
	talk?: { title: string; lang: Locale };
	/** Page of the event. A link is shown only when this exists. */
	url?: string;
}

export interface Talks extends SectionHead {
	/** The catalogue: what is ready to give. */
	offers: TalkOffer[];
	/** The history: newest first. */
	given: TalkGiven[];
	labels: {
		/** h3 of the catalogue, e.g. "Klaar om te geven". */
		offers: string;
		/** One short note under the heading of the catalogue, for all offers: languages and slides. */
		offersNote: string;
		/** h3 of the history, e.g. "Gegeven". */
		given: string;
		kind: Record<TalkOffer['kind'], string>;
		/** The name of a language, for the `lang` of an offer. */
		language: Record<Locale, string>;
		/** Labels of the facts on a card. The languages are not one: the note says them. */
		facts: { duration: string; audience: string };
		times: {
			/** Contains "{last}", the date of the one time it was given. */
			one: string;
			/** Contains "{count}" and "{last}", the date of the most recent time. */
			many: string;
		};
	};
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
	skills: Skills;
	talks: Talks;
	educationLanguages: EducationLanguages;
	contact: Contact;
}
