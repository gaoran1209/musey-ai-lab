import React, { useState, useEffect } from 'react';

export function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const [hasKey, setHasKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkKey = async () => {
      try {
        // @ts-ignore
        const has = await window.aistudio?.hasSelectedApiKey();
        setHasKey(!!has);
      } catch (e) {
        console.error("Error checking API key:", e);
      } finally {
        setIsLoading(false);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    try {
      // @ts-ignore
      await window.aistudio?.openSelectKey();
      // Assume success to mitigate race condition
      setHasKey(true);
    } catch (e) {
      console.error("Error opening API key selector:", e);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-700 border-t-blue-500"></div>
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-neutral-950 text-white px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-600/20 border border-white/10">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
          </div>
          <h1 className="mb-4 text-2xl font-semibold tracking-tight">API Key Required</h1>
          <p className="mb-8 text-neutral-400 leading-relaxed">
            To use the high-quality Gemini 3.1 Flash Image Preview model for image editing, you need to select a paid Google Cloud API key.
            <br/><br/>
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-4">Learn more about billing</a>
          </p>
          <button
            onClick={handleSelectKey}
            className="rounded-full bg-white px-8 py-3 text-sm font-medium text-black transition-all hover:bg-neutral-200 hover:scale-105 active:scale-95"
          >
            Select API Key
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
