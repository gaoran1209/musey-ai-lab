import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import { UploadCloud, Send, Mic, Sparkles, Layout, Image as ImageIcon, Trash2, Download, Video as VideoIcon, Clock, Sparkle, Layers3, X, Plus, Expand } from 'lucide-react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';

export type LinkedImageDirection = 'input' | 'output';

export type ReferenceImageOption = {
  nodeId: string;
  imageSrc: string;
  label: string;
  prompt?: string;
};

export type ImageNodeData = {
  imageSrc?: string;
  isLoading?: boolean;
  title?: string;
  prompt?: string;
  aspectRatio?: number | string;
  error?: string;
  generationParams?: any;
  referenceImages?: ReferenceImageOption[];
  isOutputConnectorActive?: boolean;
  isConnectionTargetMode?: boolean;
  onGenerate?: (nodeId: string, prompt: string, params?: any) => void;
  onCreateLinkedImageNode?: (nodeId: string, direction: LinkedImageDirection) => void;
};

export type ImageNodeType = Node<ImageNodeData, 'imageNode'>;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function ImageNode({ id, data, selected }: NodeProps<ImageNodeType>) {
  const { setNodes, setEdges, updateNodeData } = useReactFlow();
  const [prompt, setPrompt] = useState(() => (typeof data.prompt === 'string' ? data.prompt : ''));
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const promptMirrorRef = useRef<HTMLDivElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const promptRef = useRef(prompt);
  const basePromptRef = useRef('');
  const [mentionState, setMentionState] = useState<{ start: number; end: number; query: string } | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);

  const [model, setModel] = useState('gemini-3.1-image-flash-preview');
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [resolution, setResolution] = useState('2K');
  const [quantity, setQuantity] = useState(1);
  const [targetType, setTargetType] = useState<'image' | 'video'>('image');
  const [videoDuration, setVideoDuration] = useState('4');
  const referenceImages = data.referenceImages || [];
  const outputDragStateRef = useRef<{ pointerId: number | null; startX: number; startY: number; moved: boolean }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
  });

  // Sync state when type changes
  useEffect(() => {
    if (targetType === 'video') {
      setModel('veo-3.1-generate-preview');
      setAspectRatio('9:16');
      setResolution('720p');
      setQuantity(1);
    } else {
      setModel('gemini-3.1-image-flash-preview');
      setAspectRatio('3:4');
      setResolution('2K');
    }
  }, [targetType]);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    if (typeof data.prompt === 'string' && data.prompt !== promptRef.current) {
      setPrompt(data.prompt);
    }
  }, [data.prompt]);

  useEffect(() => {
    if (!selected) {
      setMentionState(null);
      setActiveMentionIndex(0);
    }
  }, [selected]);

  const startRecording = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support Speech Recognition.');
      return;
    }

    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setPrompt((basePromptRef.current ? basePromptRef.current + ' ' : '') + transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    }

    basePromptRef.current = promptRef.current;
    try {
      recognitionRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch(err) {}
      setIsRecording(false);
    }
  }, []);

  const toggleRecording = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (isRecording) {
      stopRecording();
      return;
    }

    startRecording();
  }, [isRecording, startRecording, stopRecording]);

  useEffect(() => {
    if (selected && data.imageSrc && !data.isLoading) {
      // Small delay to ensure it focuses after rendering
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [selected, data.imageSrc, data.isLoading]);

  useEffect(() => {
    if (!isPreviewOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPreviewOpen]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, imageSrc: result } } : n
        )
      );
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || data.isLoading) return;

    if (data.onGenerate) {
      data.onGenerate(id, prompt, { model, aspectRatio, resolution, quantity, targetType, videoDuration });
    }
  };

  const syncMentionState = useCallback((nextPrompt: string, caretPosition: number) => {
    if (!referenceImages.length) {
      setMentionState(null);
      setActiveMentionIndex(0);
      return;
    }

    const beforeCaret = nextPrompt.slice(0, caretPosition);
    const match = beforeCaret.match(/@([^\s@]*)$/);
    if (!match) {
      setMentionState(null);
      setActiveMentionIndex(0);
      return;
    }

    setMentionState({
      start: caretPosition - match[0].length,
      end: caretPosition,
      query: match[1],
    });
    setActiveMentionIndex(0);
  }, [referenceImages.length]);

  const filteredReferenceImages = useMemo(() => {
    if (!mentionState) return referenceImages;
    const query = mentionState.query.trim().toLowerCase();
    if (!query) return referenceImages;

    return referenceImages.filter((reference) => {
      const haystack = `${reference.label} ${reference.prompt || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [mentionState, referenceImages]);

  const highlightedPromptSegments = useMemo(() => {
    if (!prompt) return [];

    const labelMap = new Map<string, ReferenceImageOption>();
    referenceImages.forEach((reference) => {
      const label = reference.label.trim();
      if (!label || labelMap.has(label)) return;
      labelMap.set(label, reference);
    });

    const labels = Array.from(labelMap.keys()).sort((a, b) => b.length - a.length);
    if (labels.length === 0) {
      return [{ type: 'text' as const, value: prompt }];
    }

    const matcher = new RegExp(labels.map(escapeRegExp).join('|'), 'g');
    const segments: Array<
      | { type: 'text'; value: string }
      | { type: 'reference'; value: string; reference: ReferenceImageOption }
    > = [];
    let lastIndex = 0;

    for (const match of prompt.matchAll(matcher)) {
      const index = match.index ?? 0;
      const value = match[0];
      const reference = labelMap.get(value);
      if (!reference) continue;

      if (index > lastIndex) {
        segments.push({ type: 'text', value: prompt.slice(lastIndex, index) });
      }

      segments.push({ type: 'reference', value, reference });
      lastIndex = index + value.length;
    }

    if (lastIndex < prompt.length) {
      segments.push({ type: 'text', value: prompt.slice(lastIndex) });
    }

    return segments.length > 0 ? segments : [{ type: 'text' as const, value: prompt }];
  }, [prompt, referenceImages]);

  const insertReference = useCallback((reference: ReferenceImageOption) => {
    if (!mentionState) return;

    const replacement = reference.label;
    const nextPrompt =
      `${prompt.slice(0, mentionState.start)}${replacement}${prompt.slice(mentionState.end)}`;
    const nextCaretPosition = mentionState.start + replacement.length;

    setPrompt(nextPrompt);
    setMentionState(null);
    setActiveMentionIndex(0);

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaretPosition, nextCaretPosition);
    });
  }, [mentionState, prompt]);

  const syncPromptMirrorScroll = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element || !promptMirrorRef.current) return;
    promptMirrorRef.current.scrollTop = element.scrollTop;
    promptMirrorRef.current.scrollLeft = element.scrollLeft;
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
  }, [id, setNodes, setEdges]);

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.imageSrc) return;
    const a = document.createElement('a');
    a.href = data.imageSrc;
    a.download = `image-${id}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [data.imageSrc, id]);

  const handlePreviewOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.imageSrc || data.isLoading) return;
    setIsPreviewOpen(true);
  }, [data.imageSrc, data.isLoading]);

  const handlePreviewClose = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsPreviewOpen(false);
  }, []);

  const handleCreateLinkedImageNode = useCallback((direction: LinkedImageDirection) => (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onCreateLinkedImageNode?.(id, direction);
  }, [data, id]);

  const handleOutputPointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    outputDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }, []);

  const handleOutputPointerMoveCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (outputDragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    if (Math.hypot(event.clientX - outputDragStateRef.current.startX, event.clientY - outputDragStateRef.current.startY) > 6) {
      outputDragStateRef.current.moved = true;
    }
  }, []);

  const resetOutputPointerState = useCallback((pointerId: number) => {
    if (outputDragStateRef.current.pointerId !== pointerId) {
      return;
    }

    window.setTimeout(() => {
      outputDragStateRef.current.pointerId = null;
      outputDragStateRef.current.moved = false;
    }, 0);
  }, []);

  const handleOutputPointerUpCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    resetOutputPointerState(event.pointerId);
  }, [resetOutputPointerState]);

  const handleOutputPointerCancelCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    resetOutputPointerState(event.pointerId);
  }, [resetOutputPointerState]);

  const handleOutputClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();

    if (outputDragStateRef.current.moved) {
      outputDragStateRef.current.moved = false;
      return;
    }

    data.onCreateLinkedImageNode?.(id, 'output');
  }, [data, id]);

  return (
    <div className={clsx(
      "relative rounded-2xl transition-all duration-200",
      selected ? "ring-2 ring-blue-500/50" : "",
      data.isConnectionTargetMode ? "ring-2 ring-sky-400/55 shadow-[0_0_42px_rgba(56,189,248,0.2)]" : ""
    )}>
      {selected && (
        <>
          <button
            type="button"
            onClick={handleCreateLinkedImageNode('input')}
            className={clsx(
              "absolute left-[-24px] top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border bg-[#202020]/95 text-white shadow-xl backdrop-blur-md transition-all hover:scale-105",
              data.isConnectionTargetMode
                ? "animate-pulse border-sky-300/70 bg-sky-500/18 text-sky-50 shadow-[0_0_0_1px_rgba(147,197,253,0.22),0_0_32px_rgba(59,130,246,0.3)]"
                : "border-white/20 hover:bg-[#2a2a2a]"
            )}
            title="添加参考图像节点"
          >
            <Plus className="h-5 w-5" />
          </button>

          <div
            className={clsx(
              "absolute right-[-24px] top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border bg-[#202020]/95 text-white shadow-xl backdrop-blur-md transition-all hover:scale-105",
              data.isOutputConnectorActive
                ? "border-sky-300/65 bg-sky-500/18 text-sky-50 shadow-[0_0_0_1px_rgba(147,197,253,0.22),0_0_32px_rgba(59,130,246,0.28)]"
                : "border-white/20 hover:bg-[#2a2a2a]"
            )}
            onPointerDownCapture={handleOutputPointerDownCapture}
            onPointerMoveCapture={handleOutputPointerMoveCapture}
            onPointerUpCapture={handleOutputPointerUpCapture}
            onPointerCancelCapture={handleOutputPointerCancelCapture}
            onClick={handleOutputClick}
            title="基于当前图像新建节点"
          >
            <Plus className="h-5 w-5" />
            <Handle
              id="output-plus"
              type="source"
              position={Position.Right}
              className="!absolute !border-0 !bg-transparent !opacity-0"
              style={{
                inset: 0,
                width: '100%',
                height: '100%',
                transform: 'none',
                background: 'transparent',
                border: 'none',
              }}
              isConnectableStart
            />
          </div>
        </>
      )}

      <Handle
        type="target"
        position={Position.Left}
        className={clsx(
          "w-3 h-3 border-2 border-gray-900 transition-all",
          data.isConnectionTargetMode
            ? "animate-pulse bg-sky-300 shadow-[0_0_0_6px_rgba(56,189,248,0.18),0_0_24px_rgba(56,189,248,0.45)]"
            : "bg-blue-500"
        )}
      />
      
      {/* Title */}
      <div className="absolute -top-6 left-0 text-xs text-neutral-400 flex items-center gap-1 max-w-full overflow-hidden whitespace-nowrap text-ellipsis">
        <ImageIcon className="w-3 h-3 shrink-0" />
        <span className="truncate">{data.title || 'Image'}</span>
      </div>

      {data.isConnectionTargetMode && (
        <div className="pointer-events-none absolute -top-8 left-1/2 z-30 -translate-x-1/2 rounded-full border border-sky-300/35 bg-sky-500/12 px-3 py-1 text-[10px] font-medium tracking-[0.18em] text-sky-100 shadow-[0_10px_24px_rgba(14,165,233,0.18)] backdrop-blur-md">
          CONNECT AS REFERENCE
        </div>
      )}

      {/* Delete Button */}
      {selected && (
        <div className="absolute -top-3 -right-3 flex gap-2 z-50">
          <button
            onClick={handleDelete}
            className="bg-white/10 hover:bg-white/20 p-1.5 rounded-full shadow-lg transition-colors border border-white/10 backdrop-blur-md"
            title="Delete Node"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-500" />
          </button>
        </div>
      )}

      {/* Floating Upload Button for Empty State */}
      {!data.imageSrc && !data.isLoading && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10">
          <label className="flex items-center gap-2 bg-[#2A2A2A] hover:bg-[#333] text-white px-4 py-2 rounded-full cursor-pointer text-xs shadow-lg border border-white/10 transition-colors whitespace-nowrap">
            <UploadCloud className="w-4 h-4" />
            上传
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      )}

      {/* Main Image Container */}
      <div 
        className={clsx(
          "relative flex items-center justify-center overflow-hidden rounded-2xl border bg-[#1A1A1A]",
          data.isConnectionTargetMode
            ? "border-sky-300/55 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.18)]"
            : "border-white/10"
        )}
        style={{ 
          width: '280px', 
          aspectRatio: data.aspectRatio || '3/4' 
        }}
      >
        {data.isConnectionTargetMode && (
          <div className="pointer-events-none absolute inset-2 z-10 rounded-[18px] border border-dashed border-sky-300/40 bg-sky-400/[0.03]" />
        )}

        {data.isLoading ? (
          <div className="absolute inset-0 z-20 overflow-hidden bg-[#2A2A2A]">
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        ) : null}

        {data.imageSrc ? (
          <>
            <img
              src={data.imageSrc}
              alt="Node content"
              className="h-full w-full cursor-pointer object-cover animate-fade-in"
              onLoad={(e) => {
                const img = e.target as HTMLImageElement;
                const ratio = img.naturalWidth / img.naturalHeight;
                if (!data.aspectRatio || Math.abs(Number(data.aspectRatio) - ratio) > 0.01) {
                  updateNodeData(id, { aspectRatio: ratio });
                }
              }}
            />

            {selected && !data.isLoading && (
              <div className="absolute bottom-3 right-3 z-40 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePreviewOpen}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all hover:scale-[1.03] hover:bg-black/60"
                  title="查看大图"
                >
                  <Expand className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all hover:scale-[1.03] hover:bg-black/60"
                  title="下载图像"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        ) : !data.isLoading ? (
          <div className="absolute inset-2 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-lg p-4 text-center">
            {data.error ? (
              <>
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-red-400" />
                </div>
                <p className="text-xs text-red-400 mb-4 line-clamp-3">{data.error}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (data.onGenerate) {
                      data.onGenerate(id, data.prompt || '', {
                        model,
                        aspectRatio,
                        resolution,
                        quantity,
                        targetType,
                        videoDuration,
                        isRetry: true
                      });
                    }
                  }}
                  className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-full transition-colors"
                >
                  重试 (Retry)
                </button>
              </>
            ) : (
              <ImageIcon className="w-8 h-8 text-white/10" />
            )}
          </div>
        ) : null}
      </div>

      {/* Floating Input Panel */}
      {selected && (
        <div
          className="absolute top-[calc(100%+24px)] left-1/2 z-50 flex w-[min(620px,calc(100vw-3rem))] -translate-x-1/2 cursor-default flex-col gap-3 rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(36,36,40,0.96),rgba(20,20,24,0.92))] p-4 shadow-[0_22px_80px_rgba(0,0,0,0.42)] backdrop-blur-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full">
            <div className="relative w-full">
              {referenceImages.length > 0 && (
                <div className="mb-4 flex w-full items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {referenceImages.map((reference) => (
                    <div
                      key={reference.nodeId}
                      className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/8 px-2 py-1.5"
                    >
                      <img
                        src={reference.imageSrc}
                        alt={reference.label}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                      <span className="pr-2 text-xs font-medium text-white">{reference.label}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative">
                <div
                  ref={promptMirrorRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 overflow-auto rounded-[24px] px-5 py-4 text-[15px] leading-7 text-neutral-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  <div className="min-h-[calc(132px-2rem)] whitespace-pre-wrap break-words">
                    {prompt ? highlightedPromptSegments.map((segment, index) => {
                      if (segment.type === 'text') {
                        return <React.Fragment key={`text-${index}`}>{segment.value}</React.Fragment>;
                      }

                      return (
                        <span
                          key={`reference-${segment.reference.nodeId}-${index}`}
                          className="mx-[1px] inline-flex items-center gap-1.5 rounded-[14px] border border-sky-400/40 bg-[linear-gradient(180deg,rgba(44,83,154,0.42),rgba(28,50,99,0.72))] px-2.5 py-1 align-baseline text-[0.95em] font-semibold leading-none text-sky-50 shadow-[0_0_0_1px_rgba(59,130,246,0.14),inset_0_1px_0_rgba(255,255,255,0.12)]"
                        >
                          <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-sky-950/55 text-sky-200">
                            <ImageIcon className="h-3 w-3" />
                          </span>
                          <span>{segment.value}</span>
                        </span>
                      );
                    }) : null}
                  </div>
                </div>

                <textarea
                  ref={inputRef}
                  value={prompt}
                  onChange={(e) => {
                    const nextPrompt = e.target.value;
                    setPrompt(nextPrompt);
                    syncMentionState(nextPrompt, e.target.selectionStart ?? nextPrompt.length);
                  }}
                  onClick={(e) => syncMentionState(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
                  onKeyUp={(e) => syncMentionState(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
                  onScroll={(e) => syncPromptMirrorScroll(e.currentTarget)}
                  placeholder="描述任何你想要生成的内容，按 @ 引用素材"
                  className="relative block min-h-[132px] w-full resize-none rounded-[24px] border border-white/8 bg-black/25 px-5 py-4 text-[15px] leading-7 text-transparent outline-none transition-colors [-webkit-text-fill-color:transparent] caret-white placeholder:text-neutral-500 focus:border-white/18"
                  onKeyDown={(e) => {
                    if (mentionState && filteredReferenceImages.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActiveMentionIndex((index) => (index + 1) % filteredReferenceImages.length);
                        return;
                      }

                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActiveMentionIndex((index) => (index - 1 + filteredReferenceImages.length) % filteredReferenceImages.length);
                        return;
                      }

                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        insertReference(filteredReferenceImages[activeMentionIndex]);
                        return;
                      }

                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setMentionState(null);
                        return;
                      }
                    }

                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate(e);
                    }
                    e.stopPropagation();
                  }}
                />
              </div>

              {mentionState && filteredReferenceImages.length > 0 && (
                <div className="absolute right-0 top-[calc(100%+12px)] z-[70] min-w-[280px] overflow-hidden rounded-[24px] border border-white/10 bg-[#2A2A2E]/95 p-2 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                  <div className="px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
                    Add Reference
                  </div>
                  <div className="flex flex-col gap-1">
                    {filteredReferenceImages.map((reference, index) => (
                      <button
                        key={reference.nodeId}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertReference(reference);
                        }}
                        className={clsx(
                          "flex items-center gap-3 rounded-[20px] px-3 py-3 text-left transition-colors",
                          index === activeMentionIndex ? "bg-white/12" : "hover:bg-white/8"
                        )}
                      >
                        <img
                          src={reference.imageSrc}
                          alt={reference.label}
                          className="h-12 w-12 rounded-2xl object-cover"
                        />
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-white">{reference.label}</div>
                          {reference.prompt ? (
                            <div className="truncate text-sm text-neutral-400">{reference.prompt}</div>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-neutral-300">
            <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max items-center gap-2 pr-1">
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 p-1">
                  <button
                    type="button"
                    onClick={() => setTargetType('image')}
                    className={clsx(
                      "inline-flex items-center justify-center rounded-full px-3 py-2 text-xs font-medium transition-all",
                      targetType === 'image' ? "bg-white text-black shadow-sm" : "text-neutral-300 hover:bg-white/8 hover:text-white"
                    )}
                    title="Image"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType('video')}
                    className={clsx(
                      "inline-flex items-center justify-center rounded-full px-3 py-2 text-xs font-medium transition-all",
                      targetType === 'video' ? "bg-white text-black shadow-sm" : "text-neutral-300 hover:bg-white/8 hover:text-white"
                    )}
                    title="Video"
                  >
                    <VideoIcon className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/6 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-white/10">
                  <Sparkle className="h-3.5 w-3.5 text-neutral-300" />
                  <select
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    className="bg-transparent text-xs text-white outline-none cursor-pointer appearance-none disabled:opacity-50"
                    disabled={targetType === 'video'}
                  >
                    {targetType === 'video' ? (
                      <option value="veo-3.1-generate-preview" className="bg-[#1C1C1C]">Veo 3.1 Preview</option>
                    ) : (
                      <>
                        <option value="gemini-3.1-image-flash-preview" className="bg-[#1C1C1C]">Nano Banana 2</option>
                        <option value="gemini-2.5-image-flash" className="bg-[#1C1C1C]">Nano Banana</option>
                        <option value="gemini-3-pro-image-preview" className="bg-[#1C1C1C]">Nano Banana Pro</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/6 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-white/10">
                  <Sparkles className="w-3.5 h-3.5" />
                  <select
                    value={aspectRatio}
                    onChange={e => setAspectRatio(e.target.value)}
                    className="bg-transparent text-xs text-white outline-none cursor-pointer appearance-none"
                  >
                    {targetType === 'video' ? (
                      <>
                        <option value="9:16" className="bg-[#1C1C1C]">9:16</option>
                        <option value="16:9" className="bg-[#1C1C1C]">16:9</option>
                      </>
                    ) : (
                      <>
                        <option value="1:1" className="bg-[#1C1C1C]">1:1</option>
                        <option value="3:4" className="bg-[#1C1C1C]">3:4</option>
                        <option value="4:3" className="bg-[#1C1C1C]">4:3</option>
                        <option value="9:16" className="bg-[#1C1C1C]">9:16</option>
                        <option value="16:9" className="bg-[#1C1C1C]">16:9</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/6 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-white/10">
                  <Layout className="w-3.5 h-3.5" />
                  <select
                    value={resolution}
                    onChange={e => setResolution(e.target.value)}
                    className="bg-transparent text-xs text-white outline-none cursor-pointer appearance-none"
                  >
                    {targetType === 'video' ? (
                      <>
                        <option value="720p" className="bg-[#1C1C1C]">720p</option>
                        <option value="1080p" className="bg-[#1C1C1C]">1080p</option>
                        <option value="4K" className="bg-[#1C1C1C]">4K</option>
                      </>
                    ) : (
                      <>
                        <option value="1K" className="bg-[#1C1C1C]">1K</option>
                        <option value="2K" className="bg-[#1C1C1C]">2K</option>
                        <option value="4K" className="bg-[#1C1C1C]">4K</option>
                      </>
                    )}
                  </select>
                </div>

                {targetType === 'video' && (
                  <div className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/6 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-white/10">
                    <Clock className="w-3.5 h-3.5" />
                    <select
                      value={videoDuration}
                      onChange={e => setVideoDuration(e.target.value)}
                      className="bg-transparent text-xs text-white outline-none cursor-pointer appearance-none"
                    >
                      <option value="4" className="bg-[#1C1C1C]">4s</option>
                      <option value="6" className="bg-[#1C1C1C]">6s</option>
                      <option value="8" className="bg-[#1C1C1C]">8s</option>
                    </select>
                  </div>
                )}

                {targetType === 'image' && (
                  <div className="flex items-center gap-1.5 rounded-full border border-white/8 bg-white/6 px-3 py-2 backdrop-blur-sm transition-colors hover:bg-white/10">
                    <Layers3 className="h-3.5 w-3.5 text-neutral-300" />
                    <select
                      value={quantity}
                      onChange={e => setQuantity(Number(e.target.value))}
                      className="bg-transparent text-xs text-white outline-none cursor-pointer appearance-none"
                    >
                      <option value={1} className="bg-[#1C1C1C]">1x</option>
                      <option value={2} className="bg-[#1C1C1C]">2x</option>
                      <option value={3} className="bg-[#1C1C1C]">3x</option>
                      <option value={4} className="bg-[#1C1C1C]">4x</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={toggleRecording}
                className={clsx(
                  "flex h-10 w-10 items-center justify-center rounded-full border transition-all",
                  isRecording
                    ? "border-white/16 bg-white/14 text-white shadow-[0_10px_30px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.16)] animate-pulse"
                    : "border-white/10 bg-white/6 text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-white/16 hover:bg-white/10 hover:text-white"
                )}
                title="Hold to speak"
              >
                <Mic className="h-4.5 w-4.5" />
              </button>

              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || data.isLoading}
                className={clsx(
                  "flex h-10 w-10 items-center justify-center rounded-full border transition-all",
                  prompt.trim() && !data.isLoading
                    ? "border-white/70 bg-white text-black shadow-[0_12px_32px_rgba(255,255,255,0.16),inset_0_1px_0_rgba(255,255,255,0.9)] hover:scale-[1.03] hover:bg-neutral-100"
                    : "cursor-not-allowed border-white/8 bg-white/5 text-neutral-600"
                )}
              >
                <Send className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {isPreviewOpen && data.imageSrc && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          onClick={handlePreviewClose}
        >
          <button
            type="button"
            onClick={handlePreviewClose}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white transition-colors hover:bg-black/60"
            title="Close preview"
          >
            <X className="h-4.5 w-4.5" />
          </button>

          <div
            className="relative max-h-[92vh] max-w-[92vw] overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={data.imageSrc}
              alt="Preview"
              className="max-h-[92vh] max-w-[92vw] object-contain"
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
