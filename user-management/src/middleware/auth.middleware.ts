import type { Context, Next } from 'koa';
import jwt from 'jsonwebtoken';
import redisClient from '../utils/redisClient';
import logger from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
	throw new Error('JWT_SECRET environment variable is required');
}

export const authenticateToken = (strapi) => {
	return async (ctx: Context, next: Next) => {
		try {
			const authHeader = ctx.headers['authorization'];
			if (!authHeader) {
				ctx.status = 401;
				ctx.body = { error: 'Unauthorized' };
				return;
			}

			const token = authHeader.replace(/^Bearer\s+/i, '');
			if (!token) {
				ctx.status = 401;
				ctx.body = { error: 'Unauthorized' };
				return;
			}

			let payload: any;
			try {
				payload = jwt.verify(token, JWT_SECRET);
			} catch (err) {
				ctx.status = 401;
				ctx.body = { error: 'Invalid token' };
				return;
			}

			const blacklisted = await redisClient.get(`blacklist:${token}`);
			if (blacklisted) {
				ctx.status = 401;
				ctx.body = { error: 'Token revoked' };
				return;
			}

			const user = await strapi.db.query('api::users.user').findOne({
				where: { id: payload.userId },
				select: ['id', 'walletAddress', 'tier'],
			});

			if (!user) {
				ctx.status = 401;
				ctx.body = { error: 'User not found' };
				return;
			}

			ctx.state.user = user;

			await next();
		} catch (err) {
			logger.error(err);
			ctx.status = 500;
			ctx.body = { error: 'Internal server error' };
		}
	};
};
