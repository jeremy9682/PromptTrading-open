import type { StrapiApp } from '@strapi/strapi/admin';

export default {
	config: {
		locales: ['zh-Hans'],
		translations: {
			en: {
				'Auth.form.welcome.title': 'PromptTrading',
				'Auth.form.welcome.subtitle': 'PromptTrading User Management Service',
			},
			'zh-Hans': {
				'Auth.form.welcome.title': 'PromptTrading',
				'Auth.form.welcome.subtitle': 'PromptTrading User Management Service',
			},
		},
	},
	bootstrap(app: StrapiApp) {
		console.log(app);
	},
};
