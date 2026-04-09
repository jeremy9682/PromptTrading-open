import { createClient } from 'redis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;
const REDIS_ENABLED = process.env.REDIS_ENABLED !== 'false';

const redisClient = createClient({
	socket: {
		host: REDIS_HOST,
		port: REDIS_PORT,
	},
});

redisClient.on('error', (err) => console.error('❌ Redis error:', err));
redisClient.on('connect', () => console.log('✅ Redis connected success'));

async function connectRedis() {
	if (REDIS_ENABLED) {
		try {
			if (!redisClient.isOpen) {
				await redisClient.connect();
			}
		} catch (error) {
			console.warn('⚠️  Redis connection failed, continuing without Redis:', error.message);
		}
	} else {
		console.log('ℹ️  Redis is disabled');
	}
}

connectRedis();

export default redisClient;
