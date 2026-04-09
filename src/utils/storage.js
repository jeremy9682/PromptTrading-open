/**
 * LocalStorage utility for MVP
 * Stores user configuration and state in browser
 */

const STORAGE_PREFIX = 'prompttrading_';
const CONFIG_KEY = 'config';
const HISTORY_KEY = 'history';
const FAVORITES_KEY = 'favorites';

/**
 * Generate storage key for a wallet address
 */
const getKey = (walletAddress, type) => {
  if (!walletAddress) return null;
  return `${STORAGE_PREFIX}${walletAddress.toLowerCase()}_${type}`;
};

/**
 * Save user configuration
 */
export const saveConfig = (walletAddress, config) => {
  try {
    const key = getKey(walletAddress, CONFIG_KEY);
    if (!key) return false;
    
    const data = {
      ...config,
      lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Failed to save config:', error);
    return false;
  }
};

/**
 * Load user configuration
 */
export const loadConfig = (walletAddress) => {
  try {
    const key = getKey(walletAddress, CONFIG_KEY);
    if (!key) return null;
    
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to load config:', error);
    return null;
  }
};

/**
 * Save AI decision history
 */
export const saveDecision = (walletAddress, decision) => {
  try {
    const key = getKey(walletAddress, HISTORY_KEY);
    if (!key) return false;
    
    const history = loadHistory(walletAddress) || [];
    history.unshift({
      ...decision,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 100 decisions
    const trimmed = history.slice(0, 100);
    localStorage.setItem(key, JSON.stringify(trimmed));
    return true;
  } catch (error) {
    console.error('Failed to save decision:', error);
    return false;
  }
};

/**
 * Load AI decision history
 */
export const loadHistory = (walletAddress) => {
  try {
    const key = getKey(walletAddress, HISTORY_KEY);
    if (!key) return [];
    
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to load history:', error);
    return [];
  }
};

/**
 * Save favorite strategies
 */
export const saveFavorites = (walletAddress, favorites) => {
  try {
    const key = getKey(walletAddress, FAVORITES_KEY);
    if (!key) return false;
    
    localStorage.setItem(key, JSON.stringify(favorites));
    return true;
  } catch (error) {
    console.error('Failed to save favorites:', error);
    return false;
  }
};

/**
 * Load favorite strategies
 */
export const loadFavorites = (walletAddress) => {
  try {
    const key = getKey(walletAddress, FAVORITES_KEY);
    if (!key) return [];
    
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to load favorites:', error);
    return [];
  }
};

/**
 * Export all user data
 */
export const exportUserData = (walletAddress) => {
  try {
    const data = {
      walletAddress,
      config: loadConfig(walletAddress),
      history: loadHistory(walletAddress),
      favorites: loadFavorites(walletAddress),
      exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompttrading-backup-${walletAddress.slice(0, 8)}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Failed to export data:', error);
    return false;
  }
};

/**
 * Import user data
 */
export const importUserData = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        if (!data.walletAddress) {
          throw new Error('Invalid backup file: missing wallet address');
        }
        
        // Restore data
        if (data.config) saveConfig(data.walletAddress, data.config);
        if (data.favorites) saveFavorites(data.walletAddress, data.favorites);
        if (data.history) {
          const key = getKey(data.walletAddress, HISTORY_KEY);
          localStorage.setItem(key, JSON.stringify(data.history));
        }
        
        resolve(data.walletAddress);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

/**
 * Clear all user data
 */
export const clearUserData = (walletAddress) => {
  try {
    const keys = [CONFIG_KEY, HISTORY_KEY, FAVORITES_KEY];
    keys.forEach(type => {
      const key = getKey(walletAddress, type);
      if (key) localStorage.removeItem(key);
    });
    return true;
  } catch (error) {
    console.error('Failed to clear data:', error);
    return false;
  }
};

/**
 * Get storage usage stats
 */
export const getStorageStats = (walletAddress) => {
  try {
    const config = loadConfig(walletAddress);
    const history = loadHistory(walletAddress);
    const favorites = loadFavorites(walletAddress);
    
    const sizes = {
      config: JSON.stringify(config).length,
      history: JSON.stringify(history).length,
      favorites: JSON.stringify(favorites).length
    };
    
    return {
      totalBytes: Object.values(sizes).reduce((a, b) => a + b, 0),
      totalKB: (Object.values(sizes).reduce((a, b) => a + b, 0) / 1024).toFixed(2),
      counts: {
        decisions: history.length,
        favorites: favorites.length
      },
      sizes
    };
  } catch (error) {
    console.error('Failed to get storage stats:', error);
    return null;
  }
};

