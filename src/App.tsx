import { useState, useRef, useCallback } from 'react';
import CameraMicView from '@/components/CameraMicView';
import VoiceInput from '@/components/VoiceInput';
import MultimodalChat from '@/components/MultimodalChat';

export default function App() {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [chatInput, setChatInput] = useState('');

    // 语音识别结果 → 自动填入聊天输入框
    const handleTranscript = useCallback((text: string) => {
        setChatInput((prev) => (prev ? prev + text : text));
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 lg:p-6">
            {/* 标题 */}
            <h1 className="text-xl lg:text-2xl font-bold text-center bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent mb-4 lg:mb-6">
                多模态 AI 助手
            </h1>

            {/* 主布局：摄像头 | 控制面板 */}
            <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4 lg:gap-6">
                {/* 左侧：摄像头（固定宽度，不占满整行） */}
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 shadow-xl border border-white/20 h-fit">
                    <CameraMicView videoRef={videoRef} />
                </div>

                {/* 右侧：语音输入 + AI 对话（上下排列） */}
                <div className="flex flex-col gap-4 lg:gap-6 min-h-0">
                    {/* 语音输入（紧凑） */}
                    <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-5 shadow-xl border border-white/20">
                        <h3 className="text-sm font-semibold text-cyan-300 mb-3 flex items-center gap-1.5">
                            🎤 语音输入
                        </h3>
                        <VoiceInput onTranscript={handleTranscript} />
                        {chatInput && (
                            <p className="mt-2 text-gray-500 text-xs text-center">
                                已识别文字已填入下方输入框 →
                            </p>
                        )}
                    </div>

                    {/* AI 对话（占据剩余空间） */}
                    <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-5 shadow-xl border border-white/20 flex-1 min-h-[400px] flex flex-col">
                        <h3 className="text-sm font-semibold text-blue-300 mb-3 flex items-center gap-1.5">
                            🤖 AI 对话
                        </h3>
                        <div className="flex-1 min-h-0">
                            <MultimodalChat
                                videoRef={videoRef}
                                inputText={chatInput}
                                onInputChange={setChatInput}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
