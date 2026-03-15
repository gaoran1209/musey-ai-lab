import React, { createContext, useContext, useState, useEffect } from 'react';

export interface HistoryRecord {
  id: string;
  requestTime: number;
  prompt: string;
  responseTime?: number;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
  errorCode?: string;
  isRetry?: boolean;
}

interface HistoryContextType {
  history: HistoryRecord[];
  addRecord: (record: HistoryRecord) => void;
  updateRecord: (id: string, updates: Partial<HistoryRecord>) => void;
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<HistoryRecord[]>(() => {
    const saved = localStorage.getItem('muse-history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('muse-history', JSON.stringify(history));
  }, [history]);

  const addRecord = (record: HistoryRecord) => {
    setHistory((prev) => [record, ...prev]);
  };

  const updateRecord = (id: string, updates: Partial<HistoryRecord>) => {
    setHistory((prev) =>
      prev.map((record) => (record.id === id ? { ...record, ...updates } : record))
    );
  };

  return (
    <HistoryContext.Provider value={{ history, addRecord, updateRecord }}>
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return context;
}
