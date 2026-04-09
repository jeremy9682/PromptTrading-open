export default {
	routes: [
		{
			method: 'GET',
			path: '/user/profile',
			handler: 'user.profile',
			config: {
				auth: { strategies: ['users-permissions'] },
			},
		},

		{
			method: 'PATCH',
			path: '/user/profile',
			handler: 'user.updateProfile',
			config: {
				auth: { strategies: ['users-permissions'] },
			},
		},
	],
};
