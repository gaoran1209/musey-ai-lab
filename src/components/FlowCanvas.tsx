import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
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
import { ImageNode } from './nodes/ImageNode';
import { GoogleGenAI } from '@google/genai';
import { useHistory } from './HistoryContext';

const nodeTypes = {
  imageNode: ImageNode,
};

function Flow() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNode, getNodes, getEdges } = useReactFlow();
  const { addRecord, updateRecord } = useHistory();

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ 
      ...params, 
      animated: true, 
      style: { stroke: '#ffffff', opacity: 0.5, strokeWidth: 2 } 
    } as any, eds)),
    []
  );

  const handleGenerate = useCallback(
    async (nodeId: string, prompt: string, params?: any) => {
      const node = getNode(nodeId);
      if (!node) return;

      const nodes = getNodes();
      const edges = getEdges();

      const model = params?.model || 'gemini-3.1-flash-image-preview';
      const aspectRatio = params?.aspectRatio || '1:1';
      const resolution = params?.resolution || '1K';
      const isRetry = params?.isRetry === true;
      const quantity = isRetry ? 1 : (params?.quantity || 1);

      const isEmptyNode = !node.data.imageSrc;

      // Find connected input nodes
      const connectedEdges = edges.filter((e) => e.target === nodeId);
      const inputNodes = connectedEdges
        .map((e) => nodes.find((n) => n.id === e.source))
        .filter((n) => n?.data?.imageSrc);

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const nodesToUpdate: string[] = [];

      if (isEmptyNode) {
        nodesToUpdate.push(nodeId);
        for (let i = 1; i < quantity; i++) {
          const newNodeId = uuidv4();
          newNodes.push({
            id: newNodeId,
            type: 'imageNode',
            position: { x: node.position.x + 350, y: node.position.y + i * 320 },
            data: { isLoading: true, prompt, aspectRatio: aspectRatio.replace(':', '/'), onGenerate: handleGenerate },
          });
          newEdges.push({
            id: `e-${nodeId}-${newNodeId}`,
            source: nodeId,
            target: newNodeId,
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 2 },
          });
          nodesToUpdate.push(newNodeId);
        }
        
        setNodes((nds) => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isLoading: true, error: undefined, prompt, aspectRatio: aspectRatio.replace(':', '/') } } : n).concat(newNodes));
        setEdges((eds) => eds.concat(newEdges));
      } else {
        for (let i = 0; i < quantity; i++) {
          const newNodeId = uuidv4();
          newNodes.push({
            id: newNodeId,
            type: 'imageNode',
            position: { x: node.position.x + 350, y: node.position.y + i * 320 },
            data: { isLoading: true, prompt, aspectRatio: aspectRatio.replace(':', '/'), onGenerate: handleGenerate },
          });
          newEdges.push({
            id: `e-${nodeId}-${newNodeId}`,
            source: nodeId,
            target: newNodeId,
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 2 },
          });
          nodesToUpdate.push(newNodeId);
        }
        setNodes((nds) => nds.concat(newNodes));
        setEdges((eds) => eds.concat(newEdges));
      }

      const contents: any[] = [];
        
      // Add images from connected nodes
      inputNodes.forEach((n) => {
        if (n?.data?.imageSrc) {
          const mimeType = (n.data.imageSrc as string).match(/data:(.*?);/)?.[1] || 'image/jpeg';
          const base64Data = (n.data.imageSrc as string).split(',')[1];
          contents.push({
            inlineData: {
              data: base64Data,
              mimeType,
            },
          });
        }
      });

      // Add current node's image
      if (!isEmptyNode && node.data.imageSrc) {
        const mimeType = (node.data.imageSrc as string).match(/data:(.*?);/)?.[1] || 'image/jpeg';
        const base64Data = (node.data.imageSrc as string).split(',')[1];
        contents.push({
          inlineData: {
            data: base64Data,
            mimeType,
          },
        });
      }

      // Add text prompt
      contents.push({ text: prompt });

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
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const response = await ai.models.generateContent({
            model: model,
            contents: contents as any,
            config: {
              imageConfig: {
                aspectRatio: aspectRatio,
                imageSize: resolution,
              },
            },
          });

          let resultImageSrc = '';
          if (response.candidates && response.candidates[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
              if (part.inlineData) {
                resultImageSrc = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                break;
              }
            }
          }

          if (!resultImageSrc) {
            throw new Error('No image generated');
          }

          setNodes((nds) =>
            nds.map((n) =>
              n.id === targetNodeId
                ? { ...n, data: { ...n.data, imageSrc: resultImageSrc, isLoading: false, error: undefined } }
                : n
            )
          );

          if (targetNodeId !== nodeId) {
            setEdges((eds) =>
              eds.map((e) =>
                e.id === `e-${nodeId}-${targetNodeId}`
                  ? { ...e, animated: false, style: { stroke: '#ffffff', opacity: 0.4, strokeWidth: 2 } }
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
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorCode = (error as any).status || (error as any).code || 'UNKNOWN_ERROR';

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
                  ? { ...e, animated: false, style: { stroke: '#ef4444', strokeWidth: 2, opacity: 0.8 } }
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

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const file = event.dataTransfer.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const imageSrc = e.target?.result as string;
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        const newNode: Node = {
          id: uuidv4(),
          type: 'imageNode',
          position,
          data: { imageSrc, onGenerate: handleGenerate },
        };

        setNodes((nds) => nds.concat(newNode));
      };
      reader.readAsDataURL(file);
    },
    [screenToFlowPosition, handleGenerate]
  );

  const lastClickTime = useRef(0);

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      const now = Date.now();
      if (now - lastClickTime.current < 300) {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        const newNode: Node = {
          id: uuidv4(),
          type: 'imageNode',
          position,
          data: { onGenerate: handleGenerate }, // Empty image object
        };

        setNodes((nds) => nds.concat(newNode));
      }
      lastClickTime.current = now;
    },
    [screenToFlowPosition, handleGenerate]
  );

  React.useEffect(() => {
    const handleAddImageNode = () => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      const newNode: Node = {
        id: uuidv4(),
        type: 'imageNode',
        position,
        data: { onGenerate: handleGenerate },
      };
      setNodes((nds) => nds.concat(newNode));
    };

    window.addEventListener('add-image-node', handleAddImageNode);
    return () => window.removeEventListener('add-image-node', handleAddImageNode);
  }, [handleGenerate, screenToFlowPosition]);

  return (
    <div className="h-full w-full bg-[#0a0a0a]" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        colorMode="dark"
        className="react-flow-dark"
      >
        <Background color="#ffffff" gap={32} size={1} opacity={0.05} />
        <Controls className="!bg-[#141414] !border-white/10 !fill-white/70 shadow-2xl" />
      </ReactFlow>
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
