import { useState, useRef, useCallback, useEffect } from 'react';

export default function CameraMicView() {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [deviceError, setDeviceError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [streamInfo, setStreamInfo] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // 使用 effect 处理视频流绑定（避免在回调中操作）
    useEffect(() => {
        const videoEl = videoRef.current;
        if (!videoEl || !stream) return;

        // 绑定媒体流
        videoEl.srcObject = stream;

        // 监听元数据加载完成
        const handleLoadedMetadata = () => {
            console.log('视频元数据已加载', {
                videoWidth: videoEl.videoWidth,
                videoHeight: videoEl.videoHeight,
            });

            if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
                console.warn('⚠️ 视频尺寸为 0，可能存在黑屏问题');
            }
        };

        videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);

        return () => {
            videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
    }, [stream]);

    // 打开摄像头与麦克风
    const handleStartCamera = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setDeviceError(false);

        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });

            // 保存到 ref
            streamRef.current = mediaStream;

            // 获取诊断信息
            const videoTracks = mediaStream.getVideoTracks();
            const audioTracks = mediaStream.getAudioTracks();
            const videoTrack = videoTracks[0];
            const settings = videoTrack?.getSettings();

            const info = [
                `📹 视频轨道: ${videoTracks.length} 个`,
                `🎤 音频轨道: ${audioTracks.length} 个`,
                `📐 分辨率: ${settings?.width}x${settings?.height}`,
                `🎬 帧率: ${settings?.frameRate} fps`,
                `🏷️ 设备: ${videoTrack?.label || '未知设备'}`,
            ].join(' | ');

            // 一次性更新所有状态（避免多次重渲染）
            setStream(mediaStream);
            setStreamInfo(info);
            setRetryCount(0);
        } catch (err) {
            const errorMessage =
                err instanceof Error ? err.message : '无法访问摄像头或麦克风';

            if (
                errorMessage.includes('Permission') ||
                errorMessage.includes('NotAllowed')
            ) {
                setError(
                    '🔒 权限被拒绝：请在浏览器设置中允许访问摄像头和麦克风'
                );
            } else if (
                errorMessage.includes('NotFound') ||
                errorMessage.includes('DevicesNotFound')
            ) {
                setError('📷 未找到可用的摄像头或麦克风设备');
            } else if (
                errorMessage.includes('in use') ||
                errorMessage.includes('In use') ||
                errorMessage.includes('busy')
            ) {
                setDeviceError(true);
                setError(
                    '⚠️ 设备正在被使用：请关闭 Zoom/Teams/微信等应用后点击「重新尝试」'
                );
            } else if (
                errorMessage.includes('NotReadable') ||
                errorMessage.includes('ReadableError')
            ) {
                setError('❌ 设备无法读取：可能被锁定或出现故障');
            } else if (errorMessage.includes('Overconstrained')) {
                setError('🎛️ 不满足约束条件：设备不支持请求的分辨率');
            } else if (errorMessage.includes('TypeError')) {
                setError('🌐 浏览器不支持：请使用 Chrome/Firefox/Edge');
            } else {
                setError(`❌ 错误：${errorMessage}`);
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    // 关闭摄像头与麦克风
    const handleStopCamera = useCallback(() => {
        // 先停止所有轨道
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        // 清空视频元素
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        // 最后更新状态（避免重渲染冲突）
        setStream(null);
        setStreamInfo('');
    }, []);

    // 重试处理
    const handleRetry = useCallback(() => {
        setRetryCount((prev) => prev + 1);
        handleStartCamera();
    }, [handleStartCamera]);

    // 查看技术参数
    const handleShowVideoInfo = useCallback(() => {
        if (videoRef.current) {
            const v = videoRef.current;
            alert(
                `视频状态：\n` +
                `• 尺寸: ${v.videoWidth} x ${v.videoHeight}\n` +
                `• 就绪状态: ${v.readyState}\n` +
                `• 是否暂停: ${v.paused}\n\n` +
                `${v.videoWidth === 0 ? '⚠️ 尺寸为 0，视频流未正确加载' : '✓ 视频流正常'}`
            );
        }
    }, []);

    // 组件卸载时清理资源
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <div className="max-w-2xl w-full">
                <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20">
                    {/* 标题 */}
                    <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                        摄像头与麦克风预览
                    </h1>

                    {/* 视频显示区域 - 始终渲染但条件性控制 */}
                    <div className="mb-6">
                        {stream ? (
                            <>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full max-w-[640px] mx-auto block rounded-xl shadow-lg"
                                    style={{
                                        aspectRatio: '16/9',
                                        objectFit: 'cover',
                                        background: '#000',
                                    }}
                                />

                                {/* 诊断信息 */}
                                {streamInfo && (
                                    <div className="mt-3 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                                        <p className="text-blue-300 text-xs font-mono text-center">
                                            {streamInfo}
                                        </p>
                                        <p className="text-gray-400 text-xs text-center mt-1">
                                            摄像头已开启 - 实时预览中
                                            <span className="ml-2 animate-pulse">●</span>
                                        </p>
                                    </div>
                                )}

                                {/* 黑屏排查提示 */}
                                <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                                    <p className="text-yellow-300 text-xs font-semibold mb-1.5">
                                        🔍 如果画面全黑，请检查：
                                    </p>
                                    <ul className="text-gray-300 text-[11px] space-y-0.5 list-disc list-inside">
                                        <li>
                                            笔记本摄像头是否有<strong>物理开关</strong>或<strong>隐私滑块</strong>
                                        </li>
                                        <li>环境光线是否足够（用手电筒照射镜头测试）</li>
                                        <li>打开 Windows 相机应用测试是否能正常成像</li>
                                    </ul>

                                    <button
                                        onClick={handleShowVideoInfo}
                                        className="mt-2 px-3 py-1 bg-yellow-600/30 hover:bg-yellow-600/50 text-yellow-200 rounded text-[11px] transition-colors cursor-pointer"
                                    >
                                        📊 查看视频参数
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="w-full max-w-[640px] mx-auto flex items-center justify-center rounded-xl shadow-lg border-2 border-dashed border-white/20" style={{ aspectRatio: '16/9', background: '#000' }}>
                                <p className="text-gray-500 text-sm">等待开启摄像头...</p>
                            </div>
                        )}
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-xl p-4">
                            <p className="text-red-300 text-center mb-3">{error}</p>

                            {deviceError && (
                                <div className="space-y-3">
                                    <div className="flex justify-center">
                                        <button
                                            onClick={handleRetry}
                                            disabled={isLoading}
                                            className="px-6 py-2 bg-gradient-to-r from-yellow-500 to-orange-600 text-white font-semibold rounded-lg hover:from-yellow-600 hover:to-orange-700 transition-all disabled:opacity-50 text-sm cursor-pointer"
                                        >
                                            {isLoading ? '⏳ 重试中...' : `🔄 重新尝试${retryCount > 0 ? ` (${retryCount}次)` : ''}`}
                                        </button>
                                    </div>

                                    <div className="bg-black/30 rounded-lg p-3 mt-2">
                                        <p className="text-yellow-300 text-xs font-semibold mb-1">🔧 解决步骤：</p>
                                        <ol className="text-gray-300 text-xs space-y-1 list-decimal list-inside">
                                            <li>
                                                按{' '}
                                                <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px]">
                                                    Ctrl+Shift+Esc
                                                </kbd>{' '}
                                                打开任务管理器
                                            </li>
                                            <li>结束占用摄像头的进程（Zoom、Teams、微信）</li>
                                            <li>点击上方「重新尝试」按钮</li>
                                        </ol>
                                        {retryCount > 0 && (
                                            <p className="text-orange-300 text-xs mt-2 animate-pulse">
                                                💡 已重试 {retryCount} 次，如仍失败请重启浏览器
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 控制按钮区域 */}
                    <div className="flex justify-center gap-4">
                        {!stream ? (
                            <button
                                onClick={handleStartCamera}
                                disabled={isLoading}
                                className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-300 disabled:opacity-50 hover:scale-105 active:scale-95 cursor-pointer"
                            >
                                {isLoading ? (
                                    <span>⏳ 正在请求权限...</span>
                                ) : (
                                    <span>📹 打开摄像头与麦克风</span>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handleStopCamera}
                                className="px-8 py-3 bg-gradient-to-r from-red-500 to-pink-600 text-white font-semibold rounded-xl hover:from-red-600 hover:to-pink-700 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
                            >
                                <span>⏹️ 关闭摄像头</span>
                            </button>
                        )}
                    </div>

                    {/* 使用说明 */}
                    <div className="mt-8 bg-black/20 rounded-xl p-5 border border-white/5">
                        <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                            💡 使用说明
                        </h3>
                        <ul className="text-gray-300 text-sm space-y-1">
                            <li>• 点击「打开摄像头与麦克风」请求设备权限</li>
                            <li>• 授权后即可看到实时摄像头画面</li>
                            <li>• 点击「关闭摄像头」停止所有媒体流并释放资源</li>
                        </ul>

                        <div className="mt-4 pt-4 border-t border-white/10">
                            <h4 className="text-gray-400 font-medium mb-2 text-sm">
                                🔧 常见问题解决
                            </h4>
                            <div className="space-y-1.5 text-xs text-gray-500">
                                <p>
                                    <strong>设备被占用？</strong> 关闭 Zoom、Teams、微信等应用
                                </p>
                                <p>
                                    <strong>权限被拒绝？</strong> 点击地址栏左侧图标选择「允许」
                                </p>
                                <p>
                                    <strong>黑屏？</strong> 检查摄像头物理开关是否打开
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
