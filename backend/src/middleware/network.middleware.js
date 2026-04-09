/**
 * 网络验证中间件
 * 确保请求使用支持的网络
 */

/**
 * 验证网络配置
 * @param {Object} req - Express 请求对象
 * @param {Object} res - Express 响应对象
 * @param {Function} next - 下一个中间件
 */
export const networkValidation = (req, res, next) => {
  // GET 请求从 query 获取，POST 请求从 body 获取
  const chainId = req.method === 'GET' 
    ? parseInt(req.query.chainId) 
    : parseInt(req.body.chainId);
  
  // 某些只读操作可能不需要 chainId
  if (!chainId && req.method === 'GET') {
    // 对于查询操作，如果没有指定网络，默认使用测试网
    req.isTestnet = true;
    req.isMainnet = false;
    req.chainId = 421614; // 默认测试网
    return next();
  }
  
  // 对于写操作（POST/PUT/DELETE），必须提供 chainId
  if (!chainId && req.method !== 'GET') {
    return res.status(400).json({
      success: false,
      error: '缺少网络信息 (chainId)',
      errorCode: 'MISSING_CHAIN_ID',
      details: {
        message: '执行交易操作必须提供 chainId 参数',
        supportedNetworks: {
          testnet: { name: 'Arbitrum Sepolia', chainId: 421614 },
          mainnet: { name: 'Arbitrum One', chainId: 42161 }
        }
      }
    });
  }
  
  // 验证网络是否支持
  const isTestnet = chainId === 421614; // Arbitrum Sepolia
  const isMainnet = chainId === 42161;  // Arbitrum One
  
  if (chainId && !isTestnet && !isMainnet) {
    return res.status(400).json({
      success: false,
      error: '不支持的网络',
      errorCode: 'UNSUPPORTED_NETWORK',
      details: {
        provided: chainId,
        supportedNetworks: {
          testnet: { name: 'Arbitrum Sepolia', chainId: 421614 },
          mainnet: { name: 'Arbitrum One', chainId: 42161 }
        },
        message: '请使用 Arbitrum Sepolia (测试网) 或 Arbitrum One (主网)'
      }
    });
  }
  
  // 将网络信息附加到请求对象
  req.isTestnet = isTestnet;
  req.isMainnet = isMainnet;
  req.chainId = chainId || 421614; // 默认测试网
  req.networkName = isTestnet ? 'Arbitrum Sepolia' : 'Arbitrum One';
  
  // 记录网络信息（用于调试）
  console.log(`[网络验证] ${req.method} ${req.path} - ${req.networkName} (${req.chainId})`);
  
  next();
};

/**
 * 强制主网验证中间件
 * 用于特别敏感的操作，确保只在主网执行
 */
export const requireMainnet = (req, res, next) => {
  if (!req.isMainnet) {
    return res.status(403).json({
      success: false,
      error: '该操作仅支持主网',
      errorCode: 'MAINNET_REQUIRED',
      details: {
        currentNetwork: req.networkName || 'Unknown',
        requiredNetwork: 'Arbitrum One (42161)'
      }
    });
  }
  next();
};

/**
 * 强制测试网验证中间件
 * 用于测试功能，确保只在测试网执行
 */
export const requireTestnet = (req, res, next) => {
  if (!req.isTestnet) {
    return res.status(403).json({
      success: false,
      error: '该操作仅支持测试网',
      errorCode: 'TESTNET_REQUIRED',
      details: {
        currentNetwork: req.networkName || 'Unknown',
        requiredNetwork: 'Arbitrum Sepolia (421614)'
      }
    });
  }
  next();
};
