import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../../../utils/redisClient';

const { utils } = require('ethers');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
	throw new Error('JWT_SECRET environment variable is required');
}
const JWT_EXPIRES_IN = 7 * 24 * 60 * 60;

export default ({ strapi }: { strapi }) => ({
	async generateNonce(address: string) {
		const nonce = crypto.randomBytes(12).toString('hex');
		const timestamp = new Date().toISOString();
		const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

		const message = `Welcome to PromptTrading!\n\n` + `Please sign this message to verify your wallet ownership.\n\n` + `Nonce: ${nonce}\nTimestamp: ${timestamp}`;

		await redisClient.set(`nonce:${address}`, nonce, { EX: 300 });

		return { nonce, timestamp, expiresAt, message };
	},

	async verifySignature(address: string, signature: string, nonce: string) {
		const cachedNonce = await redisClient.get(`nonce:${address}`);
		if (!cachedNonce) throw new Error('Nonce expired');
		if (cachedNonce !== nonce) throw new Error('Invalid nonce');

		const message = `Welcome to PromptTrading!\n\nPlease sign this message to verify your wallet ownership.\n\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}`;

		const signerAddress = utils.verifyMessage(message, signature);
		if (signerAddress.toLowerCase() !== address.toLowerCase()) {
			throw new Error('Invalid signature');
		}

		await redisClient.del(`nonce:${address}`);
		return true;
	},

	async login(address: string) {
		let user = await strapi.db.query('api::users.user').findOne({
			where: { walletAddress: address },
		});

		if (!user) {
			user = await strapi.db.query('api::users.user').create({
				data: { walletAddress: address },
			});
		}

		const payload = {
			userId: user.id,
			walletAddress: user.walletAddress,
			tier: user.tier ?? 'free',
		};

		const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' });

		const refreshToken = `refresh_${crypto.randomBytes(16).toString('hex')}`;
		await redisClient.set(`refresh:${user.id}`, refreshToken, { EX: 7 * 24 * 3600 });

		return { token, refreshToken, user, expiresIn: 7 * 24 * 3600 };
	},

	async generateTokens(userId: string, walletAddress: string) {
		const token = jwt.sign({ userId, walletAddress }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

		const refreshToken = uuidv4();
		await redisClient.set(`refresh:${refreshToken}`, userId, { EX: JWT_EXPIRES_IN });

		return { token, refreshToken, expiresIn: JWT_EXPIRES_IN };
	},

	async refreshToken(refreshToken: string) {
		const userId = await redisClient.get(`refresh:${refreshToken}`);
		if (!userId) throw new Error('Invalid refresh token');

		const user = await strapi.db.query('api::users.user').findOne({ where: { id: userId } });
		if (!user) throw new Error('User not found');

		const token = jwt.sign({ userId: user.id, walletAddress: user.walletAddress }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

		return { token, expiresIn: JWT_EXPIRES_IN };
	},

	async logout(refreshToken: string) {
		await redisClient.del(`refresh:${refreshToken}`);
	},
});
