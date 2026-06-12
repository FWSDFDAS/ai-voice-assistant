import { useState } from 'react';
import CameraMicView from '@/components/CameraMicView';
import VoiceInput from '@/components/VoiceInput';

export default function App() {
  const [transcriptHistory, setTranscriptHistory] = useState<string[]>([]);

  const handleTranscript = (text: string) => {
    setTranscriptHistory((prev) => [...prev, text]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* 摄像头预览区域 */}
      <CameraMicView />

      {/* 语音识别区域 */}
      <div className="max-w-2xl mx-auto px-4 pb-12">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20 mt-8">
          {/* 标题 */}
          <h2 className="text-2xl font-bold text-center mb-6 bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
            语音输入
          </h2>

          {/* 语音输入组件 */}
          <VoiceInput onTranscript={handleTranscript} />

          {/* 识别历史记录 */}
          {transcriptHistory.length > 0 && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <h3 className="text-gray-300 font-semibold mb-3 text-sm flex items-center gap-2">
                📝 识别历史 ({transcriptHistory.length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {transcriptHistory.map((text, index) => (
                  <div
                    key={index}
                    className="bg-black/20 rounded-lg p-3 text-gray-300 text-sm border-l-2 border-cyan-500/50"
                  >
                    <span className="text-cyan-400/60 text-xs mr-2">#{index + 1}</span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
