import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

import type { ToyAnalysisResult } from '@/features/toy-analysis/types/toy-analysis';

type ToyAnalysisResultContextValue = {
  result: ToyAnalysisResult | null;
  setResult: (result: ToyAnalysisResult | null) => void;
};

const ToyAnalysisResultContext = createContext<ToyAnalysisResultContextValue | null>(
  null,
);

export function ToyAnalysisResultProvider({ children }: { children: ReactNode }) {
  const [result, setResult] = useState<ToyAnalysisResult | null>(null);
  const value = useMemo(() => ({ result, setResult }), [result]);

  return (
    <ToyAnalysisResultContext.Provider value={value}>
      {children}
    </ToyAnalysisResultContext.Provider>
  );
}

export function useToyAnalysisResult(): ToyAnalysisResultContextValue {
  const context = useContext(ToyAnalysisResultContext);

  if (!context) {
    throw new Error('useToyAnalysisResult must be used within its provider.');
  }

  return context;
}
