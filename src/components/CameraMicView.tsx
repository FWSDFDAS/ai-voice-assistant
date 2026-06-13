import { useState, useRef, useCallback, useEffect } from 'react';

interface CameraMicViewProps {
    videoRef?: React.RefObject<HTMLVideoElement | null>;
}

export default function CameraMicView({ videoRef: externalVideoRef }: CameraMicViewProps) {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [deviceError, setDeviceError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [streamInfo, setStreamInfo] = useState<string>('');
    const internalVideoRef = useRef<HTMLVideoElement>(null);
    const videoRef = externalVideoRef || internalVideoRef;
    const streamRef = useRef<MediaStream | null>(null);

    // 使用 effect 处理视频流绑定
    useEffect(() => {
        const videoEl = videoRef.current;
        if (!videoEl || !stream) return;

        videoEl.srcObject = stream;

        const handleLoadedMetadata = () => {
            if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
                console.warn('视频尺寸为 0，可能存在黑屏问题');
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

            streamRef.current = mediaStream;

            const videoTracks = mediaStream.getVideoTracks();
            const audioTracks = mediaStream.getAudioTracks();
            const videoTrack = videoTracks[0];
            const settings = videoTrack?.getSettings();

            const info = [
                `${videoTracks.length}v ${audioTracks.length}a`,
                `${settings?.width}x${settings?.height}`,
                `${settings?.frameRate}fps`,
                videoTrack?.label?.slice(0, 20) || '',
            ].join(' · ');

            setStream(mediaStream);
            setStreamInfo(info);
            setRetryCount(0);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '无法访问摄像头或麦克风';

            if (errorMessage.includes('Permission') || errorMessage.includes('NotAllowed')) {
                setError('🔒 权限被拒绝：请在浏览器设置中允许访问');
            } else if (errorMessage.includes('NotFound') || errorMessage.includes('DevicesNotFound')) {
                setError('📷 未找到可用的摄像头或麦克风设备');
            } else if (errorMessage.includes('in use') || errorMessage.includes('In use') || errorMessage.includes('busy')) {
                setDeviceError(true);
                setError('⚠️ 设备被占用，请关闭其他应用后重试');
            } else if (errorMessage.includes('NotReadable')) {
                setError('❌ 设备无法读取，可能被锁定');
            } else if (errorMessage.includes('TypeError')) {
                setError('🌐 浏览器不支持，请使用 Chrome/Edge');
            } else {
                setError(`❌ ${errorMessage}`);
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    // 关闭摄像头与麦克风
    const handleStopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setStream(null);
        setStreamInfo('');
    }, []);

    // 重试处理
    const handleRetry = useCallback(() => {
        setRetryCount((prev) => prev + 1);
        handleStartCamera();
    }, [handleStartCamera]);

    // 组件卸载时清理资源
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    return (
        <div className="space-y-3">
            {/* 小标题 */}
            <h2 className="text-sm font-semibold text-center bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                📹 摄像头预览
            </h2>

            {/* 视频显示区域 */}
            <div>
                {stream ? (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full block rounded-xl shadow-lg"
                            style={{
                                aspectRatio: '16/9',
                                objectFit: 'cover',
                                background: '#000',
                            }}
                        />
                        {streamInfo && (
                            <p className="text-[10px] text-blue-300/60 font-mono text-center mt-1.5 truncate">
                                {streamInfo}
                            </p>
                        )}
                    </>
                ) : (
                    <div className="w-full flex items-center justify-center rounded-xl border border-dashed border-white/20" style={{ aspectRatio: '16/9', background: '#000' }}>
                        <p className="text-gray-500 text-xs">等待开启...</p>
                    </div>
                )}
            </div>

            {/* 错误提示（紧凑） */}
            {error && (
                <div className="bg-red-500/15 border border-red-500/30 rounded-lg px-3 py-2">
                    <p className="text-red-300 text-xs text-center">{error}</p>
                    {deviceError && (
                        <button
                            onClick={handleRetry}
                            disabled={isLoading}
                            className="mt-1.5 w-full px-3 py-1.5 bg-gradient-to-r from-yellow-500 to-orange-600 text-white font-medium rounded-lg hover:from-yellow-600 hover:to-orange-700 transition-all disabled:opacity-50 text-xs cursor-pointer"
                        >
                            {isLoading ? '⏳ 重试中...' : `🔄 重新尝试${retryCount > 0 ? ` (${retryCount}次)` : ''}`}
                        </button>
                    )}
                </div>
            )}

            {/* 控制按钮 */}
            {!stream ? (
                <button
                    onClick={handleStartCamera}
                    disabled={isLoading}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-200 disabled:opacity-50 text-sm cursor-pointer"
                >
                    {isLoading ? '⏳ 请求权限中...' : '📹 打开摄像头'}
                </button>
            ) : (
                <button
                    onClick={handleStopCamera}
                    className="w-full py-2.5 bg-gradient-to-r from-red-500 to-pink-600 text-white font-medium rounded-xl hover:from-red-600 hover:to-pink-700 transition-all duration-200 text-sm cursor-pointer"
                >
                    ⏹️ 关闭摄像头
                </button>
            )}
        </div>
    );
}
