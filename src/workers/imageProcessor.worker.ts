/**
 * Web Worker：图片处理（锐化 + JPEG 压缩）
 * 在独立线程中运行，不阻塞 UI
 */
const ctx = self as unknown as DedicatedWorkerGlobalScope;

interface WorkerMessage {
    type: 'process';
    imageData: ImageData;
    width: number;
    height: number;
    enhance: boolean;
    quality?: number; // 初始 JPEG 质量
    maxSizeBytes?: number; // 最大字节数
}

ctx.addEventListener('message', (e: MessageEvent<WorkerMessage>) => {
    const { type, imageData, width, height, enhance, quality = 0.92, maxSizeBytes = 1_048_576 } = e.data;

    if (type !== 'process') return;

    try {
        const data = imageData.data;

        // 图像增强：Unsharp Mask 锐化
        if (enhance && width > 2 && height > 2) {
            const copy = new Uint8ClampedArray(data);
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    for (let c = 0; c < 3; c++) {
                        const sum =
                            -copy[idx - width * 4 - 4 + c] +
                            -copy[idx - width * 4 + c] +
                            -copy[idx - width * 4 + 4 + c] +
                            -copy[idx - 4 + c] +
                            5 * copy[idx + c] +
                            -copy[idx + 4 + c] +
                            -copy[idx + width * 4 - 4 + c] +
                            -copy[idx + width * 4 + c] +
                            -copy[idx + width * 4 + 4 + c];
                        data[idx + c] = Math.max(0, Math.min(255, sum));
                    }
                }
            }
        }

        // 用 OffscreenCanvas 做 JPEG 压缩（Worker 中可用）
        const offCanvas = new OffscreenCanvas(width, height);
        const offCtx = offCanvas.getContext('2d');
        if (!offCtx) {
            ctx.postMessage({ error: '无法创建 OffscreenCanvas' });
            return;
        }

        offCtx.putImageData(new ImageData(data, width, height), 0, 0);

        // 二分查找最优质量
        let q = quality;
        let blob: Blob | null = null;
        while (q > 0.1) {
            blob = await offCanvas.convertToBlob({ type: 'image/jpeg', quality: q });
            if (blob.size <= maxSizeBytes) break;
            q -= 0.05;
        }

        // 转为 base64 返回
        const buffer = await blob!.arrayBuffer();
        const base64 = btoa(
            new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), '')
        );
        const dataUrl = `data:image/jpeg;base64,${base64}`;

        ctx.postMessage({
            success: true,
            dataUrl,
            quality: Math.round(q * 100),
            sizeKB: Math.round((blob!.size / 1024) * 10) / 10,
            width,
            height,
        });
    } catch (err) {
        ctx.postMessage({ error: err instanceof Error ? err.message : '处理失败' });
    }
});
