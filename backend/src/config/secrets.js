/**
 * AWS Secrets Manager Configuration
 *
 * 生产环境：从 AWS Secrets Manager 获取敏感密钥
 * 开发环境：从本地 .env 文件获取
 *
 * 注意：DATABASE_URL 保留在服务器本地 .env 中（未来可迁移到 AWS RDS）
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const AWS_REGION = process.env.AWS_REGION || 'us-east-2';
const SECRET_NAME = process.env.AWS_SECRET_NAME || 'your-app/secrets';

// Cache for secrets (avoid fetching on every request)
let cachedSecrets = null;

/**
 * 从本地环境变量获取所有敏感配置（开发环境使用）
 */
function getLocalSecrets() {
  return {
    // Privy Authentication
    PRIVY_APP_ID: process.env.PRIVY_APP_ID,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    PRIVY_AUTHORIZATION_PRIVATE_KEY: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY,

    // Polymarket Builder
    POLYMARKET_BUILDER_API_KEY: process.env.POLYMARKET_BUILDER_API_KEY,
    POLYMARKET_BUILDER_SECRET: process.env.POLYMARKET_BUILDER_SECRET,
    POLYMARKET_BUILDER_PASSPHRASE: process.env.POLYMARKET_BUILDER_PASSPHRASE,
    POLYMARKET_ENCRYPTION_KEY: process.env.POLYMARKET_ENCRYPTION_KEY,

    // OpenRouter AI
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,

    // DFlow/Kalshi Trading
    DFLOW_API_KEY: process.env.DFLOW_API_KEY,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,

    // Subscription Payments
    COINBASE_COMMERCE_API_KEY: process.env.COINBASE_COMMERCE_API_KEY,
    COINBASE_COMMERCE_WEBHOOK_SECRET: process.env.COINBASE_COMMERCE_WEBHOOK_SECRET,
    HELIO_API_KEY: process.env.HELIO_API_KEY,
    HELIO_SECRET_KEY: process.env.HELIO_SECRET_KEY,
    HELIO_WEBHOOK_SECRET: process.env.HELIO_WEBHOOK_SECRET,
  };
}

/**
 * 获取所有敏感密钥
 *
 * 生产环境 (NODE_ENV=production, USE_LOCAL_ENV=false)：从 AWS Secrets Manager 获取
 * 开发环境 (NODE_ENV=development 或 USE_LOCAL_ENV=true)：从本地 .env 获取
 */
export async function getSecrets() {
  // 返回缓存的密钥（避免重复请求）
  if (cachedSecrets) {
    return cachedSecrets;
  }

  // 开发环境或明确指定使用本地环境变量
  if (process.env.NODE_ENV === 'development' || process.env.USE_LOCAL_ENV === 'true') {
    console.log('[Secrets] 使用本地环境变量');
    cachedSecrets = getLocalSecrets();
    return cachedSecrets;
  }

  // 生产环境：从 AWS Secrets Manager 获取
  try {
    console.log(`[Secrets] 从 AWS Secrets Manager 获取: ${SECRET_NAME}`);

    const client = new SecretsManagerClient({ region: AWS_REGION });
    const command = new GetSecretValueCommand({ SecretId: SECRET_NAME });
    const response = await client.send(command);

    if (response.SecretString) {
      cachedSecrets = JSON.parse(response.SecretString);
      console.log('[Secrets] 成功从 AWS Secrets Manager 加载密钥');
      return cachedSecrets;
    }

    throw new Error('Secret string is empty');
  } catch (error) {
    console.error('[Secrets] AWS 获取失败:', error.message);
    console.log('[Secrets] 回退到本地环境变量');
    cachedSecrets = getLocalSecrets();
    return cachedSecrets;
  }
}

/**
 * 获取 Privy 认证凭证
 */
export async function getPrivyCredentials() {
  const secrets = await getSecrets();
  return {
    appId: secrets.PRIVY_APP_ID,
    appSecret: secrets.PRIVY_APP_SECRET,
    authorizationPrivateKey: secrets.PRIVY_AUTHORIZATION_PRIVATE_KEY,
  };
}

/**
 * 获取 Polymarket Builder 凭证
 */
export async function getPolymarketBuilderCredentials() {
  const secrets = await getSecrets();
  return {
    key: secrets.POLYMARKET_BUILDER_API_KEY,
    secret: secrets.POLYMARKET_BUILDER_SECRET,
    passphrase: secrets.POLYMARKET_BUILDER_PASSPHRASE,
  };
}

/**
 * 获取 Polymarket 加密密钥（用于加密用户的 API 凭证）
 */
export async function getPolymarketEncryptionKey() {
  const secrets = await getSecrets();
  return secrets.POLYMARKET_ENCRYPTION_KEY;
}

/**
 * 获取 OpenRouter API 密钥
 */
export async function getOpenRouterApiKey() {
  const secrets = await getSecrets();
  return secrets.OPENROUTER_API_KEY;
}

/**
 * 获取 DFlow API 密钥（用于 Kalshi 预测市场交易）
 */
export async function getDFlowApiKey() {
  const secrets = await getSecrets();
  return secrets.DFLOW_API_KEY;
}

/**
 * 获取 Solana RPC URL
 */
export async function getSolanaRpcUrl() {
  const secrets = await getSecrets();
  // 如果没有配置，使用默认的公共 RPC
  return secrets.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
}

/**
 * Get subscription payment credentials (Coinbase Commerce + Helio)
 */
export async function getSubscriptionCredentials() {
  const secrets = await getSecrets();
  return {
    coinbaseApiKey: secrets.COINBASE_COMMERCE_API_KEY,
    coinbaseWebhookSecret: secrets.COINBASE_COMMERCE_WEBHOOK_SECRET,
    helioApiKey: secrets.HELIO_API_KEY,
    helioSecretKey: secrets.HELIO_SECRET_KEY,
    helioWebhookSecret: secrets.HELIO_WEBHOOK_SECRET,
  };
}

export default {
  getSecrets,
  getPrivyCredentials,
  getPolymarketBuilderCredentials,
  getPolymarketEncryptionKey,
  getOpenRouterApiKey,
  getDFlowApiKey,
  getSolanaRpcUrl,
  getSubscriptionCredentials,
};
