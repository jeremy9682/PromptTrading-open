import React from 'react';
import { Zap, Monitor, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../contexts/useAppStore';

// Check if we're in production environment
const isProduction = import.meta.env.PROD;

const ProModeSwitch = ({ language }) => {
  const navigate = useNavigate();
  const interfaceMode = useAppStore((state) => state.interfaceMode);
  const setInterfaceMode = useAppStore((state) => state.setInterfaceMode);

  const handleSwitchToPro = () => {
    // Only allow in non-production environments
    if (isProduction) return;
    setInterfaceMode('pro');
    navigate('/pro');
  };

  const handleSwitchToStandard = () => {
    setInterfaceMode('standard');
    navigate('/');
  };

  // 如果当前是 Pro 模式，显示返回 Standard 的按钮
  if (interfaceMode === 'pro') {
    return (
      <button
        onClick={handleSwitchToStandard}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
        title={language === 'zh' ? '返回标准界面' : 'Back to Standard'}
      >
        <Monitor size={16} className="text-gray-600 dark:text-gray-400" />
        <span className="text-gray-700 dark:text-gray-300 text-sm font-medium hidden sm:inline">
          {language === 'zh' ? '标准' : 'Standard'}
        </span>
      </button>
    );
  }

  // Production: Show disabled button with "Coming Soon"
  if (isProduction) {
    return (
      <button
        disabled
        className="group relative flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300 overflow-hidden cursor-not-allowed opacity-60
          bg-gradient-to-r from-gray-500/10 via-gray-500/10 to-gray-500/10
          border border-gray-500/30
          dark:from-gray-500/5 dark:via-gray-500/5 dark:to-gray-500/5"
        title={language === 'zh' ? '专业终端即将推出' : 'Pro Terminal Coming Soon'}
      >
        {/* Icon */}
        <div className="relative">
          <Zap
            size={16}
            className="text-gray-500 dark:text-gray-400"
          />
        </div>

        {/* Text */}
        <span className="relative text-gray-500 dark:text-gray-400 text-sm font-semibold hidden sm:inline">
          Pro
        </span>

        {/* Coming Soon Badge */}
        <span className="relative hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-gray-500/20 text-gray-500 dark:text-gray-400 border border-gray-500/30">
          <Lock size={8} />
          {language === 'zh' ? '即将推出' : 'Soon'}
        </span>
      </button>
    );
  }

  // Development/Test: Show clickable Pro button
  return (
    <button
      onClick={handleSwitchToPro}
      className="group relative flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300 overflow-hidden
        bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10
        hover:from-amber-500/20 hover:via-orange-500/20 hover:to-amber-500/20
        border border-amber-500/30 hover:border-amber-500/50
        dark:from-amber-500/5 dark:via-orange-500/5 dark:to-amber-500/5
        dark:hover:from-amber-500/15 dark:hover:via-orange-500/15 dark:hover:to-amber-500/15"
      title={language === 'zh' ? '切换到专业交易终端 (开发模式)' : 'Switch to Pro Terminal (Dev Mode)'}
    >
      {/* Animated gradient border effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 opacity-0 group-hover:opacity-10 transition-opacity duration-300" />

      {/* Icon with glow effect */}
      <div className="relative">
        <Zap
          size={16}
          className="text-amber-500 dark:text-amber-400 group-hover:text-amber-400 dark:group-hover:text-amber-300 transition-colors fill-amber-500/20"
        />
        <div className="absolute inset-0 blur-sm bg-amber-400/30 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Text */}
      <span className="relative text-amber-600 dark:text-amber-400 text-sm font-semibold group-hover:text-amber-500 dark:group-hover:text-amber-300 transition-colors hidden sm:inline">
        Pro
      </span>

      {/* Dev Badge */}
      <span className="relative hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
        {language === 'zh' ? '开发' : 'Dev'}
      </span>
    </button>
  );
};

export default ProModeSwitch;
