import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import { UploadCloud, Send, Mic, Sparkles, Layout, Image as ImageIcon, Trash2, Download, Video as VideoIcon, Clock, Sparkle, Layers3, X, Plus, Expand, UserRound, Palette, Shirt, ChevronRight, Check, ScanSearch, Brush, Loader2, RefreshCw, Eye } from 'lucide-react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { type SkillType, type SkillExecuteOptions, type AnalysisType, SKILL_MODES, TRYON_TAG_OPTIONS } from '../../services/skillPrompts';

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
  isAnyConnectionActive?: boolean;
  analysisResults?: Record<string, {
    type: AnalysisType;
    loading?: boolean;
    data?: any;
    error?: string;
  }>;
  onGenerate?: (nodeId: string, prompt: string, params?: any) => void;
  onCreateLinkedImageNode?: (nodeId: string, direction: LinkedImageDirection) => void;
  onSkillExecute?: (nodeId: string, skillType: SkillType, options?: SkillExecuteOptions) => void;
  onAnalyze?: (nodeId: string, analysisType: AnalysisType) => void;
};

export type ImageNodeType = Node<ImageNodeData, 'imageNode'>;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ── Expandable text (default 2 lines, click to expand) ── */
function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 2);
  }, [text]);

  return (
    <div className="relative">
      <p
        ref={textRef}
        className={clsx(
          "text-[11px] leading-[1.65] text-white/40 transition-all",
          !expanded && "line-clamp-2"
        )}
      >
        {text}
      </p>
      {clamped && !expanded && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          className="mt-0.5 text-[10px] text-white/25 transition-colors hover:text-white/50"
        >
          展开 ↓
        </button>
      )}
      {expanded && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
          className="mt-0.5 text-[10px] text-white/25 transition-colors hover:text-white/50"
        >
          收起 ↑
        </button>
      )}
    </div>
  );
}

/* ── Analysis result card wrapper ── */
function AnalysisCard({ type, onDismiss, children }: { type: AnalysisType; onDismiss: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <div className="group/card relative w-full rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDismiss(e); }}
        className="absolute -right-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-white/8 bg-[#1a1a1e] text-white/25 opacity-0 transition-all hover:text-white/60 group-hover/card:opacity-100"
      >
        <X className="h-2 w-2" />
      </button>
      {children}
    </div>
  );
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

  const [model, setModel] = useState('gemini-3.1-flash-image-preview');
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [resolution, setResolution] = useState('2K');
  const [quantity, setQuantity] = useState(1);
  const [targetType, setTargetType] = useState<'image' | 'video'>('image');
  const [videoDuration, setVideoDuration] = useState('4');
  const [activeSkillMenu, setActiveSkillMenu] = useState<SkillType | null>(null);
  const [skillMode, setSkillMode] = useState<string>('precise');
  const [showAnalyzeMenu, setShowAnalyzeMenu] = useState(false);
  const [skillImages, setSkillImages] = useState<Array<{ id: string; imageSrc: string; label: string; tag?: string; fromNodeId?: string }>>([]);
  const skillUploadRef = useRef<HTMLInputElement>(null);

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
      setModel('gemini-3.1-flash-image-preview');
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
      setActiveSkillMenu(null);
      setShowAnalyzeMenu(false);
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
    const files = Array.from(e.target.files || []) as File[];
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;

    Promise.all(
      imageFiles.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          })
      )
    )
      .then((imageSources) => {
        setNodes((nds) =>
          nds.flatMap((node) => {
            if (node.id !== id) return [node];

            const updatedNode = {
              ...node,
              data: {
                ...node.data,
                imageSrc: imageSources[0],
              },
            };

            const extraNodes = imageSources.slice(1).map((imageSrc, index) => ({
              id: uuidv4(),
              type: 'imageNode' as const,
              position: {
                x: node.position.x + (index + 1) * 320,
                y: node.position.y,
              },
              data: {
                imageSrc,
                onGenerate: data.onGenerate,
              },
            }));

            return [updatedNode, ...extraNodes];
          })
        );
      })
      .catch((error) => {
        console.error('Failed to load selected images:', error);
      })
      .finally(() => {
        e.target.value = '';
      });
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

  const handleSkillButtonClick = useCallback((skillType: SkillType) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeSkillMenu === skillType) {
      setActiveSkillMenu(null);
      return;
    }
    // Initialize with connected references (if any)
    const initialImages = referenceImages.map((ref, i) => ({
      id: uuidv4(),
      imageSrc: ref.imageSrc,
      label: ref.label,
      tag: skillType === 'tryon' ? (i === 0 ? '上衣' : '裤子') : undefined,
      fromNodeId: ref.nodeId,
    }));
    setSkillImages(initialImages);
    setSkillMode(skillType === 'change-model' ? 'face-swap' : 'precise');
    setActiveSkillMenu(skillType);
  }, [activeSkillMenu, referenceImages]);

  const handleSkillImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f: File) => f.type.startsWith('image/'));
    if (!files.length) return;

    Promise.all(
      files.map(
        (file: File) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          })
      )
    ).then((sources) => {
      const isSingle = activeSkillMenu !== 'tryon';
      if (isSingle) {
        // Replace existing image for single-image skills
        setSkillImages(
          sources.slice(0, 1).map((src, i) => ({
            id: uuidv4(),
            imageSrc: src,
            label: activeSkillMenu === 'change-background' ? '背景图' : '模特图',
            tag: undefined,
          }))
        );
      } else {
        // Append for TryOn (multiple clothing items)
        setSkillImages((prev) => [
          ...prev,
          ...sources.map((src) => ({
            id: uuidv4(),
            imageSrc: src,
            label: `服装 ${prev.length + 1}`,
            tag: '上衣',
          })),
        ]);
      }
    });
    e.target.value = '';
  }, [activeSkillMenu]);

  const handleSkillImageRemove = useCallback((imageId: string) => {
    setSkillImages((prev) => prev.filter((img) => img.id !== imageId));
  }, []);

  const handleSkillExecuteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (skillImages.length === 0 || !activeSkillMenu) return;
    const currentSkill = activeSkillMenu;
    const currentMode = skillMode;
    const currentImages = skillImages.map((img) => ({
      imageSrc: img.imageSrc,
      label: img.label,
      tag: img.tag,
      fromNodeId: img.fromNodeId,
    }));
    setActiveSkillMenu(null);
    setSkillImages([]);
    data.onSkillExecute?.(id, currentSkill, {
      mode: currentMode,
      batchSize: 1,
      skillImages: currentImages,
    });
  }, [data, id, activeSkillMenu, skillMode, skillImages]);

  const handleAnalyzeClick = useCallback((analysisType: AnalysisType) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAnalyzeMenu(false);
    data.onAnalyze?.(id, analysisType);
  }, [data, id]);

  const handleDismissAnalysis = useCallback((analysisType: AnalysisType) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const current = data.analysisResults ?? {};
    const next = { ...current };
    delete next[analysisType];
    updateNodeData(id, { analysisResults: Object.keys(next).length > 0 ? next : undefined });
  }, [id, data.analysisResults, updateNodeData]);

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
              "absolute left-[-24px] top-1/2 z-[60] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border bg-[#202020]/95 text-white shadow-xl backdrop-blur-md transition-all hover:scale-105",
              data.isConnectionTargetMode
                ? "animate-pulse border-sky-300/70 bg-sky-500/18 text-sky-50 shadow-[0_0_0_1px_rgba(147,197,253,0.22),0_0_32px_rgba(59,130,246,0.3)]"
                : "border-white/20 hover:bg-[#2a2a2a]"
            )}
            title="添加参考图像节点"
          >
            <Plus className="h-5 w-5" />
          </button>

          <div className="absolute right-[-24px] top-1/2 z-[60] h-11 w-11 -translate-y-1/2">
            <Handle
              id="output-plus"
              type="source"
              position={Position.Right}
              className={clsx(
                "!absolute !inset-0 !h-11 !w-11 !translate-x-0 !translate-y-0 !rounded-full !border !opacity-100 shadow-xl backdrop-blur-md transition-all hover:scale-105",
                data.isOutputConnectorActive
                  ? "!border-sky-300/65 !bg-sky-500/18 !text-sky-50 !shadow-[0_0_0_1px_rgba(147,197,253,0.22),0_0_32px_rgba(59,130,246,0.28)]"
                  : "!border-white/20 !bg-[#202020]/95 hover:!bg-[#2a2a2a]"
              )}
              style={{
                inset: 0,
                width: '100%',
                height: '100%',
                transform: 'none',
              }}
              isConnectableStart
              onPointerDownCapture={handleOutputPointerDownCapture}
              onPointerMoveCapture={handleOutputPointerMoveCapture}
              onPointerUpCapture={handleOutputPointerUpCapture}
              onPointerCancelCapture={handleOutputPointerCancelCapture}
              onClick={handleOutputClick}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
              <Plus className="h-5 w-5" />
            </div>
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

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-0 !bg-transparent !opacity-0"
        style={{
          right: -6,
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          background: 'transparent',
          border: 'none',
        }}
        isConnectableStart={false}
      />
      
      {/* Title */}
      <div className="absolute -top-6 left-0 text-xs text-neutral-400 flex items-center gap-1 max-w-full overflow-hidden whitespace-nowrap text-ellipsis">
        <ImageIcon className="w-3 h-3 shrink-0" />
        <span className="truncate">{data.title || 'Image'}</span>
      </div>

      {/* Skill Toolbar */}
      {selected && data.imageSrc && !data.isLoading && !data.isAnyConnectionActive && (
        <div className="absolute -top-[52px] left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-0.5 rounded-full border border-white/15 bg-[#1c1c20]/92 px-1.5 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            {([
              { type: 'change-model' as SkillType, icon: UserRound, label: '换模特' },
              { type: 'change-background' as SkillType, icon: Palette, label: '换背景' },
              { type: 'tryon' as SkillType, icon: Shirt, label: 'TryOn' },
            ] as const).map((item, idx) => (
              <React.Fragment key={item.type}>
                {idx > 0 && <div className="w-px h-4 bg-white/10" />}
                <button
                  type="button"
                  onClick={handleSkillButtonClick(item.type)}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all whitespace-nowrap",
                    activeSkillMenu === item.type
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                  title={item.label}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              </React.Fragment>
            ))}
            {/* Analysis buttons removed — now on the image top-left */}
          </div>

          {/* Skill Panel */}
          {activeSkillMenu && (
            <div
              className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+8px)] z-50 w-[300px] overflow-hidden rounded-2xl border border-white/10 bg-[#1e1e22]/95 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Panel Header */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-white">
                  {activeSkillMenu === 'change-model' ? '换模特' : activeSkillMenu === 'change-background' ? '换背景' : '虚拟试穿'}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setActiveSkillMenu(null); }}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Mode Selector (for change-background / change-model) */}
              {activeSkillMenu !== 'tryon' && (
                <div className="mb-3 flex gap-1 rounded-xl bg-black/25 p-1">
                  {SKILL_MODES[activeSkillMenu].map((modeOption) => (
                    <button
                      key={modeOption.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSkillMode(modeOption.id); }}
                      className={clsx(
                        "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all",
                        skillMode === modeOption.id
                          ? "bg-white/14 text-white shadow-sm"
                          : "text-neutral-400 hover:text-white"
                      )}
                      title={modeOption.desc}
                    >
                      {modeOption.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Uploaded / Selected Images */}
              {skillImages.length > 0 && (
                <div className="mb-3 flex flex-col gap-2">
                  {skillImages.map((img) => (
                    <div key={img.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/5 p-2">
                      <img
                        src={img.imageSrc}
                        alt={img.label}
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-white/80">{img.label}</div>
                        {img.fromNodeId && (
                          <div className="text-[10px] text-neutral-500">来自画布</div>
                        )}
                      </div>
                      {activeSkillMenu === 'tryon' && (
                        <select
                          value={img.tag || '上衣'}
                          onChange={(e) => {
                            e.stopPropagation();
                            setSkillImages((prev) =>
                              prev.map((item) =>
                                item.id === img.id ? { ...item, tag: e.target.value } : item
                              )
                            );
                          }}
                          className="shrink-0 rounded-lg border border-white/10 bg-white/8 px-2 py-1 text-xs text-white outline-none"
                        >
                          {TRYON_TAG_OPTIONS.map((tag) => (
                            <option key={tag} value={tag} className="bg-[#1C1C1C]">{tag}</option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSkillImageRemove(img.id); }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/30 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Area */}
              {(activeSkillMenu === 'tryon' || skillImages.length === 0) && (
                <label
                  className="mb-3 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-center transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <UploadCloud className="h-6 w-6 text-white/30" />
                  <div className="text-xs text-white/50">
                    {activeSkillMenu === 'change-background'
                      ? '上传背景图片'
                      : activeSkillMenu === 'change-model'
                        ? '上传模特 / 人脸图片'
                        : '上传服装图片'}
                  </div>
                  <div className="text-[10px] text-white/25">点击或拖拽至此</div>
                  <input
                    ref={skillUploadRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple={activeSkillMenu === 'tryon'}
                    onChange={handleSkillImageUpload}
                  />
                </label>
              )}

              {/* Single-image skill: show replace button when image exists */}
              {activeSkillMenu !== 'tryon' && skillImages.length > 0 && (
                <label
                  className="mb-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/8 bg-white/5 px-3 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  <UploadCloud className="h-3 w-3" />
                  <span>更换图片</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleSkillImageUpload}
                  />
                </label>
              )}

              {/* Execute Button */}
              <button
                type="button"
                onClick={handleSkillExecuteClick}
                disabled={skillImages.length === 0}
                className={clsx(
                  "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                  skillImages.length > 0
                    ? "bg-white/14 text-white hover:bg-white/22 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                    : "cursor-not-allowed bg-white/5 text-white/25"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {activeSkillMenu === 'change-background'
                  ? '开始换背景'
                  : activeSkillMenu === 'change-model'
                    ? '开始换模特'
                    : '开始试穿'}
              </button>
            </div>
          )}
        </div>
      )}

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
              multiple
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

            {/* Analyze button — top-left of image */}
            {selected && !data.isLoading && (
              <div className="absolute top-3 left-3 z-40">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowAnalyzeMenu((v) => !v); }}
                  disabled={Object.values(data.analysisResults ?? {}).some((r) => r.loading)}
                  className={clsx(
                    "flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all hover:scale-[1.03] hover:bg-black/60",
                    showAnalyzeMenu && "bg-white/20"
                  )}
                  title="识别"
                >
                  {Object.values(data.analysisResults ?? {}).some((r) => r.loading)
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Eye className="h-4 w-4" />}
                </button>
                {showAnalyzeMenu && (
                  <div
                    className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[130px] overflow-hidden rounded-xl border border-white/10 bg-[#222226]/95 p-1 shadow-[0_14px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={handleAnalyzeClick('clothing-category')}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/80 transition-colors hover:bg-white/10"
                    >
                      <ScanSearch className="h-3.5 w-3.5 text-white/50" />
                      款式识别
                    </button>
                    <button
                      type="button"
                      onClick={handleAnalyzeClick('art-style')}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-white/80 transition-colors hover:bg-white/10"
                    >
                      <Brush className="h-3.5 w-3.5 text-white/50" />
                      风格识别
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Image action buttons — bottom-right */}
            {selected && !data.isLoading && (
              <div className="absolute bottom-3 right-3 z-40 flex items-center gap-2">
                <label
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/12 bg-black/45 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-md transition-all hover:scale-[1.03] hover:bg-black/60"
                  title="替换图像"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RefreshCw className="h-4 w-4" />
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleFileUpload}
                  />
                </label>
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

      {/* Persistent Analysis Results — below image, supports both types simultaneously */}
      {data.analysisResults && Object.keys(data.analysisResults).length > 0 && (
        <div className="mt-2 flex w-full flex-col gap-2">
          {Object.entries(data.analysisResults).map(([key, result]) => {
            if (result.loading) {
              return (
                <div key={key} className="flex w-full items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/30" />
                  <span className="text-[11px] text-white/30">
                    {result.type === 'clothing-category' ? '款式识别中…' : '风格识别中…'}
                  </span>
                </div>
              );
            }

            if (result.error) {
              return (
                <div key={key} className="group/err relative flex w-full items-center gap-2 rounded-xl border border-red-500/10 bg-red-500/[0.03] px-3 py-2">
                  <div className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded bg-red-500/10">
                    <X className="h-2.5 w-2.5 text-red-400" />
                  </div>
                  <span className="text-[11px] leading-tight text-red-300/70 line-clamp-1">
                    {result.type === 'clothing-category' ? '款式' : '风格'}识别失败：{result.error}
                  </span>
                  <button
                    type="button"
                    onClick={handleDismissAnalysis(result.type)}
                    className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white/20 opacity-0 transition-opacity hover:text-white/50 group-hover/err:opacity-100"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            }

            if (!result.data) return null;

            if (result.type === 'clothing-category') {
              return (
                <React.Fragment key={key}>
                <AnalysisCard type={result.type as AnalysisType} onDismiss={handleDismissAnalysis('clothing-category')}>
                  <div className="flex items-center gap-1.5">
                    <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded bg-sky-500/12">
                      <ScanSearch className="h-3 w-3 text-sky-400/80" />
                    </div>
                    <span className="text-[10px] font-medium tracking-wide text-white/30">款式</span>
                    <div className="ml-1 flex flex-wrap gap-1">
                      {(() => {
                        const d = result.data;
                        if (typeof d === 'string') {
                          return <span className="text-[11px] text-white/65">{d}</span>;
                        }
                        const parts: { label: string; value: string }[] = [];
                        if (d?.upper) parts.push({ label: '上装', value: d.upper });
                        if (d?.lower) parts.push({ label: '下装', value: d.lower });
                        if (d?.overall) parts.push({ label: '整体', value: d.overall });
                        if (parts.length === 0) return null;
                        return parts.map((part) => (
                          <span
                            key={part.label}
                            className="inline-flex items-center gap-1 rounded-md border border-sky-400/8 bg-sky-500/[0.05] px-2 py-0.5 text-[11px] leading-snug"
                          >
                            <span className="text-sky-400/60">{part.label}</span>
                            <span className="text-white/65">{part.value}</span>
                          </span>
                        ));
                      })()}
                    </div>
                  </div>
                </AnalysisCard>
                </React.Fragment>
              );
            }

            if (result.type === 'art-style') {
              return (
                <React.Fragment key={key}>
                <AnalysisCard type={result.type} onDismiss={handleDismissAnalysis('art-style')}>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded bg-purple-500/12">
                        <Brush className="h-3 w-3 text-purple-400/80" />
                      </div>
                      <span className="text-[10px] font-medium tracking-wide text-white/30">风格</span>
                      {(result.data?.label || result.data?.style) && (
                        <span className="ml-1 inline-flex items-center rounded-md border border-purple-400/12 bg-purple-500/[0.06] px-2 py-0.5 text-[11px] font-medium text-purple-300/85">
                          {result.data?.label || result.data?.style}
                        </span>
                      )}
                    </div>
                    {result.data?.reason && (
                      <ExpandableText text={result.data.reason} />
                    )}
                  </div>
                </AnalysisCard>
                </React.Fragment>
              );
            }

            return null;
          })}
        </div>
      )}

      {/* Floating Input Panel */}
      {selected && (
        <div
          className={clsx(
            "absolute top-[calc(100%+24px)] left-1/2 z-50 flex w-[min(620px,calc(100vw-3rem))] -translate-x-1/2 cursor-default flex-col gap-3 rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(36,36,40,0.96),rgba(20,20,24,0.92))] p-4 shadow-[0_22px_80px_rgba(0,0,0,0.42)] backdrop-blur-3xl transition-all duration-150",
            data.isAnyConnectionActive && "pointer-events-none opacity-0 scale-[0.98]"
          )}
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

              {/* Preset prompt suggestions */}
              {!prompt.trim() && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {[
                    '一位亚洲女性穿着这件衣服走在街头',
                    '白色背景的电商产品图',
                    '模特在咖啡厅的氛围感写真',
                    '极简风格的杂志大片',
                    '户外自然光下的穿搭展示',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPrompt(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-[11px] text-white/50 transition-colors hover:border-white/16 hover:bg-white/10 hover:text-white/80"
                    >
                      {suggestion}
                    </button>
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
                          className="inline rounded-[0.9em] bg-[linear-gradient(180deg,rgba(44,83,154,0.38),rgba(28,50,99,0.64))] font-semibold text-sky-50 shadow-[0_0_0_1px_rgba(59,130,246,0.34),0_0_12px_rgba(37,99,235,0.18),inset_0_1px_0_rgba(255,255,255,0.12)] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
                        >
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
                        <option value="gemini-3.1-flash-image-preview" className="bg-[#1C1C1C]">Nano Banana 2</option>
                        <option value="gemini-2.5-flash-image" className="bg-[#1C1C1C]">Nano Banana</option>
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
