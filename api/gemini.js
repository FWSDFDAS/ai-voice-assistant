// Vercel Edge Function / Netlify Function 兼容的 GLM-4V-Flash 代理
// 文件路径: api/gemini.js（路径保持不变，前端无需改动）
// 部署后访问路径: /api/gemini

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = 'glm-4v-flash';

export default async function handler(req) {
    // 只允许 POST 请求
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 读取请求体
    let body;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { text, image } = body;

    if (!text || typeof text !== 'string') {
        return new Response(JSON.stringify({ error: 'Missing "text" field' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 从环境变量获取 API Key
    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) {
        console.error('GLM_API_KEY not configured');
        return new Response(
            JSON.stringify({ error: 'API Key 未配置，请设置 GLM_API_KEY 环境变量' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // 构建消息
    const messages = [
        {
            role: 'system',
            content:
                '你是一个智能助手。如果用户发送了图片，请根据图片内容回答用户的问题。回答要简洁、准确、有帮助。使用中文回复。',
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

    try {
        const glmResponse = await fetch(GLM_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: MODEL,
                messages,
                temperature: 0.7,
                max_tokens: 1024,
            }),
        });

        if (!glmResponse.ok) {
            const errBody = await glmResponse.text();
            console.error('GLM API error:', glmResponse.status, errBody);
            return new Response(
                JSON.stringify({
                    error: `GLM API 错误 (${glmResponse.status}): ${errBody.slice(0, 300)}`,
                }),
                { status: 502, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const glmData = await glmResponse.json();
        const reply =
            glmData?.choices?.[0]?.message?.content ||
            '抱歉，无法生成回复。';

        return new Response(JSON.stringify({ reply }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('Proxy error:', err);
        return new Response(
            JSON.stringify({ error: `代理服务器错误: ${err.message}` }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// 导出配置（Vercel Edge Function 格式）
export const config = {
    runtime: 'edge',
};
