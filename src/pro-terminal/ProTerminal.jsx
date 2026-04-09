import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap,
  LayoutGrid,
  TrendingUp,
  BarChart3,
  Newspaper,
  Bot,
  Settings,
  ChevronDown,
  Monitor,
  Save,
  RotateCcw,
  Maximize2,
  PanelLeft,
  Search,
  Command,
} from 'lucide-react';
import { useAppStore } from '../contexts/useAppStore';
import { useAuth } from '../contexts/AuthContext';
import { LoginButton, UserMenu } from '../components/auth';
import { DockviewLayout } from './layout/DockviewLayout';
import { ProTerminalProvider } from './context/ProTerminalContext';
import CommandPalette from './components/CommandPalette';

const ProTerminal = () => {
  const navigate = useNavigate();
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const setInterfaceMode = useAppStore((state) => state.setInterfaceMode);
  const currentProLayout = useAppStore((state) => state.currentProLayout);
  const setCurrentProLayout = useAppStore((state) => state.setCurrentProLayout);
  const saveProLayout = useAppStore((state) => state.saveProLayout);
  const isPaperTrading = useAppStore((state) => state.isPaperTrading);
  const setIsPaperTrading = useAppStore((state) => state.setIsPaperTrading);
  const { authenticated } = useAuth();

  const dockviewApiRef = useRef(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Keyboard shortcut for command palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleBackToStandard = () => {
    setInterfaceMode('standard');
    navigate('/');
  };

  const handleLayoutChange = useCallback((api) => {
    dockviewApiRef.current = api;
  }, []);

  const handleSaveLayout = useCallback(() => {
    if (dockviewApiRef.current) {
      const layoutData = dockviewApiRef.current.toJSON();
      const layoutName = `custom-${Date.now()}`;
      saveProLayout(layoutName, layoutData);
      console.log('Layout saved:', layoutName);
    }
  }, [saveProLayout]);

  const handleResetLayout = useCallback(() => {
    // Re-trigger layout load by forcing a state update
    const current = currentProLayout;
    setCurrentProLayout('');
    setTimeout(() => setCurrentProLayout(current), 0);
  }, [currentProLayout, setCurrentProLayout]);

  const layoutPresets = [
    { id: 'crypto', name: language === 'zh' ? '加密货币' : 'Crypto', icon: TrendingUp },
    { id: 'fed', name: language === 'zh' ? '美联储利率' : 'Fed Rates', icon: BarChart3 },
    { id: 'election', name: language === 'zh' ? '选举' : 'Election', icon: LayoutGrid },
    { id: 'multi-asset', name: language === 'zh' ? '多资产' : 'Multi-Asset', icon: PanelLeft },
  ];

  return (
    <ProTerminalProvider>
    <div className="pro-terminal h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        {/* Left: Logo & Market Tabs */}
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 pr-4 border-r border-gray-700">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Zap size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg hidden sm:inline">PolyTerm</span>
          </div>

          {/* Market Tabs */}
          <div className="flex items-center gap-1">
            <button className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md">
              Polymarket
            </button>
            <button className="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors">
              Kalshi
            </button>
            <button className="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors">
              Global
            </button>
            <button className="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors flex items-center gap-1">
              <Bot size={14} />
              AI Agent
            </button>
          </div>
        </div>

        {/* Right: Search & Settings */}
        <div className="flex items-center gap-3">
          {/* Search / Command Palette Trigger */}
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="hidden md:flex items-center gap-2 w-56 px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-md hover:border-gray-600 transition-colors text-gray-500"
          >
            <Search size={14} />
            <span className="flex-1 text-left">{language === 'zh' ? '搜索市场...' : 'Search markets...'}</span>
            <kbd className="px-1.5 py-0.5 text-[10px] bg-gray-700 rounded">⌘K</kbd>
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
          >
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>

          {/* Language Toggle */}
          <button
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            className="px-2 py-1 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
          >
            {language === 'zh' ? 'EN' : '中文'}
          </button>

          {/* Back to Standard */}
          <button
            onClick={handleBackToStandard}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
          >
            <Monitor size={14} />
            <span className="hidden sm:inline">{language === 'zh' ? '标准版' : 'Standard'}</span>
          </button>

          {/* User Auth */}
          {authenticated ? (
            <UserMenu language={language} />
          ) : (
            <LoginButton language={language} variant="gradient" />
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/50 border-b border-gray-800">
        {/* Left: Tools */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-md transition-colors">
            <BarChart3 size={14} />
            Charts
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-md transition-colors">
            ✏️ Drawing
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-md transition-colors">
            🔔 Alerts
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-md transition-colors">
            <Newspaper size={14} />
            News
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-md transition-colors">
            <Bot size={14} />
            AI
          </button>
        </div>

        {/* Center: Layout Presets */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 mr-2">{language === 'zh' ? '布局:' : 'Layout:'}</span>
          {layoutPresets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setCurrentProLayout(preset.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                currentProLayout === preset.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <preset.icon size={14} />
              {preset.name}
            </button>
          ))}
          <div className="w-px h-6 bg-gray-700 mx-2" />
          <button
            onClick={handleSaveLayout}
            title={language === 'zh' ? '保存布局' : 'Save Layout'}
            className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
          >
            <Save size={14} />
          </button>
          <button
            onClick={handleResetLayout}
            title={language === 'zh' ? '重置布局' : 'Reset Layout'}
            className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Right: Trading Mode */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{language === 'zh' ? '模式:' : 'Mode:'}</span>
          <button
            onClick={() => setIsPaperTrading(!isPaperTrading)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              isPaperTrading
                ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                : 'bg-green-600/20 text-green-400 border border-green-600/30'
            }`}
          >
            {isPaperTrading
              ? (language === 'zh' ? '🎮 模拟盘' : '🎮 Paper')
              : (language === 'zh' ? '💰 实盘' : '💰 Live')}
          </button>
        </div>
      </div>

      {/* Main Content Area - Dockview */}
      <div className="flex-1 bg-gray-950 overflow-hidden">
        {currentProLayout && (
          <DockviewLayout
            layoutId={currentProLayout}
            language={language}
            onLayoutChange={handleLayoutChange}
          />
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900/80 backdrop-blur-sm border-t border-gray-800 text-[11px]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 live-indicator" />
            <span className="text-green-400 font-medium">Polymarket</span>
            <span className="text-gray-600">LIVE</span>
          </span>
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
            Kalshi
          </span>
          <div className="h-3 w-px bg-gray-800" />
          <span className="text-gray-500">
            <kbd className="px-1 py-0.5 bg-gray-800 rounded text-[9px] mr-1">⌘K</kbd>
            {language === 'zh' ? '快速搜索' : 'Quick Search'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-gray-500 font-mono">
          <span className="text-gray-400">
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <span className="text-gray-300">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
      </div>
    </div>
    </ProTerminalProvider>
  );
};

export default ProTerminal;
