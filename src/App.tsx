/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FlowCanvas } from './components/FlowCanvas';
import { Sparkles, BookOpen } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { HistoryProvider } from './components/HistoryContext';

export default function App() {
  return (
    <HistoryProvider>
      <div className="h-screen w-screen overflow-hidden bg-[#0a0a0a] text-white font-sans selection:bg-blue-500/30">
        <Sidebar />
        {/* Header */}
        <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-6 pointer-events-none">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-[linear-gradient(135deg,rgba(97,106,255,0.95),rgba(138,92,246,0.92))] shadow-[0_12px_32px_rgba(88,101,242,0.28),inset_0_1px_0_rgba(255,255,255,0.18)]">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-semibold tracking-tight text-white/95 drop-shadow-md">MUSEY AI Lab</h1>
              <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/35">Creative Canvas</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-sm font-medium text-neutral-300">Nano Banana 2</span>
            </div>
            <a
              href="/docs.html"
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/20"
              title="Musey AI Lab Docs"
            >
              <BookOpen className="h-4 w-4 text-neutral-300" />
            </a>
          </div>
        </header>

        {/* Main Canvas */}
        <main className="h-full w-full">
          <FlowCanvas />
        </main>
      </div>
    </HistoryProvider>
  );
}
