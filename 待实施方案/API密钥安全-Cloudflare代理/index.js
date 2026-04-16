/**
 * Cloudflare Worker — DeepSeek API 代理
 *
 * 功能：
 *   - 接收来自前端的 POST /v1/chat/completions 请求
 *   - 自动注入存储在 Worker Secret 中的 DEEPSEEK_API_KEY
 *   - 支持流式（SSE）和非流式两种响应模式
 *   - 添加 CORS 头，允许 GitHub Pages 等跨域访问
 *
 * 环境变量（需在 Cloudflare 控制台配置为 Secret）：
 *   DEEPSEEK_API_KEY  — DeepSeek API 密钥
 *   ALLOWED_ORIGIN    — 允许的前端域名，如 https://your-name.github.io（可选，留空则允许所有来源）
 */

const DEEPSEEK_BASE = 'https://api.deepseek.com'

export default {
  async fetch(request, env) {
    // ── CORS 预检 ──────────────────────────────────────────────
    const origin = request.headers.get('Origin') || '*'
    const allowedOrigin = env.ALLOWED_ORIGIN || '*'
    const corsOrigin = allowedOrigin === '*' ? '*' : (origin === allowedOrigin ? origin : allowedOrigin)

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // ── 仅接受 POST ────────────────────────────────────────────
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
    }

    // ── 校验 API Key 已配置 ────────────────────────────────────
    if (!env.DEEPSEEK_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured in Worker secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 转发请求到 DeepSeek ────────────────────────────────────
    const url = new URL(request.url)
    const targetUrl = `${DEEPSEEK_BASE}${url.pathname}${url.search}`

    let body
    try {
      body = await request.text()
    } catch {
      return new Response('Bad Request', { status: 400, headers: corsHeaders })
    }

    const upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body,
    })

    // ── 透传响应（含流式 SSE）─────────────────────────────────
    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': upstreamResponse.headers.get('Content-Type') || 'application/json',
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    })
  },
}
