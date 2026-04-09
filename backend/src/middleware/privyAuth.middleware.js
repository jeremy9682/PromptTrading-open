/**
 * Privy Authentication Middleware
 * Verifies Privy access tokens and extracts user information
 * Supports AWS Secrets Manager for production credentials
 */

import { PrivyClient } from '@privy-io/server-auth';
import { getPrivyCredentials } from '../config/secrets.js';

// Privy client instance (initialized lazily)
let privyClient = null;

/**
 * Initialize Privy client with credentials
 * Fetches from AWS Secrets Manager in production, env vars in development
 */
async function getPrivyClient() {
  if (privyClient) {
    return privyClient;
  }

  const { appId, appSecret } = await getPrivyCredentials();

  if (!appId || !appSecret) {
    throw new Error('Missing Privy credentials. Check AWS Secrets Manager or environment variables.');
  }

  privyClient = new PrivyClient(appId, appSecret);
  console.log('Privy client initialized successfully');
  return privyClient;
}

/**
 * Privy Auth Middleware
 * Verifies the Privy access token from Authorization header
 * Attaches user data to req.privyUser
 */
export const privyAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check for Authorization header
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth header - allow request to continue (for public endpoints)
      req.privyUser = null;
      return next();
    }

    const token = authHeader.replace('Bearer ', '');

    // Get Privy client (initializes on first request)
    const client = await getPrivyClient();

    // Verify the token with Privy
    const verifiedClaims = await client.verifyAuthToken(token);

    // Token is valid, attach user info to request
    req.privyUser = {
      userId: verifiedClaims.userId,
      appId: verifiedClaims.appId,
      issuer: verifiedClaims.issuer,
      issuedAt: verifiedClaims.issuedAt,
      expiration: verifiedClaims.expiration,
    };

    console.log('Privy auth verified for user:', verifiedClaims.userId);
    next();

  } catch (error) {
    console.error('Privy auth error:', error.message);

    // If token is invalid/expired, set null user but allow request
    // Protected routes will check req.privyUser separately
    req.privyUser = null;
    req.privyAuthError = error.message;
    next();
  }
};

/**
 * Require Privy Auth Middleware
 * Use this for protected endpoints that require authentication
 */
export const requirePrivyAuth = (req, res, next) => {
  if (!req.privyUser) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      message: req.privyAuthError || 'Please login to access this resource',
    });
  }
  next();
};

/**
 * Get User Details Middleware
 * Fetches full user profile from Privy (use sparingly - adds latency)
 */
export const getPrivyUserDetails = async (req, res, next) => {
  if (!req.privyUser?.userId) {
    return next();
  }

  try {
    const client = await getPrivyClient();
    const user = await client.getUser(req.privyUser.userId);
    req.privyUserDetails = {
      id: user.id,
      createdAt: user.createdAt,
      // Linked accounts
      email: user.email?.address,
      phone: user.phone?.number,
      google: user.google?.email,
      apple: user.apple?.email,
      discord: user.discord?.username,
      twitter: user.twitter?.username,
      // Wallets
      linkedWallets: user.linkedAccounts
        ?.filter(acc => acc.type === 'wallet')
        ?.map(w => ({
          address: w.address,
          chainType: w.chainType,
          walletClientType: w.walletClientType,
        })) || [],
    };
    next();
  } catch (error) {
    console.error('Error fetching Privy user details:', error);
    // Don't fail the request, just log the error
    next();
  }
};

export default privyAuthMiddleware;
