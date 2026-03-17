import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ConnectionLineType,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { ImageNode, type ReferenceImageOption, type LinkedImageDirection } from './nodes/ImageNode';
import { VideoNode } from './nodes/VideoNode';
import { GoogleGenAI } from '@google/genai';
import { useHistory } from './HistoryContext';
import { ImagePlus, Video } from 'lucide-react';
import { getStoredGeminiApiKey } from '../utils/geminiApiKey';

const nodeTypes = {
  imageNode: ImageNode,
  videoNode: VideoNode,
};

const DEFAULT_IMAGE_MODEL = 'gemini-3.1-image-flash-preview';
const DEFAULT_VIDEO_MODEL = 'veo-3.1-generate-preview';
const VIDEO_POLL_INTERVAL_MS = 10000;
const VIDEO_POLL_MAX_ATTEMPTS = 60;
const REFERENCE_IMAGE_LIMIT = 6;
const REFERENCE_EDGE_STYLE = {
  stroke: 'rgba(226, 232, 240, 0.82)',
  opacity: 1,
  strokeWidth: 2.75,
  strokeLinecap: 'round' as const,
  filter: 'drop-shadow(0 0 6px rgba(191, 219, 254, 0.28))',
};
const GENERATED_EDGE_PENDING_STYLE = {
  stroke: 'rgba(125, 211, 252, 0.96)',
  opacity: 1,
  strokeWidth: 2.8,
  strokeLinecap: 'round' as const,
  filter: 'drop-shadow(0 0 10px rgba(56, 189, 248, 0.36))',
};
const GENERATED_EDGE_SUCCESS_STYLE = {
  stroke: 'rgba(241, 245, 249, 0.72)',
  opacity: 1,
  strokeWidth: 2.55,
  strokeLinecap: 'round' as const,
  filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.18))',
};
const GENERATED_EDGE_ERROR_STYLE = {
  stroke: 'rgba(248, 113, 113, 0.94)',
  opacity: 1,
  strokeWidth: 2.7,
  strokeLinecap: 'round' as const,
  filter: 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.28))',
};
const ACTIVE_CONNECTION_LINE_STYLE = {
  stroke: 'rgba(191, 219, 254, 0.98)',
  strokeWidth: 3,
  strokeDasharray: '8 6',
  strokeLinecap: 'round' as const,
  filter: 'drop-shadow(0 0 10px rgba(96, 165, 250, 0.42))',
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function dataUrlToInlineData(dataUrl: string) {
  const mimeType = dataUrl.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const data = dataUrl.split(',')[1];

  if (!data) {
    throw new Error('Invalid media data URL');
  }

  return {
    data,
    mimeType,
  };
}

function base64ToUint8Array(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function videoToObjectUrl(video: any, apiKey: string) {
  if (video?.videoBytes) {
    const mimeType = video.mimeType || 'video/mp4';
    const bytes = base64ToUint8Array(video.videoBytes);
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  }

  if (!video?.uri) {
    throw new Error('Video generation finished but no downloadable video was returned.');
  }

  const response = await fetch(video.uri, {
    headers: {
      'x-goog-api-key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Video download failed (${response.status} ${response.statusText})`);
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function extractErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as Record<string, unknown>;
    return String(maybeError.status || maybeError.code || 'UNKNOWN_ERROR');
  }

  return 'UNKNOWN_ERROR';
}

function compareNodePositions(a: Node, b: Node) {
  if (a.position.y !== b.position.y) {
    return a.position.y - b.position.y;
  }

  if (a.position.x !== b.position.x) {
    return a.position.x - b.position.x;
  }

  return a.id.localeCompare(b.id);
}

function getReferenceImages(nodeId: string, nodes: Node[], edges: Edge[]): ReferenceImageOption[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => nodeMap.get(edge.source))
    .filter((node): node is Node => Boolean(node?.data?.imageSrc))
    .sort(compareNodePositions)
    .slice(0, REFERENCE_IMAGE_LIMIT)
    .map((node, index) => ({
      nodeId: node.id,
      imageSrc: node.data.imageSrc as string,
      label: `Image ${index + 1}`,
      prompt: typeof node.data.prompt === 'string' ? node.data.prompt : undefined,
    }));
}

function createImageNode(position: { x: number; y: number }, onGenerate: (nodeId: string, prompt: string, params?: any) => void): Node {
  return {
    id: uuidv4(),
    type: 'imageNode',
    position,
    data: { onGenerate },
  };
}

function getGeneratedNodeTitle(targetType: 'image' | 'video', index: number) {
  return targetType === 'video' ? `生成视频结果 ${index}` : `生成图像结果 ${index}`;
}

function createReferenceEdge(source: string, target: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    animated: false,
    style: REFERENCE_EDGE_STYLE,
  };
}

function Flow() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNode, getNodes, getEdges } = useReactFlow();
  const { addRecord, updateRecord } = useHistory();
  const [menuPos, setMenuPos] = useState<{x: number, y: number} | null>(null);
  const [menuFlowPos, setMenuFlowPos] = useState<{x: number, y: number} | null>(null);
  const [activeOutputConnectorNodeId, setActiveOutputConnectorNodeId] = useState<string | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return false;
      }

      const sourceNode = getNode(connection.source);
      const targetNode = getNode(connection.target);
      if (!sourceNode || !targetNode) {
        return false;
      }

      if (sourceNode.type !== 'imageNode' || targetNode.type !== 'imageNode') {
        return false;
      }

      return !edges.some((edge) => edge.source === connection.source && edge.target === connection.target);
    },
    [edges, getNode]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!isValidConnection(params)) {
        return;
      }

      setEdges((eds) => eds.concat(createReferenceEdge(params.source!, params.target!)));
    },
    [isValidConnection]
  );

  const onConnectStart = useCallback((_: React.MouseEvent | React.TouchEvent, params: { nodeId?: string | null; handleType?: string | null; handleId?: string | null }) => {
    if (params.handleType === 'source' && params.handleId === 'output-plus' && params.nodeId) {
      setActiveOutputConnectorNodeId(params.nodeId);
    }
  }, []);

  const onConnectEnd = useCallback(() => {
    setActiveOutputConnectorNodeId(null);
  }, []);

  const handleGenerate = useCallback(
    async (nodeId: string, prompt: string, params?: any) => {
      const node = getNode(nodeId);
      if (!node) return;

      const nodes = getNodes();
      const edges = getEdges();

      const model = params?.model || (params?.targetType === 'video' ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL);
      const aspectRatio = params?.aspectRatio || '1:1';
      const resolution = params?.resolution || '1K';
      const isRetry = params?.isRetry === true;
      const quantity = isRetry ? 1 : (params?.quantity || 1);
      const targetType = params?.targetType || 'image';
      const videoDuration = params?.videoDuration || '4';
      const generationParams = { model, aspectRatio, resolution, quantity, targetType, videoDuration };

      const isEmptyNode = !node.data.imageSrc && !node.data.videoSrc;
      const referenceImages = getReferenceImages(nodeId, nodes, edges);

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const nodesToUpdate: string[] = [];

      if (isEmptyNode) {
        nodesToUpdate.push(nodeId);
        for (let i = 1; i < quantity; i++) {
          const newNodeId = uuidv4();
          newNodes.push({
            id: newNodeId,
            type: targetType === 'video' ? 'videoNode' : 'imageNode',
            position: { x: node.position.x + 350, y: node.position.y + i * 320 },
            data: {
              isLoading: true,
              title: getGeneratedNodeTitle(targetType, i + 1),
              prompt,
              aspectRatio: aspectRatio.replace(':', '/'),
              onGenerate: handleGenerate,
              generationParams,
            },
          });
          newEdges.push({
            id: `e-${nodeId}-${newNodeId}`,
            source: nodeId,
            target: newNodeId,
            animated: true,
            style: GENERATED_EDGE_PENDING_STYLE,
          });
          nodesToUpdate.push(newNodeId);
        }
        
        setNodes((nds) => nds.map(n => n.id === nodeId ? {
          ...n,
          type: targetType === 'video' ? 'videoNode' : 'imageNode',
          data: {
            ...n.data,
            isLoading: true,
            error: undefined,
            title: getGeneratedNodeTitle(targetType, 1),
            prompt,
            aspectRatio: aspectRatio.replace(':', '/'),
            onGenerate: handleGenerate,
            generationParams,
          }
        } : n).concat(newNodes));
        setEdges((eds) => eds.concat(newEdges));
      } else {
        for (let i = 0; i < quantity; i++) {
          const newNodeId = uuidv4();
          newNodes.push({
            id: newNodeId,
            type: targetType === 'video' ? 'videoNode' : 'imageNode',
            position: { x: node.position.x + 350, y: node.position.y + i * 320 },
            data: {
              isLoading: true,
              title: getGeneratedNodeTitle(targetType, i + 1),
              prompt,
              aspectRatio: aspectRatio.replace(':', '/'),
              onGenerate: handleGenerate,
              generationParams,
            },
          });
          newEdges.push({
            id: `e-${nodeId}-${newNodeId}`,
            source: nodeId,
            target: newNodeId,
            animated: true,
            style: GENERATED_EDGE_PENDING_STYLE,
          });
          nodesToUpdate.push(newNodeId);
        }
        setNodes((nds) => nds.concat(newNodes));
        setEdges((eds) => eds.concat(newEdges));
      }

      const imageSources = referenceImages.map((image) => image.imageSrc);
      if (!imageSources.length && !isEmptyNode && node.data.imageSrc) {
        imageSources.push(node.data.imageSrc as string);
      }

      const generatePromises = nodesToUpdate.map(async (targetNodeId) => {
        const historyId = uuidv4();
        addRecord({
          id: historyId,
          requestTime: Date.now(),
          prompt,
          status: 'pending',
          isRetry,
        });

        try {
          const apiKey = getStoredGeminiApiKey();
          if (!apiKey) {
            throw new Error('Missing Gemini API key');
          }

          const ai = new GoogleGenAI({ apiKey });
          let resultMediaSrc = '';

          if (targetType === 'video') {
            let operation = await ai.models.generateVideos({
              model,
              prompt,
              ...(imageSources[0] ? {
                image: {
                  imageBytes: dataUrlToInlineData(imageSources[0]).data,
                  mimeType: dataUrlToInlineData(imageSources[0]).mimeType,
                },
              } : {}),
              config: {
                numberOfVideos: 1,
                aspectRatio,
                resolution,
                durationSeconds: Number(videoDuration),
              },
            });

            let attempts = 0;
            while (!operation.done) {
              attempts += 1;
              if (attempts > VIDEO_POLL_MAX_ATTEMPTS) {
                throw new Error('Video generation timed out. Please try again.');
              }

              await sleep(VIDEO_POLL_INTERVAL_MS);
              operation = await ai.operations.getVideosOperation({ operation });
            }

            if (operation.error) {
              const operationError =
                typeof operation.error.message === 'string'
                  ? operation.error.message
                  : JSON.stringify(operation.error);
              throw new Error(operationError || 'Video generation failed.');
            }

            const generatedVideo = operation.response?.generatedVideos?.[0]?.video;
            resultMediaSrc = await videoToObjectUrl(generatedVideo, apiKey);
          } else {
            const contents: any[] = imageSources.map((imageSrc) => ({
              inlineData: dataUrlToInlineData(imageSrc),
            }));
            contents.push({ text: prompt });

            const response = await ai.models.generateContent({
              model,
              contents: contents as any,
              config: {
                imageConfig: {
                  aspectRatio,
                  imageSize: resolution,
                }
              },
            });

            if (response.candidates && response.candidates[0]?.content?.parts) {
              for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                  resultMediaSrc = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                  break;
                }
              }
            }
          }

          if (!resultMediaSrc) {
            throw new Error(`No ${targetType} generated`);
          }

          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === targetNodeId) {
                const newData = { ...n.data, isLoading: false, error: undefined };
                if (targetType === 'video') {
                  if (typeof n.data.videoSrc === 'string' && n.data.videoSrc.startsWith('blob:')) {
                    URL.revokeObjectURL(n.data.videoSrc);
                  }
                  newData.videoSrc = resultMediaSrc;
                } else {
                  newData.imageSrc = resultMediaSrc;
                }
                return { ...n, data: newData };
              }
              return n;
            })
          );

          if (targetNodeId !== nodeId) {
            setEdges((eds) =>
              eds.map((e) =>
                e.id === `e-${nodeId}-${targetNodeId}`
                  ? { ...e, animated: false, style: GENERATED_EDGE_SUCCESS_STYLE }
                  : e
              )
            );
          }

          updateRecord(historyId, {
            status: 'success',
            responseTime: Date.now(),
          });
        } catch (error) {
          console.error(`Generation failed for node ${targetNodeId}:`, error);
          const errorMessage = extractErrorMessage(error);
          const errorCode = extractErrorCode(error);

          setNodes((nds) =>
            nds.map((n) =>
              n.id === targetNodeId
                ? { ...n, data: { ...n.data, isLoading: false, error: errorMessage } }
                : n
            )
          );
          if (targetNodeId !== nodeId) {
            setEdges((eds) =>
              eds.map((e) =>
                e.id === `e-${nodeId}-${targetNodeId}`
                  ? { ...e, animated: false, style: GENERATED_EDGE_ERROR_STYLE }
                  : e
              )
            );
          }

          updateRecord(historyId, {
            status: 'error',
            responseTime: Date.now(),
            errorMessage,
            errorCode: String(errorCode),
          });
        }
      });

      await Promise.all(generatePromises);
    },
    [getNode, getNodes, getEdges, addRecord, updateRecord]
  );

  const handleCreateLinkedImageNode = useCallback(
    (nodeId: string, direction: LinkedImageDirection) => {
      const currentNode = getNode(nodeId);
      if (!currentNode) return;

      const relatedEdges = direction === 'input'
        ? edges.filter((edge) => edge.target === nodeId)
        : edges.filter((edge) => edge.source === nodeId);
      const verticalOffset = relatedEdges.length * 36;
      const position = {
        x: currentNode.position.x + (direction === 'input' ? -350 : 350),
        y: currentNode.position.y + verticalOffset,
      };
      const newNode = createImageNode(position, handleGenerate);
      const newEdge = createReferenceEdge(
        direction === 'input' ? newNode.id : nodeId,
        direction === 'input' ? nodeId : newNode.id
      );

      setNodes((nds) => nds.concat(newNode));
      setEdges((eds) => eds.concat(newEdge));
    },
    [edges, getNode, handleGenerate]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const files = Array.from(event.dataTransfer.files || []) as File[];
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      if (!imageFiles.length) return;

      const dropPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      Promise.all(
        imageFiles.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (loadEvent) => resolve(loadEvent.target?.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            })
        )
      )
        .then((imageSources) => {
          const newNodes: Node[] = imageSources.map((imageSrc, index) => ({
            id: uuidv4(),
            type: 'imageNode',
            position: {
              x: dropPosition.x + index * 320,
              y: dropPosition.y,
            },
            data: { imageSrc, onGenerate: handleGenerate },
          }));

          setNodes((nds) => nds.concat(newNodes));
        })
        .catch((error) => {
          console.error('Failed to load dropped images:', error);
        });
    },
    [screenToFlowPosition, handleGenerate]
  );

  const lastClickTime = useRef(0);

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      window.dispatchEvent(new Event('close-sidebar-overlays'));
      const now = Date.now();
      if (now - lastClickTime.current < 300) {
        setMenuPos({ x: event.clientX, y: event.clientY });
        setMenuFlowPos(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      } else {
        setMenuPos(null);
      }
      lastClickTime.current = now;
    },
    [screenToFlowPosition]
  );

  React.useEffect(() => {
    const handleAddImageNode = () => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      setNodes((nds) => nds.concat(createImageNode(position, handleGenerate)));
    };

    const handleAddVideoNode = () => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2 + 50,
        y: window.innerHeight / 2 + 50,
      });

      const newNode: Node = {
        id: uuidv4(),
        type: 'videoNode',
        position,
        data: { onGenerate: handleGenerate },
      };
      setNodes((nds) => nds.concat(newNode));
    };

    window.addEventListener('add-image-node', handleAddImageNode);
    window.addEventListener('add-video-node', handleAddVideoNode);
    return () => {
      window.removeEventListener('add-image-node', handleAddImageNode);
      window.removeEventListener('add-video-node', handleAddVideoNode);
    };
  }, [handleGenerate, screenToFlowPosition]);

  const nodesWithDerivedData = nodes.map((node) => {
    if (node.type === 'imageNode') {
      return {
        ...node,
        data: {
          ...node.data,
          onGenerate: handleGenerate,
          referenceImages: getReferenceImages(node.id, nodes, edges),
          onCreateLinkedImageNode: handleCreateLinkedImageNode,
          isOutputConnectorActive: activeOutputConnectorNodeId === node.id,
          isConnectionTargetMode: activeOutputConnectorNodeId !== null && activeOutputConnectorNodeId !== node.id,
        },
      };
    }

    if (node.type === 'videoNode') {
      return {
        ...node,
        data: {
          ...node.data,
          onGenerate: handleGenerate,
        },
      };
    }

    return node;
  });

  return (
    <div className="h-full w-full bg-[#0a0a0a]" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodesWithDerivedData}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={ACTIVE_CONNECTION_LINE_STYLE}
        defaultEdgeOptions={{ style: REFERENCE_EDGE_STYLE }}
        fitView
        fitViewOptions={{ padding: 1.2, minZoom: 0.2, maxZoom: 1 }}
        zoomOnDoubleClick={false}
        colorMode="dark"
        className="react-flow-dark"
      >
        <Background color="#ffffff" gap={32} size={1} opacity={0.05} />
        <Controls className="!bg-[#141414] !border-white/10 !fill-white/70 shadow-2xl" />
      </ReactFlow>

      {menuPos && (
      <div
          className="absolute z-50 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col min-w-[160px] animate-fade-in"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <button
            className="px-4 py-3 text-sm text-white hover:bg-white/10 text-left flex items-center gap-3 transition-colors border-b border-white/5"
            onClick={() => {
              setNodes((nds) => nds.concat(createImageNode(menuFlowPos!, handleGenerate)));
              setMenuPos(null);
            }}
          >
            <ImagePlus className="w-4 h-4 text-blue-400" /> 图像节点 Image Node
          </button>
          <button
            className="px-4 py-3 text-sm text-white hover:bg-white/10 text-left flex items-center gap-3 transition-colors"
            onClick={() => {
              setNodes(nds => nds.concat({ id: uuidv4(), type: 'videoNode', position: menuFlowPos!, data: { onGenerate: handleGenerate } }));
              setMenuPos(null);
            }}
          >
            <Video className="w-4 h-4 text-emerald-400" /> 视频节点 Video Node
          </button>
        </div>
      )}
    </div>
  );
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
