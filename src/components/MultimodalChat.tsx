import { useState, useRef, useCallback } from 'react';

// 对话消息类型
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    hasImage?: boolean;
    timestamp: number;
}

// 触发图片发送的关键词列表
const IMAGE_TRIGGER_KEYWORDS = [
    '你看', '看看', '这是什么',
    '我手里', '手里拿', '拿着',
    '帮我看看', '帮我看', '看一下',
    '这个是', '这是啥', '这是谁',
    '屏幕上', '画面里', '镜头前',
    'look at', 'what is this', 'do you see',
];

interface MultimodalChatProps {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    inputText?: string;
    onInputChange?: (text: string) => void;
}

export default function MultimodalChat({ videoRef, inputText: externalInputText, onInputChange }: MultimodalChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [localInput, setLocalInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<'smart' | 'power'>('smart');
    const [frameCount, setFrameCount] = useState(0);
    const [estimatedCost, setEstimatedCost] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // 有效输入：外部传入优先（语音识别），否则用本地状态
    const activeInput = externalInputText ?? localInput;

    // 检测是否需要附带图片
    const shouldAttachImage = useCallback((text: string): boolean => {
        if (mode === 'power') return false;
        return IMAGE_TRIGGER_KEYWORDS.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
    }, [mode]);

    // 从视频流截取当前帧
    const captureFrame = useCallback((): string | null => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return null;

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        let quality = 0.8;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 1_048_576 && quality > 0.1) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        return dataUrl;
    }, [videoRef]);

    // 统一清空输入
    const clearInput = useCallback(() => {
        setLocalInput('');
        onInputChange?.('');
    }, [onInputChange]);

    // 发送消息
    const handleSend = useCallback(async () => {
        const text = activeInput.trim();
        if (!text || isLoading) return;

        const attachImage = shouldAttachImage(text);
        const imageData = attachImage ? captureFrame() : null;

        setMessages((prev) => [...prev, {
            role: 'user',
            content: text,
            hasImage: !!imageData,
            timestamp: Date.now(),
        }]);
        clearInput();
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, image: imageData || undefined }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: '请求失败' }));
                throw new Error(errData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();

            if (imageData) {
                setFrameCount((prev) => prev + 1);
                setEstimatedCost((prev) => prev + 0.0001);
            }

            const reply = data.reply || data.text || '(无回复)';
            setMessages((prev) => [...prev, { role: 'assistant', content: reply, timestamp: Date.now() }]);
            speakAIResponse(reply);
        } catch (err) {
            const msg = err instanceof Error ? err.message : '发送失败';
            setError(msg);
            setMessages((prev) => [...prev, { role: 'assistant', content: `❌ ${msg}`, timestamp: Date.now() }]);
        } finally {
            setIsLoading(false);
        }
    }, [activeInput, isLoading, shouldAttachImage, captureFrame, clearInput]);

    // 语音合成朗读 AI 回复
    const speakAIResponse = useCallback((text: string) => {
        if (!text || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    }, []);

    // 停止语音朗读
    const stopSpeaking = useCallback(() => {
        window.speechSynthesis?.cancel();
    }, []);

    // 清空对话
    const handleClear = useCallback(() => {
        setMessages([]);
        setFrameCount(0);
        setEstimatedCost(0);
        setError(null);
        stopSpeaking();
    }, [stopSpeaking]);

    // 键盘发送
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend]
    );

    // 输入变化处理（同时更新外部和本地）
    const handleInputChange = useCallback((value: string) => {
        setLocalInput(value);
        onInputChange?.(value);
    }, [onInputChange]);

    return (
        <div className="space-y-4">
            <canvas ref={canvasRef} className="hidden" />

            {/* 顶部控制栏 */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 bg-black/20 rounded-lg p-1">
                    <button
                        onClick={() => setMode('power')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                            mode === 'power'
                                ? 'bg-yellow-500/30 text-yellow-300 shadow-sm'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        🔋 省电模式
                    </button>
                    <button
                        onClick={() => setMode('smart')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                            mode === 'smart'
                                ? 'bg-blue-500/30 text-blue-300 shadow-sm'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        🧠 智能模式
                    </button>
                </div>

                <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-gray-400">📸 {frameCount} 帧</span>
                    <span className="text-green-400/80">💰 ${estimatedCost.toFixed(4)}</span>
                </div>

                {messages.length > 0 && (
                    <button
                        onClick={handleClear}
                        className="px-3 py-1.5 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 rounded-lg text-gray-400 hover:text-red-300 text-xs transition-colors cursor-pointer"
                    >
                        🗑️ 清空
                    </button>
                )}
            </div>

            {/* 对话历史 */}
            <div className="min-h-[280px] max-h-[420px] overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[200px] text-gray-500">
                        <p className="text-3xl mb-2">🤖</p>
                        <p className="text-sm">开始与 AI 对话吧</p>
                        <p className="text-xs mt-1 text-gray-600">
                            {mode === 'smart'
                                ? '智能模式下，说"你看/这是什么"会自动附带摄像头画面'
                                : '省电模式仅发送文字'}
                        </p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={`${msg.timestamp}-${idx}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-gradient-to-br from-blue-600/80 to-purple-600/60 text-white rounded-br-md'
                                    : 'bg-white/10 text-gray-200 border border-white/10 rounded-bl-md'
                            }`}>
                                {msg.role === 'user' && msg.hasImage && (
                                    <span className="inline-block mb-1 px-2 py-0.5 bg-white/15 rounded text-[10px] text-cyan-300">📷 已附带画面</span>
                                )}
                                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-blue-200/50' : 'text-gray-500'} text-right`}>
                                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    ))
                )}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3">
                            <div className="flex items-center gap-2 text-gray-400 text-sm">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
                                </span>
                                AI 思考中...
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 错误提示 */}
            {error && (
                <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-2.5">
                    <p className="text-red-400 text-xs">{error}</p>
                </div>
            )}

            {/* 输入区域 */}
            <div className="space-y-2">
                <textarea
                    value={activeInput}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={mode === 'smart' ? '输入问题...（含"你看""这是什么"等关键词会附带摄像头画面）' : '输入问题...'}
                    rows={3}
                    disabled={isLoading}
                    className="w-full bg-white/5 border border-white/20 rounded-xl p-4 text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30 transition-colors text-sm disabled:opacity-50"
                />

                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[11px] text-gray-500">
                        {activeInput && shouldAttachImage(activeInput) && (
                            <span className="text-cyan-400 animate-pulse">📸 将附带画面</span>
                        )}
                        {!activeInput && <span>Enter 发送 / Shift+Enter 换行</span>}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={stopSpeaking}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-gray-400 hover:text-white text-xs transition-colors cursor-pointer"
                            title="停止语音朗读"
                        >
                            🔇
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={!activeInput.trim() || isLoading}
                            className={`px-6 py-2 rounded-xl font-medium text-sm transition-all cursor-pointer ${
                                activeInput.trim() && !isLoading
                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/25'
                                    : 'bg-white/5 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            {isLoading ? '⏳ 发送中...' : '➤ 发送'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
