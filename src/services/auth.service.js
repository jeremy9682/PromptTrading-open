/**
 * Auth Service
 * Handles communication with backend auth endpoints
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';

/**
 * Check authentication status with backend
 * @param {string} accessToken - Privy access token
 */
export const checkAuthStatus = async (accessToken) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/status`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    return await response.json();
  } catch (error) {
    console.error('Auth status check failed:', error);
    return { success: false, authenticated: false, error: error.message };
  }
};

/**
 * Verify token with backend
 * @param {string} accessToken - Privy access token
 */
export const verifyToken = async (accessToken) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    return await response.json();
  } catch (error) {
    console.error('Token verification failed:', error);
    return { success: false, valid: false, error: error.message };
  }
};

/**
 * Get current user profile from backend
 * @param {string} accessToken - Privy access token
 */
export const getCurrentUser = async (accessToken) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Get current user failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Sync user data with backend after login
 * Creates or updates user record in backend database
 * @param {string} accessToken - Privy access token
 */
export const syncUserData = async (accessToken) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('User sync failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Create authenticated fetch wrapper
 * @param {function} getAccessToken - Function to get access token from Privy
 */
export const createAuthenticatedFetch = (getAccessToken) => {
  return async (url, options = {}) => {
    try {
      const token = await getAccessToken();
      const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      };
      return fetch(url, { ...options, headers });
    } catch (error) {
      console.error('Authenticated fetch failed:', error);
      throw error;
    }
  };
};

export default {
  checkAuthStatus,
  verifyToken,
  getCurrentUser,
  syncUserData,
  createAuthenticatedFetch,
};
