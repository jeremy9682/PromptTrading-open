import { factories } from '@strapi/strapi';
import logger from '../../../utils/logger';

export default factories.createCoreController('plugin::users-permissions.user', ({ strapi }) => ({
	async profile(ctx) {
		try {
			const userId = ctx.state.user?.id;
			if (!userId) {
				ctx.status = 401;
				ctx.body = { error: 'Unauthorized' };
				return;
			}

			const user = await strapi.db.query('plugin::users-permissions.user').findOne({
				where: { id: userId },
				select: [
					'id',
					'wallet_address',
					'email',
					'avatar',
					'last_login_at',
					'status',
					'free_credits_used',
					'free_credits_total',
					'paid_credits',
					'subscription_tier',
					'subscription_expires_at',
					'hyperliquid_agent_address',
					'hyperliquid_binding_status',
					'hyperliquid_balance_cache',
					'profile_data',
					'preferences',
					'metadata',
				],
			});

			if (!user) {
				ctx.status = 404;
				ctx.body = { error: 'User not found' };
				return;
			}

			ctx.body = {
				success: true,
				data: user,
			};
		} catch (err) {
			strapi.log.error(err);
			ctx.status = 500;
			ctx.body = { error: 'Internal server error' };
		}
	},

	async updateProfile(ctx) {
		try {
			const userId = ctx.state.user?.id;
			if (!userId) {
				ctx.status = 401;
				ctx.body = { error: 'Unauthorized' };
				return;
			}

			const body = ctx.request.body;

			const allowedFields = ['nickname', 'avatar', 'timezone', 'language', 'preferences'];

			const dataToUpdate: Record<string, any> = {};
			allowedFields.forEach((field) => {
				if (body[field] !== undefined) {
					dataToUpdate[field] = body[field];
				}
			});

			const updatedUser = await strapi.db.query('plugin::users-permissions.user').update({
				where: { id: userId },
				data: dataToUpdate,
				select: ['id', 'nickname', 'avatar', 'wallet_address', 'email'],
			});

			ctx.body = {
				success: true,
				message: 'Profile updated successfully',
				data: updatedUser,
			};
		} catch (err) {
			strapi.log.error(err);
			ctx.status = 500;
			ctx.body = { error: 'Internal server error' };
		}
	},

	async setApiKey(ctx) {
		try {
			const userId = ctx.state.user?.id;
			if (!userId) {
				ctx.status = 401;
				ctx.body = { error: 'Unauthorized' };
				return;
			}

			const { provider, apiKey, encrypted } = ctx.request.body as {
				provider?: string;
				apiKey?: string;
				encrypted?: boolean;
			};

			if (!provider || !apiKey) {
				ctx.status = 400;
				ctx.body = { error: 'provider and apiKey are required' };
				return;
			}

			const updatedUser = await strapi.db.query('api::users.user').update({
				where: { id: userId },
				data: {
					custom_api_key_encrypted: encrypted ? apiKey : null,
				},
				select: ['custom_api_key_encrypted', 'updatedAt'],
			});

			ctx.body = {
				success: true,
				message: 'API Key saved successfully',
				data: {
					provider,
					hasApiKey: !!updatedUser.custom_api_key_encrypted,
					verified: true,
					updatedAt: updatedUser.updatedAt,
				},
			};
		} catch (err) {
			strapi.log.error(err);
			ctx.status = 500;
			ctx.body = { error: 'Internal server error' };
		}
	},
}));
