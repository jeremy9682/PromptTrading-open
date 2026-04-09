import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Brain,
  GraduationCap,
  Wallet,
  Home,
} from 'lucide-react';

const MobileBottomNav = ({ activeTab, language, t }) => {
  const navigate = useNavigate();
  const navItems = [
    {
      id: 'dashboard',
      path: '/',
      icon: BarChart3,
      label: language === 'zh' ? '交易' : 'Trade',
    },
    {
      id: 'ai-setup',
      path: '/ai-setup',
      icon: Brain,
      label: t[language].aiConfig,
    },
    {
      id: 'learn',
      path: '/learn',
      icon: GraduationCap,
      label: t[language].learn,
    },
    // Wallet Tab - DISABLED: Wallet management moved to user dropdown menu with Privy
    // {
    //   id: 'wallet',
    //   path: '/wallet',
    //   icon: Wallet,
    //   label: t[language].wallet,
    // },
  ];

  return (
    // 关键：md:hidden 确保桌面端完全不显示
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 z-50 safe-area-inset-bottom">
      <div className="grid grid-cols-3 h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center gap-1 transition-colors relative ${
                isActive
                  ? 'text-blue-400 bg-blue-500/10'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
              }`}
            >
              <Icon size={20} className="flex-shrink-0" />
              <span className="text-[10px] font-medium truncate w-full text-center px-1">
                {item.label.length > 8
                  ? item.label.substring(0, 7) + '...'
                  : item.label}
              </span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileBottomNav;
