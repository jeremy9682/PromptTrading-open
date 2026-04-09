/**
 * ProtectedRoute Component
 * Wraps routes that require authentication
 * Redirects to login or shows loading state as needed
 */

import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

/**
 * ProtectedRoute
 * @param {React.ReactNode} children - Content to render when authenticated
 * @param {React.ReactNode} fallback - Optional custom fallback when not authenticated
 * @param {boolean} requireWallet - If true, also requires a wallet to be connected
 */
export const ProtectedRoute = ({
  children,
  fallback,
  requireWallet = false,
}) => {
  const { ready, authenticated, login, primaryWallet } = useAuth();

  // Show loading while Privy initializes
  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show fallback or login prompt
  if (!authenticated) {
    if (fallback) return fallback;

    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Authentication Required
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please sign in to access this feature. You can use email, Google, Apple, or connect your wallet.
          </p>
          <button
            onClick={login}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Sign In / Sign Up
          </button>
        </div>
      </div>
    );
  }

  // Authenticated but wallet required and not connected
  if (requireWallet && !primaryWallet) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-yellow-600 dark:text-yellow-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Wallet Required
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            This feature requires a connected wallet. Please wait for your embedded wallet to initialize or connect an external wallet.
          </p>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
            Initializing wallet...
          </div>
        </div>
      </div>
    );
  }

  // All checks passed, render children
  return children;
};

export default ProtectedRoute;
