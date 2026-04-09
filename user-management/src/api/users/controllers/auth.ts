import { factories } from '@strapi/strapi';
import logger from '../../../utils/logger';

export default factories.createCoreController('plugin::users-permissions.user', ({ strapi }) => ({
	async generateNonce(ctx) {
		const { address } = ctx.request.body as { address?: string };

		if (!address) {
			return ctx.badRequest('Missing wallet address');
		}

		const authService = strapi.service('api::users.auth');
		const { nonce, expiresAt, message } = await authService.generateNonce(address);

		logger.info(`Generated nonce for address: ${address}`);
		ctx.body = {
			success: true,
			data: { message, nonce, expiresAt },
		};
	},

	async login(ctx) {
		try {
			const { address, signature, nonce } = ctx.request.body as {
				address?: string;
				signature?: string;
				nonce?: string;
			};

			if (!address || !signature || !nonce) {
				return ctx.badRequest('Missing parameters');
			}

			await strapi.service('api::users.auth').verifySignature(address, signature, nonce);

			const { token, refreshToken, user, expiresIn } = await strapi.service('api::users.auth').login(address);

			ctx.body = {
				success: true,
				data: {
					token,
					refreshToken,
					user: {
						id: user.id,
						walletAddress: user.walletAddress,
						createdAt: user.createdAt,
						tier: user.tier ?? 'free',
					},
					expiresIn,
				},
			};
		} catch (err: any) {
			logger.error(err);
			return ctx.badRequest(err.message || 'Login failed');
		}
	},

	async refresh(ctx) {
		try {
			const authHeader = ctx.headers['authorization'];
			if (!authHeader) return ctx.unauthorized('Missing Authorization header');

			const refreshToken = authHeader.replace(/^Bearer\s+/i, '');
			const data = await strapi.service('api::users.auth').refreshToken(refreshToken);

			ctx.body = {
				success: true,
				data,
			};
		} catch (err) {
			ctx.badRequest(err.message);
		}
	},

	async logout(ctx) {
		try {
			const authHeader = ctx.headers['authorization'];
			if (!authHeader) return ctx.unauthorized('Missing Authorization header');

			const refreshToken = authHeader.replace(/^Bearer\s+/i, '');
			await strapi.service('api::users.auth').logout(refreshToken);

			ctx.body = {
				success: true,
				message: 'Logged out successfully',
			};
		} catch (err) {
			ctx.badRequest(err.message);
		}
	},
}));
