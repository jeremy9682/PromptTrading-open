import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { UnifiedMarketEvent } from '../../services/markets/types';
import { marketService } from '../../services/markets/marketService';

interface ProTerminalContextType {
  // Selected event for trading
  selectedEvent: UnifiedMarketEvent | null;
  setSelectedEvent: (event: UnifiedMarketEvent | null) => void;

  // All loaded events
  events: UnifiedMarketEvent[];
  isLoadingEvents: boolean;
  loadEvents: (forceRefresh?: boolean) => Promise<void>;

  // Watchlist (event IDs)
  watchlist: string[];
  addToWatchlist: (eventId: string) => void;
  removeFromWatchlist: (eventId: string) => void;
  isInWatchlist: (eventId: string) => boolean;

  // Category filter
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Filtered events
  filteredEvents: UnifiedMarketEvent[];
}

const ProTerminalContext = createContext<ProTerminalContextType | undefined>(undefined);

export function ProTerminalProvider({ children }: { children: React.ReactNode }) {
  const [selectedEvent, setSelectedEvent] = useState<UnifiedMarketEvent | null>(null);
  const [events, setEvents] = useState<UnifiedMarketEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Load events from market service
  const loadEvents = useCallback(async (forceRefresh = false) => {
    setIsLoadingEvents(true);
    try {
      const data = await marketService.getActiveMarkets(forceRefresh, 200, 0);
      setEvents(data);

      // Auto-select first event if none selected
      if (!selectedEvent && data.length > 0) {
        setSelectedEvent(data[0]);
      }
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [selectedEvent]);

  // Load events on mount
  useEffect(() => {
    loadEvents();
  }, []);

  // Watchlist functions
  const addToWatchlist = useCallback((eventId: string) => {
    setWatchlist(prev => prev.includes(eventId) ? prev : [...prev, eventId]);
  }, []);

  const removeFromWatchlist = useCallback((eventId: string) => {
    setWatchlist(prev => prev.filter(id => id !== eventId));
  }, []);

  const isInWatchlist = useCallback((eventId: string) => {
    return watchlist.includes(eventId);
  }, [watchlist]);

  // Filtered events based on category and search
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Category filter
      if (selectedCategory !== 'all') {
        const categoryLower = event.category?.toLowerCase() || '';
        if (!categoryLower.includes(selectedCategory.toLowerCase())) {
          return false;
        }
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = event.title.toLowerCase().includes(query);
        const matchesDescription = event.description?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDescription) {
          return false;
        }
      }

      return true;
    });
  }, [events, selectedCategory, searchQuery]);

  const value: ProTerminalContextType = {
    selectedEvent,
    setSelectedEvent,
    events,
    isLoadingEvents,
    loadEvents,
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    isInWatchlist,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    filteredEvents,
  };

  return (
    <ProTerminalContext.Provider value={value}>
      {children}
    </ProTerminalContext.Provider>
  );
}

export function useProTerminal() {
  const context = useContext(ProTerminalContext);
  if (!context) {
    throw new Error('useProTerminal must be used within a ProTerminalProvider');
  }
  return context;
}
