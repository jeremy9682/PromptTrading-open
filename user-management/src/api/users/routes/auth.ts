export default {
	routes: [
		{
			method: 'POST',
			path: '/auth/nonce',
			handler: 'auth.generateNonce',
			config: { auth: false },
		},

		{
			method: 'POST',
			path: '/auth/login',
			handler: 'auth.login',
			config: { auth: false },
		},

		{
			method: 'POST',
			path: '/auth/refresh',
			handler: 'auth.refresh',
			config: { auth: false },
		},

		{
			method: 'POST',
			path: '/auth/logout',
			handler: 'auth.logout',
			config: { auth: false },
		},
	],
};
