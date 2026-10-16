import { describe, expect, it } from 'vitest';
import { company } from './company.js';
import { PROFILE_TODO, profiles, visibleProfiles } from './profiles.js';

// Built from parts: the mail scheme is never written out (see CLAUDE.md).
const scheme = ['mail', 'to'].join('') + ':';

describe('online profiles', () => {
	it('lists the ten services, in the order of the hero row', () => {
		expect(profiles.map((p) => p.id)).toEqual([
			'x',
			'linkedin',
			'github',
			'stackoverflow',
			'soundcloud',
			'discord',
			'steam',
			'instagram',
			'youtube',
			'tiktok'
		]);
	});

	it('names each service the way its own brand writes it', () => {
		expect(profiles.map((p) => p.name)).toEqual([
			'X',
			'LinkedIn',
			'GitHub',
			'Stack Overflow',
			'SoundCloud',
			'Discord',
			'Steam',
			'Instagram',
			'YouTube',
			'TikTok'
		]);
	});

	it('has unique ids and unique names', () => {
		expect(new Set(profiles.map((p) => p.id)).size).toBe(profiles.length);
		expect(new Set(profiles.map((p) => p.name)).size).toBe(profiles.length);
	});

	it('links to the profile of the handle on each service', () => {
		const url = (id: string) => profiles.find((p) => p.id === id)?.url;
		expect(url('x')).toBe('https://x.com/roboroads');
		expect(url('soundcloud')).toBe('https://soundcloud.com/roboroads');
		expect(url('steam')).toBe('https://steamcommunity.com/id/roboroads');
		expect(url('instagram')).toBe('https://www.instagram.com/roboroads');
		expect(url('youtube')).toBe('https://www.youtube.com/@roboroads');
		expect(url('tiktok')).toBe('https://www.tiktok.com/@roboroads');
	});

	it('takes LinkedIn and GitHub from the company facts, so there is one address for each', () => {
		const url = (id: string) => profiles.find((p) => p.id === id)?.url;
		expect(url('linkedin')).toBe(company.linkedin);
		expect(url('github')).toBe(company.github);
	});

	it('links to Stack Overflow and Discord by the ids of his accounts', () => {
		const url = (id: string) => profiles.find((p) => p.id === id)?.url;
		expect(url('stackoverflow')).toBe('https://stackoverflow.com/users/1489183/roboroads');
		expect(url('discord')).toBe('https://discord.com/users/198900559858761728');
	});

	it('has no address left on TODO, so every icon shows', () => {
		expect(profiles.filter((p) => p.url === PROFILE_TODO)).toEqual([]);
		expect(visibleProfiles().map((p) => p.id)).toEqual(profiles.map((p) => p.id));
	});

	it('uses https for every address and has no email in it', () => {
		for (const profile of profiles) {
			expect(profile.url, profile.id).toMatch(/^https:\/\//);
			expect(profile.url, profile.id).not.toContain(scheme);
			expect(profile.url, profile.id).not.toContain('@it-it');
		}
	});

	it('hides an icon whose address is TODO and keeps the order of the rest', () => {
		const waiting = profiles.map((p) =>
			p.id === 'discord' || p.id === 'stackoverflow' ? { ...p, url: PROFILE_TODO } : p
		);
		expect(visibleProfiles(waiting).map((p) => p.id)).toEqual([
			'x',
			'linkedin',
			'github',
			'soundcloud',
			'steam',
			'instagram',
			'youtube',
			'tiktok'
		]);
	});

	it('shows an icon as soon as its TODO is replaced by an address', () => {
		const waiting = profiles.map((p) => (p.id === 'discord' ? { ...p, url: PROFILE_TODO } : p));
		expect(visibleProfiles(waiting).map((p) => p.id)).not.toContain('discord');
		const filled = waiting.map((p) =>
			p.id === 'discord' ? { ...p, url: 'https://discord.com/users/1' } : p
		);
		expect(visibleProfiles(filled).map((p) => p.id)).toContain('discord');
	});
});
