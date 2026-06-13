import { useState, useRef, useCallback, useEffect } from 'react';
import ImageProcessorWorker from '../workers/imageProcessor.worker?worker&inline';

// 对话消息类型
interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    hasImage?: boolean;
    timestamp: number;
}

// AI 回复中提示"看不清"的关键词
const UNCLEAR_KEYWORDS = [
    '看不清', '看不清楚', '模糊', '太暗', '太黑',
    '不清晰', '分辨率低', '无法识别', '看不了',
    'unclear', 'blurry', 'too dark', 'can\'t see',
];

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
    const [captureStatus, setCaptureStatus] = useState<string | null>(null);
    const [imageEnhance, setImageEnhance] = useState(true);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // 后台帧缓存：每 500ms 预截一帧，发送时直接使用
    const cachedFrameRef = useRef<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // API 响应 LRU 缓存：相同问题+画面不重复调用
    interface CacheEntry {
        reply: string;
        timestamp: number;
    }
    const apiCacheRef = useRef<Map<string, CacheEntry>>(new Map());
    const CACHE_MAX_SIZE = 20; // 最多缓存 20 条
    const CACHE_TTL_MS = 5 * 60_000; // 缓存有效期 5 分钟

    // Web Worker：图片锐化 + 压缩（不阻塞 UI）
    const workerRef = useRef<Worker | null>(null);
    const workerPromiseRef = useRef<Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>>(new Map());
    let workerMsgId = 0;

    // 初始化 Worker
    useEffect(() => {
        const worker = new ImageProcessorWorker();
        workerRef.current = worker;

        worker.addEventListener('message', (e: MessageEvent) => {
            const { id, ...result } = e.data;
            if (id !== undefined && workerPromiseRef.current.has(id)) {
                const { resolve, reject } = workerPromiseRef.current.get(id)!;
                workerPromiseRef.current.delete(id);
                if (result.error) {
                    reject(new Error(result.error));
                } else {
                    resolve(result);
                }
            }
        });

        return () => {
            worker.terminate();
            workerRef.current = null;
            workerPromiseRef.current.clear();
        };
    }, []);

    // 发送任务到 Worker 并返回 Promise
    const processInWorker = useCallback((
        imageData: ImageData,
        width: number,
        height: number,
        enhance: boolean
    ): Promise<{ dataUrl: string; quality: number; sizeKB: number }> => {
        return new Promise((resolve, reject) => {
            if (!workerRef.current) { reject(new Error('Worker 未就绪')); return; }

            const id = ++workerMsgId;
            workerPromiseRef.current.set(id, { resolve, reject });
            workerRef.current.postMessage({
                id,
                type: 'process',
                imageData,
                width,
                height,
                enhance,
                quality: 0.92,
                maxSizeBytes: 1_048_576,
            }, [imageData.data.buffer]); // Transferable 零拷贝传输

            // 超时保护（10s）
            setTimeout(() => {
                if (workerPromiseRef.current.has(id)) {
                    workerPromiseRef.current.delete(id);
                    reject(new Error('Worker 处理超时'));
                }
            }, 10_000);
        });
    }, []);

    // 有效输入：外部传入优先（语音识别），否则用本地状态
    const activeInput = externalInputText ?? localInput;

    // 检测是否需要附带图片
    const shouldAttachImage = useCallback((text: string): boolean => {
        if (mode === 'power') return false;
        return IMAGE_TRIGGER_KEYWORDS.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
    }, [mode]);

    // 轻量级截帧（仅用于后台缓存，不做增强处理，压缩交给 Worker）
    const cacheFrame = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) return;

        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w === 0 || h === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0);

        // 提取像素发给 Worker 压缩，不阻塞主线程
        try {
            const imgData = ctx.getImageData(0, 0, w, h);
            processInWorker(imgData, w, h, false)
                .then((result) => { cachedFrameRef.current = result.dataUrl; })
                .catch(() => {}); // 缓存失败静默忽略
        } catch {
            // Worker 未就绪时回退到主线程压缩
            let quality = 0.85;
            let dataUrl = canvas.toDataURL('image/jpeg', quality);
            while (dataUrl.length > 1_048_576 && quality > 0.15) {
                quality -= 0.05;
                dataUrl = canvas.toDataURL('image/jpeg', quality);
            }
            cachedFrameRef.current = dataUrl;
        }
    }, [videoRef, processInWorker]);

    // 后台定时截帧：摄像头开启时每 500ms 缓存一帧
    useEffect(() => {
        // 启动定时器
        intervalRef.current = setInterval(cacheFrame, 500);
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            cachedFrameRef.current = null;
        };
    }, [cacheFrame]);

    // 截取当前帧（主线程：轻量绘制；Worker：锐化+压缩）
    const captureFrame = useCallback((enhance: boolean): Promise<string | null> => {
        return new Promise((resolve) => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas) { resolve(null); return; }

            const w = video.videoWidth;
            const h = video.videoHeight;

            // 分辨率预检
            if (w < 320 || h < 180) {
                setCaptureStatus(`⚠️ 分辨率偏低 (${w}x${h})，建议改善光线或靠近摄像头`);
            } else if (w >= 1280) {
                setCaptureStatus(`✅ 高清画面 (${w}x${h})`);
            } else {
                setCaptureStatus(null);
            }

            // ===== 缓存优先 =====
            const cached = cachedFrameRef.current;

            if (cached && !enhance) {
                setCaptureStatus(
                    `⚡ 使用缓存帧 · 原始 · ${(cached.length / 1024).toFixed(0)}KB`
                );
                setTimeout(() => setCaptureStatus(null), 2000);
                resolve(cached);
                return;
            }

            // 辅助函数：提取 ImageData 并发给 Worker 处理
            const sendToWorker = (imgData: ImageData, cw: number, ch: number, label: string) => {
                setCaptureStatus(`${label} · 🔧 Worker处理中...`);
                processInWorker(imgData, cw, ch, enhance)
                    .then((result) => {
                        setCaptureStatus(
                            `📷 已截帧 ${cw}x${ch} · ${enhance ? '✨已增强' : '原始'} · 质量${result.quality}% · ${result.sizeKB}KB`
                        );
                        setTimeout(() => setCaptureStatus(null), 3000);
                        resolve(result.dataUrl);
                    })
                    .catch(() => resolve(cached || null));
            };

            if (cached && enhance) {
                // 有缓存 + 需要增强 → 加载缓存图片到 Canvas 提取像素
                setCaptureStatus('✨ 正在对缓存帧做图像增强...');
                const img = new Image();
                img.onload = () => {
                    canvas.width = w || img.width;
                    canvas.height = h || img.height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { resolve(cached); return; }
                    ctx.filter = 'contrast(1.2) saturate(1.15)';
                    ctx.drawImage(img, 0, 0);
                    ctx.filter = 'none';
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    sendToWorker(imgData, canvas.width, canvas.height, '✨ 缓存增强');
                };
                img.onerror = () => resolve(cached);
                img.src = cached;
                return;
            }

            // 无缓存 → 从视频截帧
            if (video.readyState < 2) { resolve(null); return; }

            setCaptureStatus((prev) => prev || (enhance ? '📸 等待对焦...' : '📸 截取画面...'));

            const rvfc = 'requestVideoFrameCallback' in video;
            let captured = false;

            const doCapture = () => {
                if (captured) return;
                captured = true;

                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(null); return; }

                canvas.width = w;
                canvas.height = h;

                // 主线程只做轻量操作：CSS 滤镜 + 绘制（~1ms）
                ctx.filter = enhance ? 'contrast(1.2) saturate(1.15)' : 'none';
                ctx.drawImage(video, 0, 0);

                // 提取原始像素，交给 Worker 做锐化 + 压缩
                const imgData = ctx.getImageData(0, 0, w, h);
                sendToWorker(imgData, w, h, enhance ? '📸 截帧+增强' : '⚡ 截帧完成');
            };

            if (rvfc && !video.paused) {
                try {
                    (video as any).requestVideoFrameCallback(doCapture);
                    setTimeout(() => doCapture(), 800);
                } catch {
                    setTimeout(() => doCapture, 500);
                }
            } else {
                setTimeout(() => doCapture, 500);
            }
        });
    }, [videoRef, processInWorker]);

    // 统一清空输入
    const clearInput = useCallback(() => {
        setLocalInput('');
        onInputChange?.('');
    }, [onInputChange]);

    // 生成缓存 key（文字 + 图片哈希）
    const getCacheKey = useCallback((text: string, image: string | null): string => {
        if (!image) return `text:${text}`;
        // 对图片 base64 取前 200 字符做简单哈希（避免 key 过长）
        const imgHash = image.slice(0, 200);
        let hash = 0;
        for (let i = 0; i < imgHash.length; i++) {
            hash = ((hash << 5) - hash + imgHash.charCodeAt(i)) | 0;
        }
        return `text:${text}|img:${Math.abs(hash).toString(36)}`;
    }, []);

    // 查询缓存
    const getCachedReply = useCallback((cacheKey: string): string | null => {
        const entry = apiCacheRef.current.get(cacheKey);
        if (!entry) return null;
        // 检查是否过期
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            apiCacheRef.current.delete(cacheKey);
            return null;
        }
        return entry.reply;
    }, []);

    // 写入缓存（LRU 淘汰）
    const setCachedReply = useCallback((cacheKey: string, reply: string) => {
        const cache = apiCacheRef.current;
        // 超过上限，删除最旧的一条
        if (cache.size >= CACHE_MAX_SIZE) {
            const oldestKey = cache.keys().next().value;
            if (oldestKey) cache.delete(oldestKey);
        }
        cache.set(cacheKey, { reply, timestamp: Date.now() });
    }, []);

    // 发送消息
    const handleSend = useCallback(async () => {
        const text = activeInput.trim();
        if (!text || isLoading) return;

        const attachImage = shouldAttachImage(text);
        setCaptureStatus(attachImage ? '📸 正在截取画面...' : null);

        // 截帧（现在是异步的，会等待对焦）
        const imageData = attachImage ? await captureFrame(imageEnhance) : null;

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
            // ===== 检查 LRU 缓存 =====
            const cacheKey = getCacheKey(text, imageData);
            const cachedReply = getCachedReply(cacheKey);

            if (cachedReply) {
                // 缓存命中，直接使用，跳过 API 调用
                setCaptureStatus('⚡ 使用缓存回复（无需调用 API）');
                setTimeout(() => setCaptureStatus(null), 2000);

                if (imageData) {
                    setFrameCount((prev) => prev + 1);
                    // 缓存命中不计费（图片已在之前发送过）
                }

                setMessages((prev) => [...prev, { role: 'assistant', content: cachedReply, timestamp: Date.now() }]);
                speakAIResponse(cachedReply);
                return;
            }

            // 缓存未命中，调用 API
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
            // 写入缓存
            setCachedReply(cacheKey, reply);
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

    // 重新拍照：找到上次带图的用户消息，截新帧重发
    const handleRetake = useCallback(async (assistantIdx: number) => {
        if (isLoading) return;

        // 找到这条 AI 回复对应的用户消息（往前找最近一条 hasImage 的 user 消息）
        let userText = '';
        let userMsgIdx = -1;
        for (let i = assistantIdx - 1; i >= 0; i--) {
            if (messages[i].role === 'user' && messages[i].hasImage) {
                userText = messages[i].content;
                userMsgIdx = i;
                break;
            }
        }
        if (!userText || userMsgIdx < 0) return;

        // 标记正在重新拍照
        setCaptureStatus('📸 正在重新截取画面...');
        setIsLoading(true);
        setError(null);

        try {
            const newImage = await captureFrame(imageEnhance);
            if (!newImage) {
                setError('截帧失败，请确保摄像头已开启');
                return;
            }

            // 追加"已重新拍摄"的用户消息
            setMessages((prev) => [
                ...prev,
                { role: 'user' as const, content: `[重新拍照] ${userText}`, hasImage: true, timestamp: Date.now() },
            ]);

            // 调用 API
            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: userText, image: newImage }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: '请求失败' }));
                throw new Error(errData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            setFrameCount((prev) => prev + 1);
            setEstimatedCost((prev) => prev + 0.0001);

            const reply = data.reply || data.text || '(无回复)';
            setMessages((prev) => [...prev, { role: 'assistant' as const, content: reply, timestamp: Date.now() }]);
            speakAIResponse(reply);
        } catch (err) {
            const msg = err instanceof Error ? err.message : '重新拍照失败';
            setError(msg);
            setMessages((prev) => [...prev, { role: 'assistant' as const, content: `❌ ${msg}`, timestamp: Date.now() }]);
        } finally {
            setIsLoading(false);
        }
    }, [messages, isLoading, captureFrame, imageEnhance, speakAIResponse]);

    // 判断 AI 回复是否表示看不清图片
    const isUnclearResponse = useCallback((text: string): boolean => {
        return UNCLEAR_KEYWORDS.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
    }, []);

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
            <div className="flex items-center justify-between gap-3 flex-wrap">
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

                {/* 图像增强开关 */}
                <button
                    onClick={() => setImageEnhance((v) => !v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                        imageEnhance
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                            : 'bg-white/5 text-gray-500 border-white/10 hover:text-gray-300'
                    }`}
                    title="开启后截帧会进行锐化和对比度增强，提升 AI 识别率"
                >
                    {imageEnhance ? '✨ 图像增强' : '🖼️ 原始画面'}
                </button>

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

            {/* 截帧状态提示 */}
            {captureStatus && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-1.5 text-center">
                    <p className="text-cyan-300 text-xs">{captureStatus}</p>
                </div>
            )}

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

                                {/* AI 回复表示看不清时，显示重新拍照按钮 */}
                                {msg.role === 'assistant' && isUnclearResponse(msg.content) && (
                                    <button
                                        onClick={() => handleRetake(idx)}
                                        disabled={isLoading}
                                        className="mt-2 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-500/40 rounded-lg text-cyan-300 text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
                                    >
                                        📸 重新拍照（截取新画面重发）
                                    </button>
                                )}

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
