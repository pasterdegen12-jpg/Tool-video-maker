import { Handle, Position } from '@xyflow/react';
import { Settings2 } from 'lucide-react';

const categoryColors = {
  Input: 'bg-gradient-to-r from-blue-900 to-blue-600',
  Generation: 'bg-gradient-to-r from-purple-800 to-purple-600',
  Editing: 'bg-gradient-to-r from-green-800 to-green-600',
  Composition: 'bg-gradient-to-r from-orange-800 to-orange-600',
  Output: 'bg-gradient-to-r from-gray-700 to-gray-500',
};

const portColors = {
  text: '!bg-[#4A9EFF]',
  image: '!bg-[#B855F7]',
  mask: '!bg-[#EC4899]',
  video: '!bg-[#F97316]',
  number: '!bg-[#FACC15]',
};

export default function CustomNode({ data }) {
  return (
    <div className="w-[220px] rounded-xl shadow-lg bg-[#1E1E24] border border-[#2A2A30] overflow-hidden font-sans">
      <div className={`h-[36px] flex items-center justify-between px-3 ${categoryColors[data.category] || categoryColors.Output}`}>
        <div className="flex items-center gap-2">
          <Settings2 size={16} className="text-white opacity-80" />
          <span className="text-white text-[14px] font-semibold">{data.label}</span>
        </div>
        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
      </div>
      <div className="p-3 relative">
        <div className="w-full h-[90px] bg-black/40 rounded-lg flex items-center justify-center mb-2">
          <span className="text-gray-500 text-xs">{data.previewText || "No preview"}</span>
        </div>
        {data.params && <p className="text-[11px] text-gray-400 text-center">{data.params}</p>}
        {data.inputs?.map((input, idx) => (
          <div key={`in-${idx}`} className="absolute left-0 flex items-center" style={{ top: `${50 + idx * 25}px` }}>
            <Handle type="target" position={Position.Left} id={input.name} className={`w-[10px] h-[10px] border-none -ml-[5px] ${portColors[input.type]}`} />
            <span className="ml-3 text-[10px] text-gray-300">{input.name}</span>
          </div>
        ))}
        {data.outputs?.map((output, idx) => (
          <div key={`out-${idx}`} className="absolute right-0 flex items-center justify-end" style={{ top: `${50 + idx * 25}px` }}>
            <span className="mr-3 text-[10px] text-gray-300">{output.name}</span>
            <Handle type="source" position={Position.Right} id={output.name} className={`w-[10px] h-[10px] border-none -mr-[5px] ${portColors[output.type]}`} />
          </div>
        ))}
      </div>
    </div>
  );
}