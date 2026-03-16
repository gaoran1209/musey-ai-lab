import React, { useRef, useCallback, useState } from 'react';
import { Handle, Position, NodeProps, Node, useReactFlow } from '@xyflow/react';
import { Loader2, UploadCloud, Sparkles, Video as VideoIcon, Trash2, Download, Play, Pause } from 'lucide-react';
import clsx from 'clsx';

export type VideoNodeData = {
  videoSrc?: string;
  isLoading?: boolean;
  prompt?: string;
  aspectRatio?: number | string;
  error?: string;
  generationParams?: any;
  onGenerate?: (nodeId: string, prompt: string, params?: any) => void;
};

export type VideoNodeType = Node<VideoNodeData, 'videoNode'>;

export function VideoNode({ id, data, selected }: NodeProps<VideoNodeType>) {
  const { setNodes, setEdges, updateNodeData } = useReactFlow();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size to 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert("Video file size must be less than 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, videoSrc: result } } : n
        )
      );
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
  }, [id, setNodes, setEdges]);

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.videoSrc) return;
    const a = document.createElement('a');
    a.href = data.videoSrc;
    a.download = `video-${id}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [data.videoSrc, id]);

  const togglePlayback = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const p = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(p || 0);
    }
  };

  return (
    <div className={clsx(
      "relative transition-all duration-200",
      selected ? "ring-2 ring-blue-500/50 rounded-2xl" : ""
    )}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500 border-2 border-gray-900" />

      {/* Title */}
      <div className="absolute -top-6 left-0 text-xs text-neutral-400 flex items-center gap-1 max-w-full overflow-hidden whitespace-nowrap text-ellipsis">
        <VideoIcon className="w-3 h-3 shrink-0" />
        <span className="truncate">{data.prompt || 'Video'}</span>
      </div>

      {/* Hover Action Buttons */}
      <div className={clsx(
        "absolute -top-3 -right-3 flex gap-2 z-50 transition-opacity",
        selected ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {data.videoSrc && !data.isLoading && (
          <button
            onClick={handleDownload}
            className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded-full shadow-lg transition-colors border border-white/10 backdrop-blur-md"
            title="Download Video"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={handleDelete}
          className="bg-white/10 hover:bg-white/20 p-1.5 rounded-full shadow-lg transition-colors border border-white/10 backdrop-blur-md"
          title="Delete Node"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-500" />
        </button>
      </div>

      {/* Floating Upload Button for Empty State */}
      {!data.videoSrc && !data.isLoading && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10">
          <label className="flex items-center gap-2 bg-[#2A2A2A] hover:bg-[#333] text-white px-4 py-2 rounded-full cursor-pointer text-xs shadow-lg border border-white/10 transition-colors whitespace-nowrap">
            <UploadCloud className="w-4 h-4" />
            上传视频
            <input
              type="file"
              className="hidden"
              accept="video/*"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      )}

      {/* Main Video Container */}
      <div
        className="relative bg-[#1A1A1A] rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center group"
        style={{
          width: '280px',
          aspectRatio: data.aspectRatio || '9/16'
        }}
      >
        {data.isLoading ? (
          <div className="absolute inset-0 z-20 overflow-hidden bg-[#2A2A2A]">
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              <span className="text-xs text-neutral-400 font-medium tracking-wide animate-pulse">
                生成中 ...
              </span>
            </div>
          </div>
        ) : null}

        {data.videoSrc ? (
          <>
            <video
              ref={videoRef}
              src={data.videoSrc}
              className="w-full h-full object-cover animate-fade-in"
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
              onLoadedMetadata={(e) => {
                const vid = e.target as HTMLVideoElement;
                const ratio = vid.videoWidth / vid.videoHeight;
                if (!data.aspectRatio || Math.abs(Number(data.aspectRatio) - ratio) > 0.01) {
                  updateNodeData(id, { aspectRatio: ratio });
                }
              }}
              loop
            />
            {/* Playback Controls Overlay */}
            <div
              className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 cursor-pointer"
              onClick={togglePlayback}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/10 text-white shadow-xl transform scale-90 group-hover:scale-100 transition-all">
                  {isPlaying ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5 ml-1" fill="currentColor" />}
                </div>
              </div>
              <div className="relative z-10 w-full h-1 bg-white/20 rounded-full overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="h-full bg-blue-500 transition-all duration-100" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </>
        ) : !data.isLoading ? (
          <div className="absolute inset-2 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-lg p-4 text-center">
            {data.error ? (
              <>
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
                  <Sparkles className="w-5 h-5 text-red-400" />
                </div>
                <p className="text-xs text-red-400 mb-4 line-clamp-3">{data.error}</p>
                {data.onGenerate && data.prompt ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      data.onGenerate?.(id, data.prompt, {
                        ...(data.generationParams || {}),
                        isRetry: true,
                      });
                    }}
                    className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-full transition-colors"
                  >
                    重试 (Retry)
                  </button>
                ) : null}
              </>
            ) : (
              <VideoIcon className="w-8 h-8 text-white/10" />
            )}
          </div>
        ) : null}
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500 border-2 border-gray-900" />
    </div>
  );
}
