/**
 * LoginButton Component
 * Triggers Privy login modal for email, social, or wallet auth
 */

import React from 'react';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const LoginButton = ({
  language = 'en',
  className = '',
  variant = 'default' // 'default' | 'outline' | 'gradient'
}) => {
  const { ready, login } = useAuth();

  const handleLogin = () => {
    if (ready) {
      login();
    }
  };

  const baseClasses = 'flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all';

  const variantClasses = {
    default: 'bg-blue-600 hover:bg-blue-700 text-white',
    outline: 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white',
    gradient: 'bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 text-white',
  };

  return (
    <button
      onClick={handleLogin}
      disabled={!ready}
      className={`${baseClasses} ${variantClasses[variant]} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {!ready ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          <span className="hidden sm:inline">
            {language === 'zh' ? '加载中...' : 'Loading...'}
          </span>
        </>
      ) : (
        <>
          <LogIn size={18} />
          <span className="hidden sm:inline">
            {language === 'zh' ? '登录 / 注册' : 'Login / Sign Up'}
          </span>
          <span className="sm:hidden">
            {language === 'zh' ? '登录' : 'Login'}
          </span>
        </>
      )}
    </button>
  );
};

export default LoginButton;
