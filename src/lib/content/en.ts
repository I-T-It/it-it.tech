/**
 * English content, a translation of nl.ts. Ids, dates, levels, tech tags and links are the same as
 * in the Dutch file; the content test compares them. No email address, no phone number, no HTML.
 */
import type { SiteContent } from './types.js';

export const en: SiteContent = {
	locale: 'en',

	meta: {
		company: {
			title: 'I.T. It - For everything with a plug',
			description:
				'I.T. It builds web applications and apps and helps with computer problems. Together we find the best solution. Weekday evenings from 18:00 and weekends.'
		},
		personal: {
			title: 'Robbin "Roboroads" Schepers - Professional Computer Nerd',
			description:
				'Robbin "Roboroads" Schepers is a developer with a day job. In the evenings and at weekends he builds web applications and apps with his company I.T. It.'
		}
	},

	profile: {
		name: 'Robbin "Roboroads" Schepers',
		tagline: 'Professional Computer Nerd'
	},

	hero: {
		cta: {
			job: 'Looking for a developer for your team?',
			freelance: 'Project for I.T. It'
		},
		logoAlt: 'I.T. It logo',
		photoAlt: 'Portrait of Robbin Schepers'
	},

	availability: {
		job: {
			title: 'By day: employed',
			body: [
				'By day I work from 9 to 5 as an employed developer.',
				'I am always open to a good conversation about a permanent role. My experience is further down this page, and you can print the CV.'
			],
			cta: 'Send a message on LinkedIn',
			print: 'Print my CV'
		},
		freelance: {
			title: 'Evenings and weekends: I.T. It',
			body: [
				'Alongside my job I have my own company, I.T. It. Do you have a problem or an idea that involves technology? Then we work out the best solution together. I am not tied to one language or framework and I pick what fits your situation.',
				'I do computer help mostly for older people and for others who are not used to technology. I explain it calmly, in plain language.'
			],
			hours: 'Weekday evenings from 18:00 and weekends',
			takesOn: [
				'Web applications and apps, from first idea to a running application',
				'Improving or rescuing existing software',
				'Technical advice and application architecture',
				'Computer help, such as connecting a printer or setting up email'
			],
			cta: 'Project for I.T. It',
			emailSubject: 'Project for I.T. It'
		}
	},

	about: {
		title: 'About me',
		paragraphs: [
			'I am a developer with most of my expertise in the backend. I also have experience with frontend and devops and can take on that work myself.',
			'I have been programming since I was eleven. I use that experience to take your project and my teammates a step further.',
			'I think in challenges and creative solutions, not in problems, so there is little I would not want to build.'
		]
	},

	competences: {
		title: 'What I am good at',
		items: [
			{
				id: 'multidisciplinair',
				title: 'Multidisciplinary',
				text: 'My interest in code and technology is broad, and I like learning new things. I write more than ten programming languages, so something new is rarely a problem and usually a fun challenge.'
			},
			{
				id: 'technisch-leiderschap',
				title: 'Technical leadership',
				text: 'With my broad technical knowledge I make technical decisions and carry them out, confident that they work. I can set up and finish a project on my own, to high quality standards. I also like to coach colleagues and bring them up to a higher level.'
			},
			{
				id: 'oplossingsgericht',
				title: 'Solution-oriented',
				text: 'While refining tasks I quickly see the solution to complex challenges. That also gives me a good idea of the effort needed to make such a challenge succeed.'
			},
			{
				id: 'laravel-expert',
				title: 'Laravel expert',
				text: 'I have programmed PHP since I was eleven and have used Laravel since version 5.3 (2016), together with many different front-end techniques. Nothing in the PHP world is new to me anymore. Because I know the ecosystem well, I can recommend the right tools for every job.'
			}
		]
	},

	experience: {
		title: 'Experience',
		intro: 'The newest role comes first. Open a role for the situation, the tasks and the result.',
		labels: {
			present: 'present',
			via: 'via {employer}',
			situation: 'Situation',
			tasks: 'Tasks',
			results: 'Result'
		},
		jobs: [
			{
				id: 'vws',
				title: 'Backend developer (PHP)',
				organisation: 'Ministerie van VWS',
				via: 'Sopra Steria',
				start: '2026-04',
				end: null,
				tech: [
					'Photoshop',
					'JavaScript',
					'Laravel',
					'PHP',
					'MySQL',
					'CSS',
					'SCSS',
					'HTML',
					'Linux',
					'Git',
					'Docker',
					'CI/CD'
				],
				situation: [
					'iRealisatie is part of the Information Policy directorate. It develops custom software and tools for policy departments of VWS (the Dutch Ministry of Health, Welfare and Sport) that speed up digitalisation in healthcare. The team builds software, web applications and mobile apps, from design to maintenance, with privacy and security as the starting point.',
					'iRealisatie also explores new solutions through pilots and proofs of concept, and modernises outdated information systems. It also gives technical advice on digitalisation questions.',
					'Project iCore maintains and extends components that several projects within iRealisatie use.'
				],
				tasks: [
					'Extending the ZaakVolgSysteem (ZVS, PHP/Laravel), the system that tracks all Woo requests (freedom of information requests) and complaints. This gives lawyers better insight into cases, so fewer deadlines lapse and fewer penalty payments have to be made.',
					'Migrating the Excel sheets to ZVS',
					'Extending and improving the Termijnen Engine v2 and fixing bugs in it'
				],
				results: [{ text: 'ZaakVolgSysteem is an internal system with no public link.' }]
			},
			{
				id: 'ocw',
				title: 'Front-end developer (Vue / TS)',
				organisation: 'Ministerie van Onderwijs, Cultuur en Wetenschap',
				start: '2025-03',
				end: null,
				tech: [
					'Photoshop',
					'TypeScript',
					'JavaScript',
					'Vue.js',
					'CSS',
					'SCSS',
					'HTML',
					'Git',
					'Node.js',
					'Docker',
					'CI/CD',
					'Agile'
				],
				situation: [
					'Leeroverzicht.nl is a website that helps the Dutch workforce with upskilling and retraining.'
				],
				tasks: ['Building, maintaining and renewing the front-end in Vue.js and TypeScript'],
				results: [{ text: 'Leeroverzicht.nl', url: 'https://leeroverzicht.nl/' }]
			},
			{
				id: 'cz-chatbot',
				title: 'Backend developer (Azure Functions / C# .NET)',
				organisation: 'CZ',
				via: 'Ordina',
				start: '2024-03',
				end: '2024-06',
				tech: ['C#', '.NET', 'Azure Functions'],
				situation: [
					'The CZ service app team split off a chatbot team, which is building a chatbot for the app with an LLM behind it. I joined that team temporarily to ease the pressure on the backlog.'
				],
				tasks: [
					'Building API endpoints for the chatbot in C# (.NET)',
					"Moving the chatbot's Azure Functions to their own repository and resource group"
				],
				results: [{ text: 'The chatbot in the CZ app' }]
			},
			{
				id: 'cfk',
				title: 'Lead developer',
				organisation: 'Contractspelersfonds KNVB (CFK)',
				start: '2023-03',
				end: '2024-01',
				tech: [
					'Photoshop',
					'JavaScript',
					'Laravel',
					'PHP',
					'MySQL',
					'CSS',
					'SCSS',
					'HTML',
					'Linux',
					'Git',
					'Docker',
					'SSH',
					'CI/CD',
					'Azure Pipelines',
					'Tailwind CSS'
				],
				situation: [
					"CFK uses an old, custom-built application to keep track of the participants' funds. The system is outdated and ready for something new. We wanted a copy with a few new quality-of-life features here and there that make the work more efficient, but web-based instead of a Windows application."
				],
				tasks: [
					'Developing the new application',
					'Migrating the data from the old application to the new one',
					'Setting up the project in Microsoft Azure (DevOps)',
					'Coaching teammates',
					'Handling the planning (Kanban/Scrum) and the related meetings'
				],
				results: [{ text: 'The new CFK web application (not accessible from outside)' }]
			},
			{
				id: 'puur-emmen',
				title: 'Fullstack developer (PHP/Laravel, TS/Svelte, Electron)',
				organisation: 'Restaurant Puur Emmen',
				start: '2021-11',
				end: '2023-10',
				tech: [
					'TypeScript',
					'JavaScript',
					'Svelte',
					'Laravel',
					'PHP',
					'MySQL',
					'CSS',
					'SCSS',
					'HTML',
					'Linux',
					'Git',
					'Node.js',
					'Docker',
					'SSH',
					'CI/CD',
					'Tailwind CSS',
					'WebSocket',
					'GraphQL'
				],
				situation: [
					"Restaurant Puur had an old till system that crashed a lot. They asked me to build a new one. A SaaS product was not an option because of the restaurant's unique situation."
				],
				tasks: [
					'Setting up the POS software in Electron with TypeScript and Svelte',
					'Building a central API in PHP/Laravel with GraphQL, so the POS systems store their data centrally (in MySQL) and exchange it',
					'Setting up a websocket that keeps all POS systems in sync',
					'Building a reservation module for the website in TypeScript and Svelte'
				],
				results: [
					{
						text: 'Project Panda: the new till system for the unique situation of Restaurant Puur'
					}
				]
			},
			{
				id: 'cz-flutter',
				title: 'Flutter developer',
				organisation: 'CZ',
				start: '2021-05',
				end: '2022-10',
				tech: ['Photoshop', 'Flutter', 'Git', 'Dart'],
				situation: [
					'CZ had an app in OutSystems. Because OutSystems could not do what CZ wanted, CZ decided to rewrite the app in Flutter and build on that.'
				],
				tasks: [
					'Rewriting the full CZ Zorg app in Flutter',
					'Maintaining and keeping the software up to date',
					'Adding the Zorgverbruik feature',
					'Adding the Zorgantwoord feature'
				],
				results: [
					{
						text: 'CZ app on the App Store',
						url: 'https://itunes.apple.com/nl/app/cz-declareren/id937667763?l=en&mt=8'
					},
					{
						text: 'CZ app on Google Play',
						url: 'https://play.google.com/store/apps/details?id=nl.cz.app'
					}
				]
			},
			{
				id: 'open-source',
				title: 'Open-source developer',
				organisation: 'Various FOSS projects',
				start: '2020-08',
				end: null,
				tech: [
					'Ansible',
					'TypeScript',
					'JavaScript',
					'Vue.js',
					'Svelte',
					'Laravel',
					'PHP',
					'Flutter',
					'MySQL',
					'CSS',
					'SCSS',
					'HTML',
					'Linux',
					'Git',
					'Python',
					'Node.js',
					'Dart',
					'Docker',
					'Java',
					'SSH',
					'Kotlin',
					'Tailwind CSS'
				],
				situation: [
					'I use many open-source frameworks, libraries and tools in my daily work. In 2020 I decided it was time to give something back to the community. Since then I have helped fix problems in several projects and started a few of my own.'
				],
				tasks: ['Starting and maintaining several open-source projects'],
				results: [
					{
						text: 'Laravel Tinker plugin for PhpStorm, with about 102,000 active users',
						url: 'https://plugins.jetbrains.com/plugin/14957-laravel-tinker'
					},
					{
						text: 'Source code of the Laravel Tinker plugin on GitHub',
						url: 'https://github.com/Roboroads/laravel-tinker'
					},
					{ text: 'Graphton', url: 'https://github.com/GraphtonLib/Graphton' },
					{
						text: 'The Frontend Festival website on GitHub',
						url: 'https://github.com/Ordina-Group/frontendfestival.nl'
					},
					{
						text: 'Various other small projects on GitHub',
						url: 'https://github.com/Roboroads'
					}
				]
			},
			{
				id: 'instore-media',
				title: 'Fullstack developer',
				organisation: 'Instore-Media',
				start: '2020-02',
				end: '2023-10',
				tech: [
					'Ansible',
					'Apache',
					'TypeScript',
					'JavaScript',
					'Vue.js',
					'Svelte',
					'Laravel',
					'PHP',
					'MySQL',
					'SCSS',
					'HTML',
					'Linux',
					'Git',
					'Node.js',
					'Docker',
					'SSH'
				],
				situation: [
					'An on-premise IoT device with a screen that plays radio streams, with a back office to control it through the website.'
				],
				tasks: [
					'Building and maintaining the back-end panel for creating and managing customers and devices',
					'Building and maintaining the connection server between the devices and the back end',
					'Building and maintaining the software on the devices that plays the radio',
					'Building and maintaining the radio stream server'
				],
				results: [
					{
						text: 'At the time of writing, the device plays radio in all Van Uffelen stores and at Skyview, the Ferris wheel on the Scheveningen pier'
					}
				]
			},
			{
				id: 'sublime-fm',
				title: 'Fullstack developer',
				organisation: 'Sublime FM',
				start: '2019-09',
				end: '2022-05',
				tech: ['JavaScript', 'Vue.js', 'Laravel', 'PHP', 'MySQL', 'CSS', 'SCSS', 'Git'],
				situation: [
					'Sublime FM is a national radio station. Every four months it makes a chart, such as the Summertime 500, the Sublime Top 1000 and the Soul500. It also hosts the Sublime Awards and runs chart quizzes.'
				],
				tasks: [
					'Designing, building and continuously changing the chart system, the voting system for the awards and the system for quiz answers'
				],
				results: [
					{ text: 'sublimetop1000.nl', url: 'https://sublimetop1000.nl' },
					{ text: 'soultop1000.nl', url: 'https://soultop1000.nl' },
					{ text: 'summertimetop500.nl', url: 'https://summertimetop500.nl' }
				]
			},
			{
				id: 'social-blue',
				title: 'Backend developer',
				organisation: 'Social Blue / Leads.io',
				start: '2017-02',
				end: '2021-04',
				tech: [
					'Photoshop',
					'Ansible',
					'JavaScript',
					'Vue.js',
					'Laravel',
					'PHP',
					'MySQL',
					'CSS',
					'SCSS',
					'HTML',
					'C++',
					'Linux',
					'Git',
					'Elasticsearch',
					'Node.js',
					'Kubernetes',
					'Docker',
					'SSH'
				],
				situation: [
					'Social Blue / Leads.io specialises in generating leads for clients through various digital channels.'
				],
				tasks: ['The system that stores, secures, delivers and deletes sensitive lead data'],
				results: []
			},
			{
				id: 'smitties',
				title: 'Fullstack developer',
				organisation: 'Smitties.eu',
				via: 'De-Smitten',
				start: '2016-06',
				end: '2016-09',
				tech: ['JavaScript', 'Vue.js', 'Laravel', 'PHP', 'MySQL', 'HTML', 'Git'],
				situation: [
					"Smitties was a series of children's books without words. Smitties.eu was the website of the series."
				],
				tasks: ['Building and maintaining the Smitties website'],
				results: [{ text: 'A custom website with information and a web shop' }]
			},
			{
				id: 'vhu-europe',
				title: 'Fullstack developer',
				organisation: 'VHU Europe',
				start: '2016-05',
				end: '2016-09',
				tech: ['PHP'],
				situation: [
					'PURE Jingles, a brand of VHU Europe, makes radio formats and jingles for well-known radio stations in Europe.'
				],
				tasks: ['Building several WordPress plugins for the new website'],
				results: [
					{
						text: 'This website has since been replaced by a new one, so the result is no longer online'
					}
				]
			},
			{
				id: 'truman-scout',
				title: 'Software engineer (Laravel / Silex / PHP, Vue / JS)',
				organisation: 'Truman Scout BV',
				start: '2014-03',
				end: '2017-01',
				tech: [
					'Apache',
					'JavaScript',
					'Vue.js',
					'Laravel',
					'PHP',
					'MySQL',
					'CSS',
					'HTML',
					'Git',
					'Node.js',
					'Cordova'
				],
				situation: [
					'Truman Scout is (was?) the maker of software that let passers-by give their opinion with buttons on kiosks with tablets. We also did more in-store activation with various proofs of concept.'
				],
				tasks: [
					'Building hybrid apps for iPads with Cordova/PhoneGap and Vue.js',
					'Building web apps and dashboards to report data to clients, with Laravel/PHP and a Vue.js front-end'
				],
				results: [{ text: 'Various custom software for various clients' }]
			},
			{
				id: 'amwittools',
				title: 'All-round IT specialist',
				organisation: 'Amwittools',
				start: '2013-06',
				end: '2014-03',
				tech: [],
				situation: [
					'Amwittools, the company where my father worked at the time, was looking for someone who knew about computers.'
				],
				tasks: [
					'Maintaining the (old) website',
					'Maintaining workstations',
					'Taking care of backups'
				],
				results: [{ text: 'General IT matters improved' }]
			},
			{
				id: 'gh-radio',
				title: 'Owner',
				organisation: 'GH Radio',
				start: '2011-05',
				end: '2016-04',
				tech: ['JavaScript', 'PHP', 'MySQL', 'CSS', 'SCSS', 'HTML', 'Git', 'Node.js', 'SSH'],
				situation: [
					'I was owner and manager of the online non-profit radio station GH Radio for more than five years. Together with about 90 volunteer young people I ran the radio for 100 to 200 young people between the ages of 12 and 22 every day.'
				],
				tasks: [
					'Making sure the teams kept running on their own',
					'Building and maintaining the website (I did this myself)'
				],
				results: []
			}
		]
	},

	skills: {
		title: 'Skills',
		intro: 'Levels run from 1 to 5, with the years of experience next to each.',
		labels: {
			level: 'level {level} of {max}',
			years: '{years} years',
			yearsOne: '{years} year'
		},
		groups: [
			{
				id: 'languages',
				title: 'Programming languages',
				skills: [
					{ id: 'php', title: 'PHP', level: 5, years: 15 },
					{ id: 'javascript', title: 'JavaScript', level: 5, years: 10 },
					{ id: 'html', title: 'HTML', level: 4, years: 14 },
					{ id: 'css', title: 'CSS', level: 4, years: 14 },
					{ id: 'scss', title: 'SCSS', level: 4, years: 5 },
					{ id: 'typescript', title: 'TypeScript', level: 4, years: 2 },
					{ id: 'dart', title: 'Dart', level: 4, years: 1 },
					{ id: 'python', title: 'Python', level: 3, years: 3 },
					{ id: 'java', title: 'Java', level: 3, years: 3 },
					{ id: 'kotlin', title: 'Kotlin', level: 3, years: 1 },
					{ id: 'c', title: 'C', level: 2, years: 2 },
					{ id: 'cpp', title: 'C++', level: 2, years: 2 },
					{ id: 'csharp', title: 'C#', level: 2, years: 2 },
					{ id: 'cobol', title: 'COBOL', level: 1, years: 1 }
				]
			},
			{
				id: 'frameworks',
				title: 'Frameworks',
				skills: [
					{ id: 'laravel', title: 'Laravel', level: 5, years: 12 },
					{ id: 'vue', title: 'Vue.js', level: 5, years: 5 },
					{ id: 'svelte', title: 'Svelte', level: 5, years: 3 },
					{ id: 'nodejs', title: 'Node.js', level: 4, years: 8 },
					{ id: 'tailwind', title: 'Tailwind CSS', level: 4, years: 5 },
					{ id: 'flutter', title: 'Flutter', level: 4, years: 1 },
					{ id: 'cordova', title: 'Cordova', level: 3, years: 3 },
					{ id: 'android', title: 'Android development', level: 3, years: 2 },
					{ id: 'angular', title: 'Angular', level: 1, years: 1 }
				]
			},
			{
				id: 'tools',
				title: 'Tools and infrastructure',
				skills: [
					{ id: 'mysql', title: 'MySQL', level: 4, years: 14 },
					{ id: 'linux', title: 'Linux', level: 4, years: 10 },
					{ id: 'git', title: 'Git', level: 4, years: 8 },
					{ id: 'ssh', title: 'SSH', level: 4, years: 8 },
					{ id: 'ci-cd', title: 'CI/CD', level: 4, years: 5 },
					{ id: 'photoshop', title: 'Photoshop', level: 4, years: 5 },
					{ id: 'apache', title: 'Apache', level: 3, years: 10 },
					{ id: 'docker', title: 'Docker', level: 3, years: 5 },
					{ id: 'kubernetes', title: 'Kubernetes', level: 3, years: 5 },
					{ id: 'websocket', title: 'WebSocket', level: 3, years: 5 },
					{ id: 'ansible', title: 'Ansible', level: 3, years: 4 },
					{ id: 'graphql', title: 'GraphQL', level: 3, years: 1 },
					{ id: 'azure-pipelines', title: 'Azure Pipelines', level: 3, years: 1 },
					{ id: 'elasticsearch', title: 'Elasticsearch', level: 2, years: 2 }
				]
			},
			{
				id: 'practices',
				title: 'Ways of working',
				skills: [
					{ id: 'programming', title: 'Programming', level: 5, years: 15 },
					{ id: 'software-development', title: 'Software development', level: 5, years: 12 },
					{ id: 'app-development', title: 'Application development', level: 5, years: 8 },
					{ id: 'test-automation', title: 'Test automation', level: 5, years: 8 },
					{ id: 'agile', title: 'Agile', level: 4, years: 10 },
					{ id: 'scrum', title: 'Scrum', level: 4, years: 5 },
					{ id: 'architecture', title: 'Application architecture', level: 4, years: 5 },
					{ id: 'coaching', title: 'Coaching', level: 3, years: 5 },
					{ id: 'devops', title: 'DevOps', level: 3, years: 5 },
					{ id: 'sysadmin', title: 'System administration', level: 3, years: 5 },
					{ id: 'technical-design', title: 'Technical designer', level: 3, years: 3 },
					{ id: 'open-source', title: 'Open source', level: 3, years: 3 }
				]
			}
		]
	},

	talks: {
		title: 'Talks and workshops',
		intro: 'Talks, workshops and trainings on Flutter, Svelte, front-end and PHP, newest first.',
		talks: [
			{
				id: 'php-2005-called',
				date: '2024-06-21',
				title: '2005 Called! They Want Your Opinion About PHP Back!'
			},
			{
				id: 'frontend-js-eindhoven',
				date: '2023-08-23',
				title: 'Falling in Love with Front-end all over again (talk at JS Meetup Eindhoven)',
				url: 'https://www.meetup.com/nl-NL/js-eindhoven/events/291205657/'
			},
			{
				id: 'frontend-festival',
				date: '2023-04-13',
				title: 'Falling in Love with Front-end all over again (talk at Frontend Festival)',
				url: 'https://frontendfestival.nl'
			},
			{
				id: 'flutter-ordina-noord',
				date: '2022-10-27',
				title: 'Flutter workshop at Ordina Noord'
			},
			{
				id: 'flutter-frontmania',
				date: '2022-10-05',
				title: 'Flutter talk at FrontMania',
				url: 'https://frontmania.com/'
			},
			{
				id: 'services-join-belgie',
				date: '2022-10-04',
				title: 'Talk "Services down to your pocket" with Remi Appels at JOIN Belgium',
				url: 'https://join.ordina-jworks.io/'
			},
			{
				id: 'flutter-ordina-belgie',
				date: '2022-09-19',
				title: 'Flutter training at Ordina Belgium'
			},
			{
				id: 'flutter-code-comedy',
				date: '2022-06-16',
				title: 'Flutter workshop at Code&Comedy'
			},
			{
				id: 'svelte-nieuwegein',
				date: '2022-04-13',
				title: 'Svelte talk at FrontEnd Meetup Nieuwegein'
			}
		]
	},

	educationLanguages: {
		title: 'Education and languages',
		labels: { education: 'Education', languages: 'Languages' },
		education: [
			{
				id: 'ngt-course',
				title: 'Dutch Sign Language course',
				institution: 'TYD',
				year: 2023
			}
		],
		languages: [
			{ id: 'nl', title: 'Dutch', level: 5 },
			{ id: 'en', title: 'English', level: 5 },
			{ id: 'ngt', title: 'Dutch Sign Language (NGT)', level: 2 }
		]
	},

	contact: {
		title: 'Contact',
		intro: 'A job or a project? Send me a message.',
		labels: {
			email: 'Email',
			linkedin: 'LinkedIn',
			github: 'GitHub',
			company: 'Go to I.T. It'
		}
	}
};
