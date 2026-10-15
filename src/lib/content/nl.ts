/**
 * Dutch content, the source text. Converted once from the CV export and kept by hand from here on.
 * No email address, no phone number, no HTML. English follows in en.ts and must keep the same ids,
 * dates, levels and links.
 */
import type { SiteContent } from './types.js';

export const nl: SiteContent = {
	locale: 'nl',

	meta: {
		company: {
			title: 'I.T. It: webapplicaties en apps van Robbin Schepers',
			description:
				'I.T. It bouwt webapplicaties en apps met Laravel, Svelte, Vue en Flutter. Robbin Schepers werkt eraan doordeweeks vanaf 18:00 en in het weekend.'
		},
		personal: {
			title: 'Robbin Schepers, developer en oprichter van I.T. It',
			description:
				'Robbin Schepers is developer en werkt overdag in loondienst. In de avonden en het weekend bouwt hij webapplicaties en apps met zijn bedrijf I.T. It.'
		}
	},

	profile: {
		name: 'Robbin Schepers',
		tagline: 'Professional Computer Nerd'
	},

	hero: {
		lead: {
			company:
				'Als I.T. It bouw ik webapplicaties en apps met Laravel, Svelte, Vue en Flutter, in de avonden en het weekend.',
			personal:
				'Ik werk overdag als developer en bouw in de avonden en het weekend projecten met mijn eigen bedrijf, I.T. It.'
		},
		cta: {
			job: 'Zoek je een developer voor je team?',
			freelance: 'Project voor I.T. It'
		},
		logoAlt: 'Logo van I.T. It',
		photoAlt: 'Portret van Robbin Schepers'
	},

	availability: {
		job: {
			title: 'Overdag: in loondienst',
			body: [
				'Overdag werk ik van negen tot vijf in loondienst als developer.',
				'Ik sta altijd open voor een goed gesprek over een vaste rol. Mijn ervaring staat verderop op deze pagina, en je kunt het CV printen.'
			],
			cta: 'Stuur een bericht via LinkedIn',
			print: 'Print mijn CV'
		},
		freelance: {
			title: 'Avonden en weekenden: I.T. It',
			body: [
				'Naast mijn baan heb ik een eigen bedrijf, I.T. It. Ik neem projecten aan voor webapplicaties en apps, van het eerste ontwerp tot een draaiende applicatie.'
			],
			hours: 'Doordeweeks vanaf 18:00 en in het weekend',
			takesOn: [
				"Laravel-applicaties en API's",
				'Front-ends in Svelte of Vue',
				'Mobiele apps in Flutter',
				'Technisch leiderschap en applicatie-architectuur'
			],
			cta: 'Project voor I.T. It',
			emailSubject: 'Project voor I.T. It'
		}
	},

	about: {
		title: 'Over mij',
		paragraphs: [
			'Ik ben developer met de meeste expertise in de backend. De frontend en devops vind ik ook leuk.',
			'Ik programmeer sinds mijn elfde. Die ervaring gebruik ik om je project en mijn teamgenoten een stap verder te brengen.',
			'Ik denk niet in problemen maar in uitdagingen en creatieve oplossingen, dus er is weinig dat ik niet wil bouwen.'
		]
	},

	competences: {
		title: 'Wat ik goed kan',
		items: [
			{
				id: 'multidisciplinair',
				title: 'Multidisciplinair',
				text: 'Mijn interesse in code en techniek is breed en ik leer graag nieuwe dingen. Ik schrijf meer dan tien programmeertalen, dus iets nieuws is zelden een probleem en meestal een leuke uitdaging.'
			},
			{
				id: 'technisch-leiderschap',
				title: 'Technisch leiderschap',
				text: "Met mijn brede technische kennis maak ik technische beslissingen en voer ik ze door, in het vertrouwen dat ze werken. Ik kan zelfstandig een project opzetten en afronden volgens hoge kwaliteitsstandaarden. Daarnaast coach ik graag collega's en til ik ze mee naar een hoger niveau."
			},
			{
				id: 'oplossingsgericht',
				title: 'Oplossingsgericht',
				text: "Tijdens het refinen van taken zie ik snel de oplossing voor complexe uitdagingen. Daardoor weet ik ook goed hoeveel moeite nodig is om zo'n uitdaging tot een succes te maken."
			},
			{
				id: 'laravel-expert',
				title: 'Laravel-expert',
				text: 'PHP programmeer ik sinds mijn elfde en Laravel gebruik ik sinds versie 5.3 (2016), samen met veel verschillende front-endtechnieken. Er is niets in de PHP-wereld dat nog nieuw voor me is. Door die kennis van het landschap kan ik voor elke klus de juiste tools aanraden.'
			}
		]
	},

	experience: {
		title: 'Ervaring',
		intro:
			'De nieuwste rol staat bovenaan. Open een rol voor de situatie, de taken en het resultaat.',
		labels: {
			present: 'heden',
			via: 'via {employer}',
			situation: 'Situatie',
			tasks: 'Taken',
			results: 'Resultaat'
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
					'iRealisatie is onderdeel van de directie Informatiebeleid en ontwikkelt in opdracht van beleidsafdelingen van VWS maatwerksoftware en tools die de digitalisering in de zorg versnellen. Het team bouwt software, webapplicaties en mobiele apps, van ontwerp tot beheer, met privacy en security als uitgangspunt.',
					'Daarnaast verkent iRealisatie nieuwe oplossingen met pilots en proofs of concept en moderniseert het verouderde informatiesystemen. Ook geeft het technisch advies bij digitaliseringsvraagstukken.',
					'Project iCore onderhoudt en breidt componenten uit die meerdere projecten binnen iRealisatie gebruiken.'
				],
				tasks: [
					'Het ZaakVolgSysteem (ZVS, PHP/Laravel) uitbreiden, het systeem dat alle Woo-verzoeken en klachten bijhoudt. Juristen krijgen zo beter inzicht in zaken, zodat minder termijnen verlopen en er minder dwangsommen betaald hoeven te worden.',
					'Het migreren van de Excel-sheets naar ZVS',
					'Het uitbreiden en verbeteren van de Termijnen Engine v2 en het repareren van bugs daarin'
				],
				results: [{ text: 'ZaakVolgSysteem is een intern systeem zonder publieke link.' }]
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
					'Leeroverzicht.nl is een website die werkend Nederland helpt bij bij- en omscholing.'
				],
				tasks: ['Het maken, bijhouden en vernieuwen van de front-end in Vue.js en TypeScript'],
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
					'Het CZ service-appteam splitste een ChatBot-team af, dat een chatbot met een LLM op de achtergrond voor de app ontwikkelt. Ik kwam tijdelijk bij dat team om de druk op de backlog te verlichten.'
				],
				tasks: [
					'Het bouwen van API-endpoints voor de chatbot in C# (.NET)',
					'Het verhuizen van de Azure Functions van de chatbot naar een eigen repository en resource group'
				],
				results: [{ text: 'De chatbot in de CZ-app' }]
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
					'CFK gebruikt een oude, zelfgebouwde applicatie voor het bijhouden van de deelnemersfondsen. Het systeem is verouderd en toe aan iets nieuws. We wilden een kopie met hier en daar een nieuwe feature die het werk efficiënter maakt (quality of life), maar dan webbased in plaats van een Windows-applicatie.'
				],
				tasks: [
					'Het ontwikkelen van de nieuwe applicatie',
					'Het migreren van de data van de oude applicatie naar de nieuwe',
					'Het opzetten van het project in Microsoft Azure (DevOps)',
					'Het coachen van teamgenoten',
					'Het verzorgen van de planning (Kanban/Scrum) en de bijbehorende meetings'
				],
				results: [{ text: 'De nieuwe webapplicatie van CFK (niet extern toegankelijk)' }]
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
					'Restaurant Puur had een oud kassasysteem dat veel vastliep. Ze vroegen mij een nieuw kassasysteem te bouwen. Een SaaS-oplossing was door de unieke situatie van het restaurant geen optie.'
				],
				tasks: [
					'Het opzetten van de POS-software in Electron met TypeScript en Svelte',
					'Het maken van een centrale API in PHP/Laravel met GraphQL, zodat de POS-systemen hun data centraal opslaan (in MySQL) en uitwisselen',
					'Het opzetten van een websocket die de synchronisatie tussen alle POS-systemen regelt',
					'Het maken van een reserveringsmodule voor de website in TypeScript en Svelte'
				],
				results: [
					{
						text: 'Project Panda: het nieuwe kassasysteem voor de unieke situatie van Restaurant Puur'
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
					'CZ had een app in OutSystems. Omdat OutSystems niet kon wat CZ wilde, besloot CZ de app in Flutter te herschrijven en daarop voort te bouwen.'
				],
				tasks: [
					'Het herschrijven van de volledige CZ Zorg-app in Flutter',
					'Het onderhouden en bijhouden van de software',
					'Het toevoegen van de functie Zorgverbruik',
					'Het toevoegen van de functie Zorgantwoord'
				],
				results: [
					{
						text: 'CZ-app in de App Store',
						url: 'https://itunes.apple.com/nl/app/cz-declareren/id937667763?l=en&mt=8'
					},
					{
						text: 'CZ-app in Google Play',
						url: 'https://play.google.com/store/apps/details?id=nl.cz.app'
					}
				]
			},
			{
				id: 'open-source',
				title: 'Open-source developer',
				organisation: 'Verschillende FOSS-projecten',
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
					'Ik gebruik in mijn dagelijkse werk veel open-source frameworks, libraries en tools. In 2020 vond ik het tijd om iets terug te geven aan de community. Sindsdien heb ik meegeholpen met het oplossen van problemen in verschillende projecten en een paar eigen projecten gestart.'
				],
				tasks: ['Het opstarten en onderhouden van verschillende open-source projecten'],
				results: [
					{
						text: 'Laravel Tinker-plugin voor PhpStorm, met ongeveer 102.000 actieve gebruikers',
						url: 'https://plugins.jetbrains.com/plugin/14957-laravel-tinker'
					},
					{
						text: 'Broncode van de Laravel Tinker-plugin op GitHub',
						url: 'https://github.com/Roboroads/laravel-tinker'
					},
					{ text: 'Graphton', url: 'https://github.com/GraphtonLib/Graphton' },
					{
						text: 'De website van Frontend Festival op GitHub',
						url: 'https://github.com/Ordina-Group/frontendfestival.nl'
					},
					{
						text: 'Diverse andere kleine projecten op GitHub',
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
					'Een on-premise IoT-apparaatje met scherm waarop je radiostreams kunt afspelen, inclusief een backoffice om het via de website te bedienen.'
				],
				tasks: [
					'Het maken en onderhouden van het backendpaneel waarmee klanten en kastjes worden gemaakt en beheerd',
					'Het maken en onderhouden van de verbindingsserver tussen de kastjes en de backend',
					'Het maken en onderhouden van de software op de kastjes die de radio afspeelt',
					'Het maken en onderhouden van de radiostreamserver'
				],
				results: [
					{
						text: 'Op het moment van schrijven speelt het kastje radio af in alle winkels van Van Uffelen en bij Skyview, het reuzenrad op de pier van Scheveningen'
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
					'Sublime FM is een landelijk te ontvangen radiostation. Elke vier maanden maakt het een toplijst, zoals de Summertime 500, de Sublime Top 1000 en de Soul500. Daarnaast geeft het de Sublime Awards en organiseert het toplijstquizzen.'
				],
				tasks: [
					'Het ontwerpen, bouwen en doorlopend aanpassen van het toplijstsysteem, het stemsysteem voor de awards en het systeem voor quizantwoorden'
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
					'Social Blue / Leads.io is gespecialiseerd in het genereren van leads voor klanten via diverse digitale kanalen.'
				],
				tasks: ['Het systeem dat gevoelige lead-data opslaat, beveiligt, uitlevert en verwijdert'],
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
					'Smitties was een kinderboekenserie zonder woorden. Smitties.eu was de website van de serie.'
				],
				tasks: ['Het maken en onderhouden van de Smitties-website'],
				results: [{ text: 'Een maatwerkwebsite met informatie en een webshop' }]
			},
			{
				id: 'vhu-europe',
				title: 'Fullstack developer',
				organisation: 'VHU Europe',
				start: '2016-05',
				end: '2016-09',
				tech: ['PHP'],
				situation: [
					'PURE Jingles, een merk van VHU Europe, maakt radioformats en jingles voor bekende radiostations in Europa.'
				],
				tasks: ['Het maken van diverse WordPress-plugins voor de nieuwe website'],
				results: [
					{
						text: 'Deze website is inmiddels vervangen door een nieuwe, dus het resultaat staat niet meer online'
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
					'Truman Scout is (was?) de maker van software waarmee voorbijgangers op zuilen met tablets via knoppen hun mening konden geven. Daarnaast deden we meer aan instore-activatie met verschillende proofs of concept.'
				],
				tasks: [
					'Het maken van hybride apps voor iPads met Cordova/PhoneGap en Vue.js',
					'Het maken van webapps en dashboards om data aan klanten te rapporteren, met Laravel/PHP en een Vue.js-frontend'
				],
				results: [{ text: 'Verschillende maatwerksoftware voor verschillende klanten' }]
			},
			{
				id: 'amwittools',
				title: 'Allround ICTer',
				organisation: 'Amwittools',
				start: '2013-06',
				end: '2014-03',
				tech: [],
				situation: [
					'Amwittools, het bedrijf waar mijn vader toen werkte, zocht iemand met verstand van computers.'
				],
				tasks: [
					'Het bijhouden van de (oude) website',
					'Het onderhouden van werkplekken',
					'Het verzorgen van backups'
				],
				results: [{ text: 'Algemene ICT-zaken verbeterd' }]
			},
			{
				id: 'gh-radio',
				title: 'Eigenaar',
				organisation: 'GH Radio',
				start: '2011-05',
				end: '2016-04',
				tech: ['JavaScript', 'PHP', 'MySQL', 'CSS', 'SCSS', 'HTML', 'Git', 'Node.js', 'SSH'],
				situation: [
					'Ik was meer dan vijf jaar eigenaar en leidinggevende van het online non-profit radiostation GH Radio. Samen met ongeveer 90 vrijwillige jongeren verzorgde ik de radio voor dagelijks 100 tot 200 jongeren tussen de 12 en 22 jaar.'
				],
				tasks: [
					'Zorgen dat de teams op zichzelf bleven draaien',
					'Het maken en onderhouden van de website (dit deed ik zelf)'
				],
				results: []
			}
		]
	},

	skills: {
		title: 'Vaardigheden',
		intro: 'Het niveau loopt van 1 tot 5, met het aantal jaren ervaring erbij.',
		labels: {
			level: 'niveau {level} van {max}',
			years: '{years} jaar',
			yearsOne: '{years} jaar'
		},
		groups: [
			{
				id: 'languages',
				title: 'Programmeertalen',
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
					{ id: 'android', title: 'Android-ontwikkeling', level: 3, years: 2 },
					{ id: 'angular', title: 'Angular', level: 1, years: 1 }
				]
			},
			{
				id: 'tools',
				title: 'Tools en infra',
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
				title: 'Werkwijze',
				skills: [
					{ id: 'programming', title: 'Programmeren', level: 5, years: 15 },
					{ id: 'software-development', title: 'Softwareontwikkeling', level: 5, years: 12 },
					{ id: 'app-development', title: 'Applicatieontwikkeling', level: 5, years: 8 },
					{ id: 'test-automation', title: 'Testautomatisering', level: 5, years: 8 },
					{ id: 'agile', title: 'Agile', level: 4, years: 10 },
					{ id: 'scrum', title: 'Scrum', level: 4, years: 5 },
					{ id: 'architecture', title: 'Applicatie-architectuur', level: 4, years: 5 },
					{ id: 'coaching', title: 'Coaching', level: 3, years: 5 },
					{ id: 'devops', title: 'DevOps', level: 3, years: 5 },
					{ id: 'sysadmin', title: 'Systeembeheer', level: 3, years: 5 },
					{ id: 'technical-design', title: 'Technisch ontwerper', level: 3, years: 3 },
					{ id: 'open-source', title: 'Open source', level: 3, years: 3 }
				]
			}
		]
	},

	talks: {
		title: 'Talks en workshops',
		intro:
			'Talks en workshops over Flutter, Svelte, front-end en PHP: wat ik kan geven en waar ik ze al gegeven heb.',
		offers: [
			{
				id: 'php-2005-called',
				kind: 'talk',
				title: '2005 Called! They Want Your Opinion About PHP Back!',
				summary:
					'Waarom PHP slecht was, waarom dat niet meer zo is en waarom het nog steeds een goede taal is om projecten in te bouwen.',
				lang: 'en'
			},
			{
				id: 'frontend-love',
				kind: 'talk',
				title: 'Falling in Love with Front-end all over again',
				summary:
					'De magie van Svelte, en hoe het zich verhoudt tot andere frameworks zoals Angular, React en Vue.js.',
				lang: 'en'
			},
			{
				id: 'flutter-talk',
				kind: 'talk',
				title: 'Writing multi-platform apps with native performance',
				summary: 'De Flutter-workshop als talk, zonder de stappen om zelf mee te bouwen.',
				lang: 'en'
			},
			{
				id: 'flutter-workshop',
				kind: 'workshop',
				title: 'Workshop Flutter',
				summary: 'Hoe je begint met het bouwen van je eerste Flutter-app voor reviews.',
				lang: 'nl'
			}
		],
		given: [
			{
				id: 'php-2005-called',
				offerId: 'php-2005-called',
				date: '2024-06-21'
			},
			{
				id: 'frontend-js-eindhoven',
				offerId: 'frontend-love',
				date: '2023-08-23',
				event: 'JS Meetup Eindhoven',
				url: 'https://www.meetup.com/nl-NL/js-eindhoven/events/291205657/'
			},
			{
				id: 'frontend-festival',
				offerId: 'frontend-love',
				date: '2023-04-13',
				event: 'Frontend Festival',
				url: 'https://frontendfestival.nl'
			},
			{
				id: 'flutter-ordina-noord',
				offerId: 'flutter-workshop',
				date: '2022-10-27',
				event: 'Ordina Noord'
			},
			{
				id: 'flutter-frontmania',
				offerId: 'flutter-talk',
				date: '2022-10-05',
				event: 'FrontMania',
				url: 'https://frontmania.com/'
			},
			{
				id: 'services-join-belgie',
				date: '2022-10-04',
				event: 'JOIN België',
				title: 'Flutter-demo in de talk {talk} van Remi Appels',
				talk: { title: 'Services down to your pocket', lang: 'en' },
				url: 'https://join.ordina-jworks.io/'
			},
			{
				id: 'flutter-ordina-belgie',
				offerId: 'flutter-workshop',
				date: '2022-09-19',
				event: 'Ordina België',
				title: 'Training Flutter'
			},
			{
				id: 'flutter-code-comedy',
				offerId: 'flutter-workshop',
				date: '2022-06-16',
				event: 'Code&Comedy'
			},
			{
				id: 'svelte-nieuwegein',
				offerId: 'frontend-love',
				date: '2022-04-13',
				event: 'FrontEnd Meetup Nieuwegein'
			}
		],
		labels: {
			offers: 'Klaar om te geven',
			given: 'Gegeven',
			kind: { talk: 'Talk', workshop: 'Workshop' },
			language: { nl: 'Nederlands', en: 'Engels' },
			facts: { language: 'Taal', duration: 'Duur', audience: 'Doelgroep' },
			times: {
				one: 'Eén keer gegeven, op {last}',
				many: '{count} keer gegeven, laatst op {last}'
			}
		}
	},

	educationLanguages: {
		title: 'Opleiding en talen',
		labels: { education: 'Opleiding', languages: 'Talen' },
		education: [
			{
				id: 'ngt-course',
				title: 'Cursus Nederlandse Gebarentaal',
				institution: 'TYD',
				year: 2023
			}
		],
		languages: [
			{ id: 'nl', title: 'Nederlands', level: 5 },
			{ id: 'en', title: 'Engels', level: 5 },
			{ id: 'ngt', title: 'Nederlandse Gebarentaal (NGT)', level: 2, note: 'basis' }
		]
	},

	contact: {
		title: 'Contact',
		intro: 'Een baan of een project? Stuur me een bericht.',
		labels: {
			email: 'E-mail',
			linkedin: 'LinkedIn',
			github: 'GitHub',
			company: 'Naar I.T. It'
		}
	}
};
