import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import { Loader2, UploadCloud, Send, Mic, Sparkles, Layout, Image as ImageIcon, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { v4 as uuidv4 } from 'uuid';

export type ImageNodeData = {
  imageSrc?: string;
  isLoading?: boolean;
  prompt?: string;
  aspectRatio?: number | string;
  error?: string;
  onGenerate?: (nodeId: string, prompt: string, params?: any) => void;
};

export type ImageNodeType = Node<ImageNodeData, 'imageNode'>;

export function ImageNode({ id, data, selected }: NodeProps<ImageNodeType>) {
  const { setNodes, setEdges, getNodes, updateNodeData } = useReactFlow();
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const promptRef = useRef(prompt);
  const basePromptRef = useRef('');

  const [model, setModel] = useState('gemini-3.1-flash-image-preview');
  const [aspectRatio, setAspectRatio] = useState('3:4');
  const [resolution, setResolution] = useState('2K');
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  const startRecording = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
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

  const stopRecording = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch(err) {}
      setIsRecording(false);
    }
  }, []);

  useEffect(() => {
    if (selected && data.imageSrc && !data.isLoading) {
      // Small delay to ensure it focuses after rendering
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [selected, data.imageSrc, data.isLoading]);

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
      data.onGenerate(id, prompt, { model, aspectRatio, resolution, quantity });
      setPrompt('');
    }
  };

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
  }, [id, setNodes, setEdges]);

  return (
    <div className={clsx(
      "relative transition-all duration-200",
      selected ? "ring-2 ring-blue-500/50 rounded-2xl" : ""
    )}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500 border-2 border-gray-900" />
      
      {/* Title */}
      <div className="absolute -top-6 left-0 text-xs text-neutral-400 flex items-center gap-1 max-w-full overflow-hidden whitespace-nowrap text-ellipsis">
        <ImageIcon className="w-3 h-3 shrink-0" />
        <span className="truncate">{data.prompt || 'Image'}</span>
      </div>

      {/* Delete Button */}
      {selected && (
        <button
          onClick={handleDelete}
          className="absolute -top-3 -right-3 bg-red-500/80 hover:bg-red-500 text-white p-1.5 rounded-full shadow-lg z-50 transition-colors border border-white/10"
          title="Delete Node"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
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
        className="relative bg-[#1A1A1A] rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center"
        style={{ 
          width: '280px', 
          aspectRatio: data.aspectRatio || '3/4' 
        }}
      >
        {data.isLoading ? (
          <div className="absolute inset-0 z-20 overflow-hidden bg-[#2A2A2A]">
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        ) : null}

        {data.imageSrc ? (
          <img
            src={data.imageSrc}
            alt="Node content"
            className="w-full h-full object-cover animate-fade-in"
            onLoad={(e) => {
              const img = e.target as HTMLImageElement;
              const ratio = img.naturalWidth / img.naturalHeight;
              if (!data.aspectRatio || Math.abs(Number(data.aspectRatio) - ratio) > 0.01) {
                updateNodeData(id, { aspectRatio: ratio });
              }
            }}
          />
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
        <div className="absolute top-[calc(100%+24px)] left-1/2 -translate-x-1/2 w-[420px] bg-[#1C1C1C] rounded-2xl p-4 shadow-2xl border border-white/10 z-50 cursor-default" onClick={e => e.stopPropagation()}>
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述任何你想要生成的内容"
            className="w-full bg-transparent text-sm text-white placeholder-neutral-500 resize-none outline-none min-h-[60px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGenerate(e);
              }
              e.stopPropagation();
            }}
          />
          
          <div className="flex items-center justify-between mt-4 text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              {/* Model Selector */}
              <div className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors border border-white/5">
                <Sparkles className="w-3.5 h-3.5" />
                <select 
                  value={model} 
                  onChange={e => setModel(e.target.value)} 
                  className="bg-transparent outline-none cursor-pointer appearance-none text-white"
                >
                  <option value="gemini-3.1-flash-image-preview" className="bg-[#1C1C1C]">Banana 2</option>
                  <option value="gemini-2.5-flash-image" className="bg-[#1C1C1C]">Banana 1</option>
                </select>
              </div>
              
              {/* AR & Res Selector */}
              <div className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors border border-white/5">
                <Layout className="w-3.5 h-3.5" />
                <select 
                  value={aspectRatio} 
                  onChange={e => setAspectRatio(e.target.value)} 
                  className="bg-transparent outline-none cursor-pointer appearance-none text-white"
                >
                  <option value="1:1" className="bg-[#1C1C1C]">1:1</option>
                  <option value="3:4" className="bg-[#1C1C1C]">3:4</option>
                  <option value="4:3" className="bg-[#1C1C1C]">4:3</option>
                  <option value="9:16" className="bg-[#1C1C1C]">9:16</option>
                  <option value="16:9" className="bg-[#1C1C1C]">16:9</option>
                </select>
                <span className="text-neutral-600">·</span>
                <select 
                  value={resolution} 
                  onChange={e => setResolution(e.target.value)} 
                  className="bg-transparent outline-none cursor-pointer appearance-none text-white"
                >
                  <option value="1K" className="bg-[#1C1C1C]">1K</option>
                  <option value="2K" className="bg-[#1C1C1C]">2K</option>
                  <option value="4K" className="bg-[#1C1C1C]">4K</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors border border-white/5">
                <select 
                  value={quantity} 
                  onChange={e => setQuantity(Number(e.target.value))} 
                  className="bg-transparent outline-none cursor-pointer appearance-none text-white text-xs"
                >
                  <option value={1} className="bg-[#1C1C1C]">1x</option>
                  <option value={2} className="bg-[#1C1C1C]">2x</option>
                  <option value={3} className="bg-[#1C1C1C]">3x</option>
                  <option value={4} className="bg-[#1C1C1C]">4x</option>
                </select>
              </div>
              
              {/* Voice Input Button */}
              <button
                type="button"
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={clsx(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-all border border-white/5",
                  isRecording ? "bg-red-500/80 text-white animate-pulse" : "bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10"
                )}
                title="Hold to speak"
              >
                <Mic className="h-4 w-4" />
              </button>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || data.isLoading}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all font-medium",
                  prompt.trim() && !data.isLoading
                    ? "bg-white/10 text-white hover:bg-white/20 border border-white/10"
                    : "bg-white/5 text-neutral-600 border border-transparent cursor-not-allowed"
                )}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500 border-2 border-gray-900" />
    </div>
  );
}
