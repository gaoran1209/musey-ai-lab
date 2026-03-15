/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FlowCanvas } from './components/FlowCanvas';
import { ApiKeyGate } from './components/ApiKeyGate';
import { Sparkles } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { HistoryProvider } from './components/HistoryContext';

export default function App() {
  return (
    <ApiKeyGate>
      <HistoryProvider>
        <div className="h-screen w-screen overflow-hidden bg-[#0a0a0a] text-white font-sans selection:bg-blue-500/30">
          <Sidebar />
          {/* Header */}
          <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-6 pointer-events-none">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/20">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-white/90 drop-shadow-md">MUSE AI Lab</h1>
            </div>
            
            <div className="flex items-center gap-3 rounded-full bg-white/5 px-4 py-2 backdrop-blur-md border border-white/10">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-sm font-medium text-neutral-300">Gemini 3.1 Flash</span>
            </div>
          </header>

          {/* Main Canvas */}
          <main className="h-full w-full">
            <FlowCanvas />
          </main>
        </div>
      </HistoryProvider>
    </ApiKeyGate>
  );
}
