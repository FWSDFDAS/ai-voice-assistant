# AI Voice Assistant

基于 **Vite + React + TypeScript** 的多模态 AI 语音助手。支持摄像头预览、语音识别、图像增强，并通过智谱 GLM-4V-Flash 实现视觉对话。

## 功能特性

| 功能 | 说明 |
|------|------|
| 摄像头实时预览 | 打开/关闭摄像头，16:9 实时画面，流信息诊断 |
| 语音识别 | 按住说话，Web Speech API 转文字（中文） |
| 多模态 AI 对话 | 文字 + 图片发送给 GLM-4V-Flash，返回智能回复 |
| 语音合成朗读 | AI 回复自动通过 SpeechSynthesis 朗读 |
| 图像预处理 | Canvas 滤镜对比度提升 + Unsharp Mask 锐化（可开关） |
| 后台帧缓存 | 每 500ms 预截一帧缓存，发送时零等待 |
| API 响应缓存 | LRU 缓存（20 条 / 5 分钟），相同问题不重复调用 |
| Web Worker | 图片锐化和压缩在独立线程执行，不阻塞 UI |
| 重新拍照 | AI 回复"看不清"时自动显示按钮，截取新画面重发 |
| 成本控制 | 省电模式（纯文本）/ 智能模式（关键词触发附图） |

## 技术栈

- **构建工具**: Vite 6.x
- **前端框架**: React 18 + TypeScript 5
- **样式方案**: Tailwind CSS 3
- **AI 模型**: 智谱 GLM-4V-Flash (OpenAI 兼容接口)
- **语音识别**: Web Speech API (`SpeechRecognition`)
- **语音合成**: Web Speech API (`SpeechSynthesis`)
- **图片处理**: Canvas 2D + Web Worker (OffscreenCanvas)

## 目录结构

```
src/
├── components/
│   ├── CameraMicView.tsx      # 摄像头与麦克风预览组件
│   ├── VoiceInput.tsx          # 语音输入（按住说话）
│   └── MultimodalChat.tsx      # 多模态 AI 对话核心
├── workers/
│   └── imageProcessor.worker.ts # Web Worker：锐化+JPEG压缩
├── api/
│   ├── local-server.js         # 本地开发 API 代理服务器
│   └── gemini.js               # Vercel Edge Function 部署代理
├── App.tsx                     # 根组件（整合布局）
├── main.tsx                    # 应用入口
└── index.css                   # 全局样式
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 API Key

```bash
# 复制模板
cp .env.example .env
```

编辑 `.env` 文件：

```env
GLM_API_KEY=你的智谱API密钥
```

> 获取方式：[开放平台 - 智谱AI](https://open.bigmodel.cn/) → 注册 → 创建 API Key

### 3. 启动本地 API 代理（终端 1）

```bash
node api/local-server.js
```

> 代理地址：`http://localhost:3001`，转发请求到 `open.bigmodel.cn`，保护 API Key 不暴露到前端。

### 4. 启动前端开发服务器（终端 2）

```bash
npm run dev
```

访问 http://localhost:5173/

### 5. 使用流程

1. 点击左侧「打开摄像头」开启摄像头预览
2. 按住左侧下方「按住说话」按钮，松开后自动识别语音
3. 识别文字自动填入右侧 AI 对话输入框，可编辑
4. 点击「发送」或按 Enter 发送给 GLM-4V-Flash
5. AI 回复自动朗读；若回复含"看不清"，可点击「重新拍照」

## 页面布局

```
┌─────────────────────────────────────────────┐
│          多模态 AI 助手                      │
├──────────────┬──────────────────────────────┤
│              │  🎤 语音输入                  │
│ 📹 摄像头     │  [按住说话]                  │
│ 预览          │                              │
│              ├──────────────────────────────┤
│ [打开/关闭]   │  🤖 AI 对话                   │
│              │  模式切换 | 统计 | 清空        │
│              │  对话历史（用户/AI消息气泡）    │
│              │  输入框 + [发送] 按钮           │
└──────────────┴──────────────────────────────┘
```

- 大屏（>=1280px）：左右并排
- 小屏：上下堆叠

## 工作模式

### 省电模式（仅语音）

始终只发送纯文本给 AI，不附带任何图片。**零图片成本**。

### 智能模式（看+听）（默认）

当用户问题包含以下关键词时，自动附带当前摄像头画面：

| 中文关键词 | 英文关键词 |
|-----------|-----------|
| 你看、看看、这是什么 | look at, what is this |
| 我手里、手里拿、拿着 | - |
| 帮我看看、帮我看、看一下 | - |
| 屏幕上、画面里、镜头前 | - |

## 性能优化

### 后台帧缓存

- 组件挂载后每 **500ms** 自动截取一帧存入内存缓存
- 用户发送消息时直接使用最新缓存帧（**0ms 等待**）
- 无需等待摄像头对焦或 requestVideoFrameCallback

### Web Worker 图片处理

主线程只负责轻量的 Canvas drawImage（~1ms），以下操作全部在 **Worker 线程**完成：

| 操作 | 所在线程 |
|------|---------|
| Unsharp Mask 锐化卷积 | Worker |
| JPEG 压缩 (OffscreenCanvas) | Worker |
| Base64 编码 | Worker |

使用 `Transferable` 零拷贝传输 ArrayBuffer，避免内存复制。

### LRU API 缓存

- 缓存 key = `hash(问题文字 + 图片base64前200字符)`
- 容量 20 条，LRU 淘汰最旧
- 有效期 5 分钟
- 缓存命中显示 `⚡ 使用缓存回复（无需调用 API）`

### 图像增强（可开关）

- **对比度**: `contrast(1.2)` + **饱和度**: `saturate(1.15)`
- **锐化**: Unsharp Mask 卷积核 `[0 -1 0 / -1 5 -1 / 0 -1 0]`
- 默认开启，点击控制栏「✨ 图像增强」按钮切换

## 重新拍照功能

当 AI 回复包含以下内容时，自动显示「📸 重新拍照」按钮：

> 看不清、模糊、太暗、分辨率低、无法识别、blurry、can't see...

点击后：
1. 截取摄像头当前新帧
2. 使用原始问题文字重发给 AI
3. 追加 `[重新拍照]` 标记到对话记录

## 部署

### Vercel 部署（推荐）

```bash
git push origin main
# 在 Vercel 导入项目
# 设置环境变量: GLM_API_KEY
# api/gemini.js 会自动作为 Edge Function 运行
```

### 本地生产构建

```bash
npm run build
npm run preview
```

## 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `GLM_API_KEY` | 智谱 GLM-4V-Flash API 密钥 | 是（无 Key 时进入模拟模式） |

## 注意事项

1. **浏览器要求**：推荐 Chrome 或 Edge（Safari 对 Web Speech API 支持有限）
2. **网络要求**：Web Speech API 依赖 Google 云端服务，国内网络可能不可用。后续可接入智谱 Whisper 替代
3. **HTTPS 要求**：摄像头和麦克风需要 HTTPS 或 localhost 才能访问
4. **API 定价参考**：GLM-4V-Flash 按量计费，本项目按 $0.0001/帧 示例估算
5. **隐私安全**：API Key 通过本地代理服务器传递，前端代码中不暴露真实 Key

## 可用命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览生产构建 |
| `npm run check` | TypeScript 类型检查 |
| `node api/local-server.js` | 启动本地 API 代理 |
