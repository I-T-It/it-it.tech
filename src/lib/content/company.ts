/** Facts about I.T. It that are the same in every locale and on both builds. */
export const company = {
	name: 'I.T. It',
	/** The owner and founder by his legal name. For company and legal lines, not as a display name. */
	founder: 'Robbin Schepers',
	givenName: 'Robbin',
	familyName: 'Schepers',
	/** The name he goes by online, the same as the handle without the @. */
	nickname: 'Roboroads',
	/**
	 * How he is known, the h1 on both builds and the name in the personal header: Robbin
	 * "Roboroads" Schepers, with straight quotes in every language (they read the same in Fira Code).
	 */
	displayName: 'Robbin "Roboroads" Schepers',
	city: 'Zwaag',
	linkedin: 'https://www.linkedin.com/in/roboroads',
	github: 'https://github.com/Roboroads',
	githubHandle: '@Roboroads',
	/** Chamber of Commerce number, shown in the footer. */
	kvk: '86738852',
	/** VAT number, shown in the footer. */
	btw: 'NL002333708B14'
} as const;

/**
 * The email address, base64 of the address written backwards. Never write the plain address or a
 * mail link in this file, in any source file or in any built output.
 * `decodeEmail()` in src/lib/email.ts turns it back. Only the company build may call it.
 * It sits outside `company` on purpose: a separate export is dropped from the personal bundle
 * together with the code that uses it, an object property would stay.
 */
export const emailEncoded = 'aGNldC50aS10aUBvZm5p';

/** Where the localized mail subject lives in SiteContent. Read it from there. */
export const emailSubjectKey = 'availability.freelance.emailSubject';
