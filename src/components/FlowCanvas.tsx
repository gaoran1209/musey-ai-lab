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
import {
  type SkillType,
  type SkillExecuteOptions,
  type AnalysisType,
  getSkillTitle,
  SCENE_EXTRACT_PROMPT,
  buildAtmosphereBlendPrompt,
  PRECISE_BG_REPLACE_PROMPT,
  FACE_SWAP_PROMPT,
  FEATURES_EXTRACT_PROMPT,
  buildReplicaPrompt,
  buildTryonPrompt,
  CLOTHING_CATEGORY_PROMPT,
  parseClothingCategoryResult,
  ART_STYLE_DESCRIPTION_PROMPT,
  ART_STYLE_RECOGNITION_PROMPT,
  parseArtStyleResult,
} from '../services/skillPrompts';

const nodeTypes = {
  imageNode: ImageNode,
  videoNode: VideoNode,
};

const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const DEFAULT_VIDEO_MODEL = 'veo-3.1-generate-preview';
const VIDEO_POLL_INTERVAL_MS = 10000;
const VIDEO_POLL_MAX_ATTEMPTS = 60;
const REFERENCE_IMAGE_LIMIT = 6;
const FLOW_EDGE_STYLE = {
  stroke: 'rgba(229, 231, 235, 0.92)',
  opacity: 1,
  strokeWidth: 2.65,
  strokeDasharray: '10 8',
  strokeLinecap: 'round' as const,
  filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.16))',
};
const ACTIVE_CONNECTION_LINE_STYLE = {
  stroke: 'rgba(229, 231, 235, 0.96)',
  strokeWidth: 2.85,
  strokeDasharray: '10 8',
  strokeLinecap: 'round' as const,
  filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.2))',
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

async function videoToObjectUrl(video: any, ai: GoogleGenAI, apiKey: string) {
  if (video?.videoBytes) {
    const mimeType = video.mimeType || 'video/mp4';
    const bytes = base64ToUint8Array(video.videoBytes);
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  }

  if (!video?.downloadUri && !video?.uri && typeof video?.name === 'string') {
    const file = await ai.files.get({ name: video.name });
    video = {
      ...video,
      ...file,
    };
  }

  const downloadUrl =
    video?.downloadUri ||
    video?.uri ||
    video?.gcsUri;

  if (!downloadUrl) {
    throw new Error('Video generation finished but no downloadable video was returned.');
  }

  const response = await fetch(downloadUrl, {
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

function extractGeneratedVideoResult(operation: any) {
  const response = operation?.response;
  const filteredCount = response?.raiMediaFilteredCount ?? 0;
  const filteredReasons = Array.isArray(response?.raiMediaFilteredReasons)
    ? response.raiMediaFilteredReasons.filter(Boolean)
    : [];

  const generatedVideo =
    response?.generatedVideos?.[0]?.video ||
    response?.videos?.[0] ||
    response?.generatedSamples?.[0]?.video ||
    response?.generateVideoResponse?.generatedSamples?.[0]?.video ||
    null;

  return {
    generatedVideo,
    filteredCount,
    filteredReasons,
  };
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
    animated: true,
    style: FLOW_EDGE_STYLE,
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
            style: FLOW_EDGE_STYLE,
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
            style: FLOW_EDGE_STYLE,
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

            let videoResult = extractGeneratedVideoResult(operation);
            let finalizedAttempts = 0;

            while (!videoResult.generatedVideo && finalizedAttempts < 3) {
              finalizedAttempts += 1;
              await sleep(2000);
              operation = await ai.operations.getVideosOperation({ operation });
              videoResult = extractGeneratedVideoResult(operation);
            }

            if (!videoResult.generatedVideo) {
              if (videoResult.filteredCount > 0) {
                const detail = videoResult.filteredReasons.length
                  ? ` (${videoResult.filteredReasons.join(', ')})`
                  : '';
                throw new Error(`Video generation was filtered by safety checks${detail}.`);
              }

              throw new Error('Video generation completed, but no video payload was returned by Gemini.');
            }

            resultMediaSrc = await videoToObjectUrl(videoResult.generatedVideo, ai, apiKey);
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
                  ? { ...e, animated: true, style: FLOW_EDGE_STYLE }
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
                  ? { ...e, animated: true, style: FLOW_EDGE_STYLE }
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

  const handleSkillExecute = useCallback(
    async (nodeId: string, skillType: SkillType, options?: SkillExecuteOptions) => {
      const node = getNode(nodeId);
      if (!node || !node.data.imageSrc) return;

      const skillImages = options?.skillImages || [];
      if (skillImages.length === 0) return;

      const apiKey = getStoredGeminiApiKey();
      if (!apiKey) {
        console.error('Missing Gemini API key');
        return;
      }

      const batchSize = options?.batchSize || 1;
      const mode = options?.mode || 'precise';
      const ai = new GoogleGenAI({ apiKey });

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      // Layout constants
      const ROW_STRIDE = 480; // vertical spacing between rows (node height + gap)
      const COL_OFFSET = 350; // horizontal offset for output nodes

      // Find the lowest Y among existing nodes in the same column region
      // to avoid overlapping with previously created skill nodes
      const allNodes = getNodes();
      const xMin = node.position.x - 50;
      const xMax = node.position.x + COL_OFFSET + 330; // cover both input & output columns
      let maxBottomY = node.position.y; // at least below the source node
      for (const n of allNodes) {
        if (n.id === nodeId) continue;
        if (n.position.x >= xMin && n.position.x <= xMax) {
          const bottomY = n.position.y;
          if (bottomY > maxBottomY) maxBottomY = bottomY;
        }
      }
      const startY = maxBottomY + ROW_STRIDE;

      // Create nodes for newly uploaded images (skip if from existing node)
      // Positioned below the source image, stacking vertically
      const inputNodeIds: string[] = [];
      skillImages.forEach((img, i) => {
        if (img.fromNodeId) {
          inputNodeIds.push(img.fromNodeId);
        } else {
          const newId = uuidv4();
          inputNodeIds.push(newId);
          newNodes.push({
            id: newId,
            type: 'imageNode',
            position: { x: node.position.x, y: startY + i * ROW_STRIDE },
            data: {
              imageSrc: img.imageSrc,
              title: img.label,
              onGenerate: handleGenerate,
            },
          });
        }
      });

      // Create output nodes — positioned to the right of the input row
      const outputNodeIds: string[] = [];
      for (let i = 0; i < batchSize; i++) {
        const outputId = uuidv4();
        outputNodeIds.push(outputId);
        newNodes.push({
          id: outputId,
          type: 'imageNode',
          position: { x: node.position.x + COL_OFFSET, y: startY + i * ROW_STRIDE },
          data: {
            isLoading: true,
            title: getSkillTitle(skillType, i + 1),
            onGenerate: handleGenerate,
          },
        });
        // Edge from source node → output
        newEdges.push(createReferenceEdge(nodeId, outputId));
        // Edges from input material nodes → output
        inputNodeIds.forEach((uid) => {
          newEdges.push(createReferenceEdge(uid, outputId));
        });
      }

      setNodes((nds) => nds.concat(newNodes));
      setEdges((eds) => eds.concat(newEdges));

      // Execute for each output node
      const executePromises = outputNodeIds.map(async (outputId) => {
        const historyId = uuidv4();
        const skillLabel =
          skillType === 'change-background' ? '换背景' :
          skillType === 'change-model' ? '换模特' : '试穿';
        addRecord({
          id: historyId,
          requestTime: Date.now(),
          prompt: `[${skillLabel}] ${mode}`,
          status: 'pending',
        });

        try {
          let prompt: string;
          let imageSources: string[];
          const apiModel = 'gemini-3.1-flash-image-preview';

          switch (skillType) {
            case 'change-background': {
              if (mode === 'atmosphere') {
                // Step 1: Extract scene description from background image
                const sceneResponse = await ai.models.generateContent({
                  model: 'gemini-3.1-pro-preview',
                  contents: [
                    { inlineData: dataUrlToInlineData(skillImages[0].imageSrc) },
                    { text: SCENE_EXTRACT_PROMPT },
                  ],
                });
                const sceneText =
                  sceneResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';

                // Step 2: Generate with atmosphere blend
                prompt = buildAtmosphereBlendPrompt(sceneText);
                imageSources = [node.data.imageSrc as string];
              } else {
                // Precise replacement: both images in one call
                prompt = PRECISE_BG_REPLACE_PROMPT;
                imageSources = [node.data.imageSrc as string, skillImages[0].imageSrc];
              }
              break;
            }

            case 'change-model': {
              if (mode === 'replica') {
                // Step 1: Extract features from original image
                const featuresResponse = await ai.models.generateContent({
                  model: 'gemini-3.1-pro-preview',
                  contents: [
                    { inlineData: dataUrlToInlineData(node.data.imageSrc as string) },
                    { text: FEATURES_EXTRACT_PROMPT },
                  ],
                });
                const featuresText =
                  featuresResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';

                // Step 2: Generate with extracted features + target face
                prompt = buildReplicaPrompt(featuresText);
                imageSources = [node.data.imageSrc as string, skillImages[0].imageSrc];
              } else {
                // Face swap: both images in one call
                prompt = FACE_SWAP_PROMPT;
                imageSources = [node.data.imageSrc as string, skillImages[0].imageSrc];
              }
              break;
            }

            case 'tryon': {
              const taggedRefs = skillImages.map((img) => ({
                label: img.label,
                tag: img.tag || '上衣',
              }));
              prompt = buildTryonPrompt(taggedRefs);
              imageSources = [
                node.data.imageSrc as string,
                ...skillImages.map((r) => r.imageSrc),
              ];
              break;
            }

            default:
              throw new Error(`Unknown skill type: ${skillType}`);
          }

          // Build contents array
          const contents: any[] = imageSources.map((src) => ({
            inlineData: dataUrlToInlineData(src),
          }));
          contents.push({ text: prompt });

          const response = await ai.models.generateContent({
            model: apiModel,
            contents: contents as any,
            config: {
              imageConfig: {
                aspectRatio: '3:4',
                imageSize: '2K',
              },
            },
          });

          let resultSrc = '';
          if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
              if (part.inlineData) {
                resultSrc = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                break;
              }
            }
          }

          if (!resultSrc) {
            throw new Error('No image generated');
          }

          setNodes((nds) =>
            nds.map((n) =>
              n.id === outputId
                ? { ...n, data: { ...n.data, isLoading: false, error: undefined, imageSrc: resultSrc } }
                : n
            )
          );

          updateRecord(historyId, {
            status: 'success',
            responseTime: Date.now(),
          });
        } catch (error) {
          console.error(`Skill execution failed for node ${outputId}:`, error);
          const errorMessage = extractErrorMessage(error);
          const errorCode = extractErrorCode(error);

          setNodes((nds) =>
            nds.map((n) =>
              n.id === outputId
                ? { ...n, data: { ...n.data, isLoading: false, error: errorMessage } }
                : n
            )
          );

          updateRecord(historyId, {
            status: 'error',
            responseTime: Date.now(),
            errorMessage,
            errorCode: String(errorCode),
          });
        }
      });

      await Promise.all(executePromises);
    },
    [getNode, handleGenerate, addRecord, updateRecord]
  );

  const handleAnalyze = useCallback(
    async (nodeId: string, analysisType: AnalysisType) => {
      const node = getNode(nodeId);
      if (!node || !node.data.imageSrc) return;

      const apiKey = getStoredGeminiApiKey();
      if (!apiKey) {
        console.error('Missing Gemini API key');
        return;
      }

      // Set loading state
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, analysisResult: { type: analysisType, loading: true } } }
            : n
        )
      );

      const ai = new GoogleGenAI({ apiKey });

      try {
        if (analysisType === 'clothing-category') {
          const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: [
              { inlineData: dataUrlToInlineData(node.data.imageSrc as string) },
              { text: CLOTHING_CATEGORY_PROMPT },
            ],
          });
          const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const parsed = parseClothingCategoryResult(text);

          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      analysisResult: {
                        type: 'clothing-category',
                        loading: false,
                        data: parsed,
                      },
                    },
                  }
                : n
            )
          );
        } else if (analysisType === 'art-style') {
          // Step 1: Generate dense style description
          const descResponse = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: [
              { inlineData: dataUrlToInlineData(node.data.imageSrc as string) },
              { text: ART_STYLE_DESCRIPTION_PROMPT },
            ],
          });
          const description = descResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';

          // Step 2: LLM-based style recognition with description
          const styleResponse = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: [
              { inlineData: dataUrlToInlineData(node.data.imageSrc as string) },
              { text: `以下是该图片的密集风格描述：\n${description}\n\n${ART_STYLE_RECOGNITION_PROMPT}` },
            ],
          });
          const styleText = styleResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const parsed = parseArtStyleResult(styleText);

          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      analysisResult: {
                        type: 'art-style',
                        loading: false,
                        data: { description, ...parsed },
                      },
                    },
                  }
                : n
            )
          );
        }
      } catch (error) {
        console.error('Analysis failed:', error);
        const errorMessage = extractErrorMessage(error);

        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    analysisResult: {
                      type: analysisType,
                      loading: false,
                      error: errorMessage,
                    },
                  },
                }
              : n
          )
        );
      }
    },
    [getNode]
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
          onSkillExecute: handleSkillExecute,
          onAnalyze: handleAnalyze,
          isOutputConnectorActive: activeOutputConnectorNodeId === node.id,
          isConnectionTargetMode: activeOutputConnectorNodeId !== null && activeOutputConnectorNodeId !== node.id,
          isAnyConnectionActive: activeOutputConnectorNodeId !== null,
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
        defaultEdgeOptions={{ style: FLOW_EDGE_STYLE, animated: true }}
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
