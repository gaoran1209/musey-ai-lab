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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const nodeTypes = {
  imageNode: ImageNode,
};

function Flow() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

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
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const model = params?.model || 'gemini-3.1-flash-image-preview';
      const aspectRatio = params?.aspectRatio || '1:1';
      const resolution = params?.resolution || '1K';
      const quantity = params?.quantity || 1;

      // Find connected input nodes
      const connectedEdges = edges.filter((e) => e.target === nodeId);
      const inputNodes = connectedEdges
        .map((e) => nodes.find((n) => n.id === e.source))
        .filter((n) => n?.data?.imageSrc);

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      for (let i = 0; i < quantity; i++) {
        const newNodeId = uuidv4();
        const newPosition = {
          x: node.position.x + 350,
          y: node.position.y + i * 320,
        };

        newNodes.push({
          id: newNodeId,
          type: 'imageNode',
          position: newPosition,
          data: {
            isLoading: true,
            prompt,
            aspectRatio: aspectRatio.replace(':', '/'),
            onGenerate: handleGenerate,
          },
        });

        newEdges.push({
          id: `e-${nodeId}-${newNodeId}`,
          source: nodeId,
          target: newNodeId,
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 },
        });
      }

      setNodes((nds) => nds.concat(newNodes));
      setEdges((eds) => eds.concat(newEdges));

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
      if (node.data.imageSrc) {
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

      const generatePromises = newNodes.map(async (newNode) => {
        try {
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
              n.id === newNode.id
                ? { ...n, data: { ...n.data, imageSrc: resultImageSrc, isLoading: false } }
                : n
            )
          );

          setEdges((eds) =>
            eds.map((e) =>
              e.id === `e-${nodeId}-${newNode.id}`
                ? { ...e, animated: false, style: { stroke: '#ffffff', opacity: 0.4, strokeWidth: 2 } }
                : e
            )
          );
        } catch (error) {
          console.error(`Generation failed for node ${newNode.id}:`, error);
          setNodes((nds) =>
            nds.map((n) =>
              n.id === newNode.id
                ? { ...n, data: { ...n.data, isLoading: false, prompt: 'Error generating image' } }
                : n
            )
          );
          setEdges((eds) =>
            eds.map((e) =>
              e.id === `e-${nodeId}-${newNode.id}`
                ? { ...e, animated: false, style: { stroke: '#ef4444', strokeWidth: 2, opacity: 0.8 } }
                : e
            )
          );
        }
      });

      await Promise.all(generatePromises);
    },
    [nodes, edges]
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
