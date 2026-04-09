/**
 * Authentication Routes
 * Handles Privy authentication verification and user session management
 */

import express from 'express';
import { requirePrivyAuth, getPrivyUserDetails } from '../middleware/privyAuth.middleware.js';
import { upsertUser } from '../services/user-cache.service.js';

const router = express.Router();

/**
 * GET /api/auth/status
 * Check authentication status
 * Returns user info if authenticated, or null if not
 */
router.get('/status', (req, res) => {
  if (req.privyUser) {
    res.json({
      success: true,
      authenticated: true,
      user: {
        userId: req.privyUser.userId,
        issuedAt: req.privyUser.issuedAt,
        expiration: req.privyUser.expiration,
      },
    });
  } else {
    res.json({
      success: true,
      authenticated: false,
      user: null,
      error: req.privyAuthError || null,
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user's full profile (protected)
 * Requires valid Privy authentication
 */
router.get('/me', requirePrivyAuth, getPrivyUserDetails, (req, res) => {
  res.json({
    success: true,
    user: {
      ...req.privyUser,
      details: req.privyUserDetails || null,
    },
  });
});

/**
 * POST /api/auth/verify
 * Verify a token and return user info
 * Useful for client-side token validation
 */
router.post('/verify', (req, res) => {
  if (req.privyUser) {
    res.json({
      success: true,
      valid: true,
      user: req.privyUser,
    });
  } else {
    res.status(401).json({
      success: false,
      valid: false,
      error: req.privyAuthError || 'Invalid or expired token',
    });
  }
});

/**
 * POST /api/auth/sync
 * Sync user data to backend database (protected)
 * Called after login to ensure user exists in our database
 * 
 * 方案 A: 只使用嵌入式钱包进行交易
 * - 优先查找 walletClientType === 'privy' 的嵌入式钱包
 * - 这个地址用于派生 Safe 地址
 * - 外部钱包只用于登录，不用于交易
 */
router.post('/sync', requirePrivyAuth, getPrivyUserDetails, async (req, res) => {
  try {
    const { userId } = req.privyUser;
    const userDetails = req.privyUserDetails;

    // 方案 A: 只使用嵌入式钱包
    // 嵌入式钱包 (walletClientType === 'privy') 是每个用户唯一且固定的
    const embeddedWallet = userDetails?.linkedWallets?.find(
      w => w.walletClientType === 'privy'
    );
    const embeddedWalletAddress = embeddedWallet?.address || null;
    
    // 外部钱包（用于显示，但不用于交易）
    const externalWallets = userDetails?.linkedWallets?.filter(
      w => w.walletClientType !== 'privy'
    ) || [];

    // 保存/更新用户到数据库
    if (!embeddedWalletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Embedded wallet not found',
        message: 'User must have an embedded wallet to use this service',
      });
    }

    // 使用 upsertUser 创建或更新用户
    const user = await upsertUser({
      where: { privyUserId: userId },
      update: {
        walletAddress: embeddedWalletAddress,
        lastLoginAt: new Date(),
      },
      create: {
        privyUserId: userId,
        walletAddress: embeddedWalletAddress,
      },
    });

    console.log('[Auth Sync] User:', userId);
    console.log('[Auth Sync] Embedded wallet (for trading):', embeddedWalletAddress);
    console.log('[Auth Sync] External wallets:', externalWallets.map(w => w.address));
    console.log('[Auth Sync] User saved/updated in database:', user.id);

    // 返回用户数据
    const userData = {
      id: user.id,
      privyUserId: user.privyUserId,
      walletAddress: user.walletAddress,
      safeAddress: user.safeAddress,
      safeDeployed: user.safeDeployed,
      safeApprovalsSet: user.safeApprovalsSet,
      isDelegated: user.isDelegated,
      autoTradeEnabled: user.autoTradeEnabled,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.json({
      success: true,
      user: userData,
      message: 'User synced successfully',
    });

  } catch (error) {
    console.error('User sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync user data',
      details: error.message,
    });
  }
});

export default router;
