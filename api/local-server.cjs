// 本地开发 API 代理服务器 - GLM-4V-Flash（智谱视觉模型）
// 运行方式: node api/local-server.cjs
// 监听端口: 3001（与 vite.config.ts 中的 proxy target 对应）

const http = require('http');
const url = require('url');

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = 'glm-4v-flash';

// 从环境变量或 .env 文件读取 API Key
let GLM_API_KEY = process.env.GLM_API_KEY;
try {
    require('dotenv').config();
    GLM_API_KEY = process.env.GLM_API_KEY || GLM_API_KEY;
} catch {
    // dotenv 未安装，仅使用系统环境变量
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    if (req.method !== 'POST' || parsedUrl.pathname !== '/api/gemini') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
        return;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
        try {
            const { text, image } = JSON.parse(body);

            if (!text || typeof text !== 'string') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing "text" field' }));
                return;
            }

            if (!GLM_API_KEY) {
                console.error('[API] GLM_API_KEY 未配置');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    reply: `[模拟模式] 你说的是："${text}"${image ? '（附带了一张图片）' : ''}\n\n请配置 GLM_API_KEY 环境变量以启用真实 AI 回复。\n申请地址: https://open.bigmodel.cn/`,
                    mock: true,
                }));
                return;
            }

            const messages = [
                {
                    role: 'system',
                    content: '你是一个智能助手。如果用户发送了图片，请根据图片内容回答用户的问题。回答要简洁、准确、有帮助。使用中文回复。',
                },
            ];

            if (image && image.startsWith('data:image')) {
                messages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text },
                        {
                            type: 'image_url',
                            image_url: {
                                url: image,
                                detail: 'auto',
                            },
                        },
                    ],
                });
            } else {
                messages.push({ role: 'user', content: text });
            }

            const glmRes = await fetch(GLM_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GLM_API_KEY}`,
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages,
                    temperature: 0.7,
                    max_tokens: 1024,
                }),
            });

            if (!glmRes.ok) {
                const errText = await glmRes.text();
                console.error('[GLM API Error]', glmRes.status, errText);
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: `GLM API 错误 (${glmRes.status}): ${errText.slice(0, 300)}`,
                }));
                return;
            }

            const glmData = await glmRes.json();
            const reply = glmData?.choices?.[0]?.message?.content || '(无回复)';

            console.log(`[GLM API] 请求成功 | 图片: ${!!image} | 模型: ${MODEL}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ reply }));
        } catch (err) {
            console.error('[Server Error]', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `服务器错误: ${err.message}` }));
        }
    });
});

const PORT = process.env.API_PORT || 3001;
server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   本地 GLM-4V-Flash API 代理已启动       ║
║   地址: http://localhost:${PORT}          ║
║   路径: /api/gemini                     ║
║   模型: ${MODEL.padEnd(18)}             ║
║   Key: ${GLM_API_KEY ? '✅ 已配置' : '❌ 未配置（模拟模式）'}           ║
╚════════════════════════════════════════╝
`);
});
