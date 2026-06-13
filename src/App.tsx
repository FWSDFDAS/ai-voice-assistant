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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            {/* 摄像头预览区域 */}
            <CameraMicView videoRef={videoRef} />

            {/* 下方区域：语音输入 + AI 对话 */}
            <div className="max-w-2xl mx-auto px-4 pb-12">
                <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20 mt-8 space-y-8">
                    {/* 标题 */}
                    <h2 className="text-2xl font-bold text-center bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                        多模态 AI 助手
                    </h2>

                    {/* 语音输入组件 */}
                    <div>
                        <VoiceInput onTranscript={handleTranscript} />
                        {/* 语音识别结果同步到聊天输入框的提示 */}
                        {chatInput && (
                            <p className="mt-2 text-gray-500 text-xs text-center">
                                已识别文字已填入下方输入框，可直接编辑后发送
                            </p>
                        )}
                    </div>

                    {/* 分隔线 */}
                    <div className="border-t border-white/10" />

                    {/* AI 对话区域 */}
                    <MultimodalChat
                        videoRef={videoRef}
                        inputText={chatInput}
                        onInputChange={setChatInput}
                    />

                    {/* 使用说明 */}
                    <div className="bg-black/20 rounded-xl p-5 border border-white/5">
                        <h4 className="text-gray-400 font-medium mb-3 text-sm flex items-center gap-1.5">
                            📖 使用指南
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] text-gray-500">
                            <div>
                                <span className="text-cyan-400">🎤 语音：</span>按住说话，松开自动识别
                            </div>
                            <div>
                                <span className="text-blue-400">📸 看图：</span>
                                说"你看/这是什么"自动附带画面
                            </div>
                            <div>
                                <span className="text-green-400">⌨️ 文字：</span>
                                直接在输入框打字或编辑识别结果
                            </div>
                            <div>
                                <span className="text-purple-400">🔊 朗读：</span>AI 回复会自动朗读（可点击 🔇 停止）
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
