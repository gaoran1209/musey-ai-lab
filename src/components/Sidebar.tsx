import React, { useState, useRef, useEffect } from 'react';
import { Plus, Shapes, Users, Image as ImageIcon, Accessibility, LayoutTemplate, Settings, ImagePlus, Video, History, Globe, Info, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useHistory } from './HistoryContext';

export function Sidebar() {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  
  const addMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  
  const { history } = useHistory();

  const handleAddImageNode = () => {
    window.dispatchEvent(new CustomEvent('add-image-node'));
    setIsAddMenuOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setIsAddMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        // Don't close history if clicking the history button in user menu
        const target = event.target as Element;
        if (!target.closest('.history-toggle-btn')) {
          setIsHistoryOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTime = (timestamp: number) => {
    return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(timestamp);
  };

  return (
    <>
      <div className="fixed left-4 top-1/2 -translate-y-1/2 bg-white/5 backdrop-blur-xl border border-white/20 rounded-full py-4 px-2 flex flex-col items-center gap-4 z-50 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]">
        <div className="relative" ref={addMenuRef}>
          <button 
            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
            className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:bg-neutral-200 transition-colors shadow-lg group relative"
          >
            <Plus className="w-5 h-5" />
            {!isAddMenuOpen && (
              <div className="absolute left-full ml-4 px-2 py-1 bg-[#2A2A2A] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap border border-white/10">
                {language === 'zh' ? '新增节点' : 'Add Node'}
              </div>
            )}
          </button>

          {isAddMenuOpen && (
            <div className="absolute left-full ml-4 top-0 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-2 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] flex flex-col gap-1 min-w-[140px]">
              <button 
                onClick={handleAddImageNode}
                className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 rounded-lg transition-colors text-left"
              >
                <ImagePlus className="w-4 h-4" />
                {language === 'zh' ? '图像节点' : 'Image Node'}
              </button>
              <button 
                disabled
                className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-400 rounded-lg cursor-not-allowed text-left"
                title="Coming Soon"
              >
                <Video className="w-4 h-4" />
                {language === 'zh' ? '视频节点 (即将推出)' : 'Video Node (Coming Soon)'}
              </button>
            </div>
          )}
        </div>
        
        <div className="w-6 h-[1px] bg-white/10 my-1" />

        <div className="flex flex-col gap-3">
          <SidebarIcon icon={<Shapes className="w-5 h-5" />} tooltip={language === 'zh' ? '商品库' : 'Products'} />
          <SidebarIcon icon={<Users className="w-5 h-5" />} tooltip={language === 'zh' ? '模特库' : 'Models'} />
          <SidebarIcon icon={<ImageIcon className="w-5 h-5" />} tooltip={language === 'zh' ? '背景库' : 'Backgrounds'} />
          <SidebarIcon icon={<Accessibility className="w-5 h-5" />} tooltip={language === 'zh' ? '姿势库' : 'Poses'} />
          <SidebarIcon icon={<LayoutTemplate className="w-5 h-5" />} tooltip={language === 'zh' ? '模板库' : 'Templates'} />
        </div>

        <div className="w-6 h-[1px] bg-white/10 my-1" />

        <div className="relative" ref={userMenuRef}>
          <button 
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="w-8 h-8 rounded-full overflow-hidden border border-white/20 hover:border-white/50 transition-colors group relative"
          >
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" className="w-full h-full object-cover" />
            {!isUserMenuOpen && (
              <div className="absolute left-full ml-4 px-2 py-1 bg-[#2A2A2A] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap border border-white/10">
                {language === 'zh' ? '用户菜单' : 'User Menu'}
              </div>
            )}
          </button>

          {isUserMenuOpen && (
            <div className="absolute left-full ml-4 bottom-0 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-2 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] flex flex-col gap-1 min-w-[160px]">
              <button 
                onClick={() => setLanguage(l => l === 'zh' ? 'en' : 'zh')}
                className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 rounded-lg transition-colors text-left"
              >
                <Globe className="w-4 h-4" />
                {language === 'zh' ? 'English' : '中文'}
              </button>
              <button 
                onClick={() => {
                  setIsHistoryOpen(!isHistoryOpen);
                  setIsUserMenuOpen(false);
                }}
                className="history-toggle-btn flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 rounded-lg transition-colors text-left"
              >
                <History className="w-4 h-4" />
                {language === 'zh' ? '历史记录' : 'History'}
              </button>
              <div className="h-[1px] bg-white/10 my-1" />
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-400">
                <Info className="w-3.5 h-3.5" />
                Version v0.1
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History Panel */}
      {isHistoryOpen && (
        <div 
          ref={historyRef}
          className="fixed left-24 top-1/2 -translate-y-1/2 w-80 max-h-[80vh] bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] flex flex-col z-40 overflow-hidden animate-fade-in"
        >
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
            <h3 className="font-medium text-white flex items-center gap-2">
              <History className="w-4 h-4" />
              {language === 'zh' ? '历史记录' : 'History'}
            </h3>
            <button 
              onClick={() => setIsHistoryOpen(false)}
              className="text-neutral-400 hover:text-white transition-colors"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {history.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-sm">
                {language === 'zh' ? '暂无记录' : 'No history yet'}
              </div>
            ) : (
              history.map((record) => (
                <div key={record.id} className="p-3 rounded-xl bg-black/20 border border-white/5 hover:bg-black/30 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <Clock className="w-3.5 h-3.5" />
                      {formatTime(record.requestTime)}
                      {record.isRetry && (
                        <span className="ml-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]">
                          {language === 'zh' ? '重试' : 'Retry'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {record.status === 'pending' && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
                      {record.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      {record.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                      <span className={`text-xs ${
                        record.status === 'pending' ? 'text-blue-400' :
                        record.status === 'success' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {record.status === 'pending' ? (language === 'zh' ? '生成中' : 'Generating') :
                         record.status === 'success' ? (language === 'zh' ? '成功' : 'Success') :
                         (language === 'zh' ? '失败' : 'Error')}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-white/90 line-clamp-2" title={record.prompt}>
                    {record.prompt || (language === 'zh' ? '[无提示词]' : '[No prompt]')}
                  </p>
                  
                  {record.status === 'error' && (record.errorMessage || record.errorCode) && (
                    <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                      {record.errorCode && (
                        <div className="text-[10px] font-mono text-red-400/80 mb-0.5">
                          {language === 'zh' ? '错误码: ' : 'Code: '}{record.errorCode}
                        </div>
                      )}
                      {record.errorMessage && (
                        <div className="text-xs text-red-400 line-clamp-2" title={record.errorMessage}>
                          {record.errorMessage}
                        </div>
                      )}
                    </div>
                  )}

                  {record.responseTime && (
                    <div className="mt-2 text-xs text-neutral-500">
                      {language === 'zh' ? '耗时: ' : 'Took: '}
                      {((record.responseTime - record.requestTime) / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SidebarIcon({ icon, tooltip }: { icon: React.ReactNode; tooltip: string }) {
  return (
    <button className="w-10 h-10 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full flex items-center justify-center transition-colors relative group">
      {icon}
      <div className="absolute left-full ml-4 px-2 py-1 bg-[#2A2A2A] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap border border-white/10">
        {tooltip}
      </div>
    </button>
  );
}
