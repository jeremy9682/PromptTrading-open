/**
 * 加密服务
 * 用于安全加密/解密 Agent 私钥
 * 使用浏览器原生 Web Crypto API
 */

/**
 * 从密码派生加密密钥
 * @param {string} password - 用户密码
 * @param {Uint8Array} salt - 盐值
 * @returns {Promise<CryptoKey>} 派生的加密密钥
 */
const deriveKey = async (password, salt) => {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // 导入密码作为密钥材料
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // 使用 PBKDF2 派生密钥
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

/**
 * 加密 Agent 私钥
 * @param {string} privateKey - 原始私钥
 * @param {string} password - 加密密码（通常是用户钱包地址）
 * @returns {Promise<string>} 加密后的数据（Base64）
 */
export const encryptPrivateKey = async (privateKey, password) => {
  try {
    // 生成随机盐值和 IV
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 派生加密密钥
    const key = await deriveKey(password, salt);

    // 加密私钥
    const encoder = new TextEncoder();
    const data = encoder.encode(privateKey);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );

    // 组合: salt + iv + encrypted
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    // 转换为 Base64
    return btoa(String.fromCharCode(...combined));

  } catch (error) {
    console.error('加密失败:', error);
    throw new Error('私钥加密失败');
  }
};

/**
 * 解密 Agent 私钥
 * @param {string} encryptedData - 加密的数据（Base64）
 * @param {string} password - 解密密码
 * @returns {Promise<string>} 原始私钥
 */
export const decryptPrivateKey = async (encryptedData, password) => {
  try {
    // 从 Base64 解码
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    // 提取 salt, iv, encrypted
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

    // 派生密钥
    const key = await deriveKey(password, salt);

    // 解密
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encrypted
    );

    // 转换为字符串
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);

  } catch (error) {
    console.error('解密失败:', error);
    throw new Error('私钥解密失败');
  }
};

/**
 * 简化版：使用用户地址作为密码
 * （用户地址是公开的，但对于临时 Agent 来说足够安全）
 */
export const encryptWithAddress = (privateKey, userAddress) => {
  return encryptPrivateKey(privateKey, userAddress);
};

export const decryptWithAddress = (encryptedData, userAddress) => {
  return decryptPrivateKey(encryptedData, userAddress);
};

