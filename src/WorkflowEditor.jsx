import React, { useState, useCallback } from 'react';
import { ReactFlow, Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';
import { Play } from 'lucide-react';

const nodeTypes = { custom: CustomNode };

const initialNodes = [
  { id: 'A', type: 'custom', position: { x: 80, y: 200 }, data: { label: 'Text Prompt', category: 'Input', previewText: 'a majestic cat astronaut...', outputs: [{ name: 'text', type: 'text' }] } },
  { id: 'B', type: 'custom', position: { x: 380, y: 120 }, data: { label: 'Load Image', category: 'Input', previewText: 'reference.png', outputs: [{ name: 'image', type: 'image' }] } },
  { id: 'C', type: 'custom', position: { x: 700, y: 180 }, data: { label: 'Flux Image Generator', category: 'Generation', params: 'steps: 30 cfg: 7.5 seed: 42', inputs: [{ name: 'prompt', type: 'text' }, { name: 'reference', type: 'image' }], outputs: [{ name: 'image', type: 'image' }] } },
  { id: 'D', type: 'custom', position: { x: 1020, y: 180 }, data: { label: 'Upscaler 4x', category: 'Editing', params: 'model: Real-ESRGAN', inputs: [{ name: 'image', type: 'image' }], outputs: [{ name: 'image', type: 'image' }] } },
  { id: 'E', type: 'custom', position: { x: 1320, y: 180 }, data: { label: 'Preview Output', category: 'Output', previewText: 'Final result', inputs: [{ name: 'image', type: 'image' }] } },
];

const initialEdges = [
  { id: 'eA-C', source: 'A', sourceHandle: 'text', target: 'C', targetHandle: 'prompt', style: { stroke: '#4A9EFF', strokeWidth: 2.5 } },
  { id: 'eB-C', source: 'B', sourceHandle: 'image', target: 'C', targetHandle: 'reference', style: { stroke: '#B855F7', strokeWidth: 2.5 } },
  { id: 'eC-D', source: 'C', sourceHandle: 'image', target: 'D', targetHandle: 'image', style: { stroke: '#B855F7', strokeWidth: 2.5 } },
  { id: 'eD-E', source: 'D', sourceHandle: 'image', target: 'E', targetHandle: 'image', style: { stroke: '#B855F7', strokeWidth: 2.5 } },
];

export default function WorkflowEditor() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [isRunning, setIsRunning] = useState(false);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  return (
    <div className="h-full w-full flex flex-col bg-[#0E0E10] text-white overflow-hidden">
      {/* TOOLBAR */}
      <div className="h-[56px] bg-[#1A1A1F] border-b border-[#2A2A30] flex items-center justify-between px-6 shrink-0">
        <h1 className="text-lg font-semibold cursor-pointer">Untitled Workflow</h1>
        <button 
          className="flex items-center gap-2 bg-[#9333EA] hover:bg-purple-500 px-4 py-1.5 rounded-md font-semibold transition-all shadow-[0_0_15px_rgba(147,51,234,0.5)] cursor-pointer"
          onClick={() => setIsRunning(!isRunning)}
        >
          <Play size={16} /> Run Workflow
        </button>
      </div>

      {/* 3 COLUMNS */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-[260px] bg-[#15151A] border-r border-[#2A2A30] p-4 shrink-0">
          <h2 className="text-[16px] font-semibold mb-4">Nodes</h2>
          <input type="text" placeholder="Search nodes..." className="w-full bg-[#1E1E24] border border-[#2A2A30] rounded p-2 text-sm mb-4 outline-none focus:border-purple-500" />
        </div>

        <div className="flex-1 relative h-full">
          <ReactFlow 
            nodes={nodes} 
            edges={edges.map(e => ({ ...e, animated: isRunning }))}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            defaultEdgeOptions={{ type: 'default' }}
          >
            <Background color="#2A2A30" gap={20} variant="dots" />
            <Controls className="!bg-[#15151A] !border-[#2A2A30] !fill-white" />
            <MiniMap className="!bg-[#15151A]/80" maskColor="rgba(0, 0, 0, 0.5)" />
          </ReactFlow>
        </div>

        <div className="w-[320px] bg-[#15151A] border-l border-[#2A2A30] p-4 shrink-0 flex flex-col">
          <h2 className="text-[16px] font-semibold mb-4 border-b border-[#2A2A30] pb-2">Properties</h2>
          <p className="text-sm text-gray-400">Select a node to view its parameters.</p>
        </div>
      </div>
    </div>
  );
}