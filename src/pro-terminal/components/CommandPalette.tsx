import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  TrendingUp,
  BarChart3,
  Star,
  Layout,
  Settings,
  Keyboard,
  X,
  ArrowRight,
  Zap,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { useProTerminal } from '../context/ProTerminalContext';
import { UnifiedMarketEvent } from '../../types/markets';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

type CommandCategory = 'markets' | 'actions' | 'navigation' | 'recent';

interface Command {
  id: string;
  category: CommandCategory;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  shortcut?: string;
  action: () => void;
  keywords?: string[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const {
    events,
    setSelectedEvent,
    addToWatchlist,
    watchlist,
  } = useProTerminal();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<CommandCategory | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Recent markets (from watchlist or recently viewed)
  const recentMarkets = useMemo(() => {
    return events.filter(e => watchlist.includes(e.id)).slice(0, 5);
  }, [events, watchlist]);

  // Build command list
  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // Recent markets
    recentMarkets.forEach(market => {
      cmds.push({
        id: `recent-${market.id}`,
        category: 'recent',
        icon: <Clock size={16} className="text-gray-400" />,
        title: market.title,
        subtitle: `${(market.yesPrice! * 100).toFixed(0)}¢ YES`,
        action: () => {
          setSelectedEvent(market);
          onClose();
        },
        keywords: [market.title, market.category, 'recent', 'history'],
      });
    });

    // All markets
    events.slice(0, 50).forEach(market => {
      cmds.push({
        id: `market-${market.id}`,
        category: 'markets',
        icon: <TrendingUp size={16} className="text-green-400" />,
        title: market.title,
        subtitle: `${(market.yesPrice! * 100).toFixed(0)}¢ YES • Vol: $${(market.volume / 1000).toFixed(0)}K`,
        action: () => {
          setSelectedEvent(market);
          onClose();
        },
        keywords: [market.title, market.category, market.source],
      });
    });

    // Quick actions
    cmds.push({
      id: 'action-watchlist',
      category: 'actions',
      icon: <Star size={16} className="text-yellow-400" />,
      title: 'Add to Watchlist',
      subtitle: 'Add current market to watchlist',
      shortcut: '⌘W',
      action: () => {
        // This would add current market to watchlist
        onClose();
      },
      keywords: ['watchlist', 'favorite', 'save', 'star'],
    });

    cmds.push({
      id: 'action-refresh',
      category: 'actions',
      icon: <Zap size={16} className="text-blue-400" />,
      title: 'Refresh All Data',
      subtitle: 'Reload market data and charts',
      shortcut: '⌘R',
      action: () => {
        window.location.reload();
      },
      keywords: ['refresh', 'reload', 'update'],
    });

    // Navigation
    cmds.push({
      id: 'nav-crypto',
      category: 'navigation',
      icon: <Layout size={16} className="text-purple-400" />,
      title: 'Switch to Crypto Layout',
      action: () => {
        // This would switch layout
        onClose();
      },
      keywords: ['layout', 'crypto', 'bitcoin'],
    });

    cmds.push({
      id: 'nav-politics',
      category: 'navigation',
      icon: <Layout size={16} className="text-purple-400" />,
      title: 'Switch to Politics Layout',
      action: () => {
        onClose();
      },
      keywords: ['layout', 'politics', 'election'],
    });

    cmds.push({
      id: 'nav-settings',
      category: 'navigation',
      icon: <Settings size={16} className="text-gray-400" />,
      title: 'Open Settings',
      shortcut: '⌘,',
      action: () => {
        onClose();
      },
      keywords: ['settings', 'preferences', 'config'],
    });

    cmds.push({
      id: 'nav-shortcuts',
      category: 'navigation',
      icon: <Keyboard size={16} className="text-gray-400" />,
      title: 'Keyboard Shortcuts',
      shortcut: '⌘/',
      action: () => {
        onClose();
      },
      keywords: ['keyboard', 'shortcuts', 'hotkeys'],
    });

    return cmds;
  }, [events, recentMarkets, setSelectedEvent, onClose]);

  // Filter commands based on query and category
  const filteredCommands = useMemo(() => {
    let filtered = commands;

    // Filter by category
    if (activeCategory !== 'all') {
      filtered = filtered.filter(cmd => cmd.category === activeCategory);
    }

    // Filter by query
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(cmd => {
        const searchText = [
          cmd.title,
          cmd.subtitle,
          ...(cmd.keywords || []),
        ].join(' ').toLowerCase();
        return searchText.includes(lowerQuery);
      });
    }

    return filtered;
  }, [commands, query, activeCategory]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<CommandCategory, Command[]> = {
      recent: [],
      markets: [],
      actions: [],
      navigation: [],
    };

    filteredCommands.forEach(cmd => {
      groups[cmd.category].push(cmd);
    });

    return groups;
  }, [filteredCommands]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          e.preventDefault();
          // Cycle through categories
          const categories: (CommandCategory | 'all')[] = ['all', 'recent', 'markets', 'actions', 'navigation'];
          const currentIdx = categories.indexOf(activeCategory);
          setActiveCategory(categories[(currentIdx + 1) % categories.length]);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, activeCategory, onClose]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setActiveCategory('all');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    selectedEl?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  const categoryLabels: Record<CommandCategory, string> = {
    recent: 'Recent',
    markets: 'Markets',
    actions: 'Actions',
    navigation: 'Navigation',
  };

  let globalIndex = 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-full max-w-2xl bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <Search size={20} className="text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search markets, commands..."
            className="flex-1 bg-transparent text-white text-lg placeholder-gray-500 focus:outline-none"
          />
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">esc</kbd>
            <span>to close</span>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-800 overflow-x-auto">
          {(['all', 'recent', 'markets', 'actions', 'navigation'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                setSelectedIndex(0);
              }}
              className={`px-3 py-1 text-xs rounded-full transition-colors whitespace-nowrap ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {cat === 'all' ? 'All' : categoryLabels[cat]}
              {cat !== 'all' && (
                <span className="ml-1 text-gray-500">
                  ({groupedCommands[cat].length})
                </span>
              )}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-[10px] text-gray-600">
            Press <kbd className="px-1 bg-gray-800 rounded">Tab</kbd> to switch
          </span>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[400px] overflow-auto"
        >
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Search size={32} className="mx-auto mb-2 opacity-30" />
              <p>No results found for "{query}"</p>
            </div>
          ) : (
            <>
              {(['recent', 'markets', 'actions', 'navigation'] as CommandCategory[]).map(category => {
                const categoryCommands = groupedCommands[category];
                if (categoryCommands.length === 0) return null;

                return (
                  <div key={category}>
                    <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-gray-500 bg-gray-900/50 sticky top-0">
                      {categoryLabels[category]}
                    </div>
                    {categoryCommands.map((cmd) => {
                      const currentIndex = globalIndex++;
                      const isSelected = currentIndex === selectedIndex;

                      return (
                        <div
                          key={cmd.id}
                          data-index={currentIndex}
                          onClick={cmd.action}
                          onMouseEnter={() => setSelectedIndex(currentIndex)}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-600/20' : 'hover:bg-gray-800/50'
                          }`}
                        >
                          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800">
                            {cmd.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{cmd.title}</div>
                            {cmd.subtitle && (
                              <div className="text-xs text-gray-500 truncate">{cmd.subtitle}</div>
                            )}
                          </div>
                          {cmd.shortcut && (
                            <kbd className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded">
                              {cmd.shortcut}
                            </kbd>
                          )}
                          {isSelected && (
                            <ChevronRight size={16} className="text-blue-400 flex-shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-800 text-[10px] text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-gray-800 rounded">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 bg-gray-800 rounded">↵</kbd> select
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1 bg-gray-800 rounded">⌘K</kbd> to toggle
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandPalette;
