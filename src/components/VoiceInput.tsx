import { useState, useRef, useCallback, useEffect } from 'react';

// Web Speech API 类型声明
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
}

declare global {
    interface Window {
        SpeechRecognition: new () => SpeechRecognition;
        webkitSpeechRecognition: new () => SpeechRecognition;
    }
}

interface VoiceInputProps {
    onTranscript?: (text: string) => void;
    lang?: string;
}

export default function VoiceInput({ onTranscript, lang = 'zh-CN' }: VoiceInputProps) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimText, setInterimText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSupported, setIsSupported] = useState(true);

    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 初始化 SpeechRecognition
    useEffect(() => {
        const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognitionClass) {
            setIsSupported(false);
            setError('您的浏览器不支持语音识别，请使用 Chrome 或 Edge');
            return;
        }

        const recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = true; // 返回中间结果（实时显示）
        recognition.lang = lang;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            if (finalTranscript) {
                setTranscript((prev) => prev + finalTranscript);
                onTranscript?.(finalTranscript);
            }
            setInterimText(interimTranscript);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('语音识别错误:', event.error, event.message);

            switch (event.error) {
                case 'not-allowed':
                    setError('麦克风权限被拒绝，请在浏览器设置中允许访问');
                    break;
                case 'no-speech':
                    // 未检测到语音，不显示错误
                    break;
                case 'network':
                    setError('网络错误，请检查网络连接');
                    break;
                case 'aborted':
                    // 用户主动中止，不显示错误
                    break;
                default:
                    setError(`识别错误：${event.error}`);
            }

            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
            setInterimText('');
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.abort();
        };
    }, [lang, onTranscript]);

    // 开始识别
    const startRecognition = useCallback(() => {
        if (!recognitionRef.current || isListening) return;

        setError(null);
        try {
            recognitionRef.current.start();
            setIsListening(true);
        } catch (err) {
            console.error('启动语音识别失败:', err);
            setError('启动失败，请重试');
        }
    }, [isListening]);

    // 停止识别
    const stopRecognition = useCallback(() => {
        if (!recognitionRef.current || !isListening) return;

        try {
            recognitionRef.current.stop();
        } catch (err) {
            console.error('停止语音识别失败:', err);
        }
        setIsListening(false);
        setInterimText('');
    }, [isListening]);

    // 按下按钮
    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            e.preventDefault();
            // 防止长按触发浏览器默认行为
            pressTimerRef.current = setTimeout(() => {
                startRecognition();
            }, 100); // 短暂延迟，区分点击和长按
        },
        [startRecognition]
    );

    // 松开按钮
    const handlePointerUp = useCallback(
        (e: React.PointerEvent) => {
            e.preventDefault();

            if (pressTimerRef.current) {
                clearTimeout(pressTimerRef.current);
                pressTimerRef.current = null;
            }

            if (isListening) {
                stopRecognition();
            }
        },
        [isListening, stopRecognition]
    );

    // 清空文本
    const handleClear = useCallback(() => {
        setTranscript('');
        setInterimText('');
        setError(null);
    }, []);

    return (
        <div className="space-y-4">
            {/* 不支持提示 */}
            {!isSupported && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4">
                    <p className="text-red-300 text-sm text-center">{error}</p>
                </div>
            )}

            {/* 按住说话按钮 */}
            <div className="flex justify-center">
                <button
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    onTouchStart={(e) => {
                        e.preventDefault();
                        startRecognition();
                    }}
                    onTouchEnd={(e) => {
                        e.preventDefault();
                        stopRecognition();
                    }}
                    disabled={!isSupported}
                    className={`
                        relative px-10 py-4 rounded-2xl font-semibold text-lg
                        transition-all duration-200 select-none touch-none
                        ${isListening
                            ? 'bg-gradient-to-r from-red-500 to-pink-600 scale-95 shadow-lg shadow-red-500/30'
                            : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg hover:scale-105 active:scale-95'
                        }
                        text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2
                    `}
                >
                    {/* 听录中指示器 - 始终渲染，通过 CSS 控制显示 */}
                    <span className={`relative flex h-3 w-3 ${!isListening && 'invisible'}`}>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                    </span>
                    {isListening ? '正在听... 松开结束' : '🎤 按住说话'}
                </button>
            </div>

            {/* 错误提示 */}
            {error && isSupported && (
                <p className="text-red-400 text-xs text-center">{error}</p>
            )}

            {/* 文本显示区域 */}
            {(transcript || interimText) && (
                <div className="space-y-2">
                    <textarea
                        value={transcript + interimText}
                        onChange={(e) => setTranscript(e.target.value)}
                        placeholder="识别结果将显示在这里..."
                        rows={4}
                        className="w-full bg-white/5 border border-white/20 rounded-xl p-4 text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/30 transition-colors text-sm"
                    />
                    <div className="flex justify-between items-center">
                        <p className="text-gray-500 text-xs">
                            {interimText ? '🔵 实时识别中...' : `✅ 已识别 ${transcript.length} 字`}
                        </p>
                        <button
                            onClick={handleClear}
                            className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-gray-400 hover:text-white text-xs transition-colors cursor-pointer"
                        >
                            🗑️ 清空
                        </button>
                    </div>
                </div>
            )}

            {/* 使用提示 */}
            <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                <h4 className="text-gray-400 font-medium mb-2 text-sm flex items-center gap-1.5">
                    💬 使用说明
                </h4>
                <ul className="text-gray-500 text-xs space-y-1">
                    <li>• 点击并按住「按住说话」按钮开始录音</li>
                    <li>• 松开按钮自动结束识别</li>
                    <li>• 支持中文和英文语音识别</li>
                    <li>• 推荐使用 Chrome 或 Edge 浏览器以获得最佳效果</li>
                </ul>
            </div>
        </div>
    );
}
