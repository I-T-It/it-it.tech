import {
	faDiscord,
	faGithub,
	faInstagram,
	faLinkedinIn,
	faSoundcloud,
	faStackOverflow,
	faSteam,
	faTiktok,
	faXTwitter,
	faYoutube,
	type IconDefinition
} from '@fortawesome/free-brands-svg-icons';
import type { ProfileId } from '#lib/content/profiles.js';

/** The brand icon of each profile. Named imports, so the other icons of the package stay out of the bundle. */
export const profileIcons: Record<ProfileId, IconDefinition> = {
	x: faXTwitter,
	linkedin: faLinkedinIn,
	github: faGithub,
	stackoverflow: faStackOverflow,
	soundcloud: faSoundcloud,
	discord: faDiscord,
	steam: faSteam,
	instagram: faInstagram,
	youtube: faYoutube,
	tiktok: faTiktok
};
