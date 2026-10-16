import { company } from './company.js';

/** An address that is not known yet. The hero row hides the icon until it is replaced. */
export const PROFILE_TODO = 'TODO';

export type ProfileId =
	| 'x'
	| 'linkedin'
	| 'github'
	| 'stackoverflow'
	| 'soundcloud'
	| 'discord'
	| 'steam'
	| 'instagram'
	| 'youtube'
	| 'tiktok';

export interface OnlineProfile {
	id: ProfileId;
	/** The service as its own brand writes it. The same in every language, so not in the locale files. */
	name: string;
	/** The profile address, or `PROFILE_TODO`. */
	url: string;
}

/**
 * Where to follow Robbin online, under one handle (@Roboroads). One list for both builds and both
 * languages, in the order of the icons in the hero. LinkedIn and GitHub come from the company
 * facts, so each address lives in one place. No email address here: that is company build only.
 */
export const profiles: readonly OnlineProfile[] = [
	{ id: 'x', name: 'X', url: 'https://x.com/roboroads' },
	{ id: 'linkedin', name: 'LinkedIn', url: company.linkedin },
	{ id: 'github', name: 'GitHub', url: company.github },
	{
		id: 'stackoverflow',
		name: 'Stack Overflow',
		url: 'https://stackoverflow.com/users/1489183/roboroads'
	},
	{ id: 'soundcloud', name: 'SoundCloud', url: 'https://soundcloud.com/roboroads' },
	{ id: 'discord', name: 'Discord', url: 'https://discord.com/users/198900559858761728' },
	{ id: 'steam', name: 'Steam', url: 'https://steamcommunity.com/id/roboroads' },
	{ id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com/roboroads' },
	{ id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/@roboroads' },
	{ id: 'tiktok', name: 'TikTok', url: 'https://www.tiktok.com/@roboroads' }
];

/** The profiles to show: those whose address is known, in the same order. */
export function visibleProfiles(list: readonly OnlineProfile[] = profiles): OnlineProfile[] {
	return list.filter((profile) => profile.url !== PROFILE_TODO);
}
