export default () => ({
	documentation: {
		enabled: true,
	},
	'users-permissions': {
		config: {
			jwt: {
				expiresIn: '30d',
			},
		},
	},
});
