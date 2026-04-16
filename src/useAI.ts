import { useCallback, useRef } from 'react'
import type { ChatMessage } from './types'

// DeepSeek API 配置
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEEPSEEK_API_KEY = 'sk-209a9d7b033b45b685c3ce767521a802'

// AI 在聊天室中的标识
export const AI_ID = '__ai_deepseek__'
export const AI_NAME = 'AI 助手'
export const AI_COLOR = '#6366f1'

// 请求超时时间（毫秒）
const REQUEST_TIMEOUT_MS = 30_000

// ─── @ 触发检测 ──────────────────────────────────────────────────────────────
// 支持：@AI、@ai、@AI 助手 等所有变体
export function hasAtAI(text: string): boolean {
  return /@AI(\s|$|助手)/i.test(text)
}

// 从消息文本中提取 @AI 后的实际提问内容
export function extractAIPrompt(text: string): string | null {
  const match = text.match(/@AI(?:\s*助手)?\s*([\s\S]*)/i)
  if (!match) return null
  const prompt = match[1].trim()
  return prompt || null
}

// ─── 友好错误信息映射 ────────────────────────────────────────────────────────
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('429'))       return '请求太频繁，请稍后再试'
  if (msg.includes('401'))       return 'API 密钥无效，请联系管理员'
  if (msg.includes('402'))       return 'API 余额不足，请联系管理员'
  if (msg.includes('503'))       return 'AI 服务暂时不可用，请稍后重试'
  if (msg.includes('timeout'))   return '请求超时，请检查网络后重试'
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
                                  return '网络连接失败，请检查网络'
  if (msg.includes('响应体为空')) return '服务器返回空响应，请重试'
  return '出了点小问题，请稍后再试'
}

// ─── 上下文构建（带 token 预估保护）────────────────────────────────────────
type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// 粗略估算 token 数（中文约 1 字 = 1.5 token，英文约 4 字 = 1 token）
function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length
  const rest = text.length - cjk
  return Math.ceil(cjk * 1.5 + rest * 0.25)
}

function buildMessages(
  contextMsgs: ChatMessage[],
  userPrompt: string,
  userName: string
): DeepSeekMessage[] {
  const systemPrompt = `你是一个聊天室里的 AI 助手，昵称为"AI 助手"。
用户通过 @AI 召唤你。回复应简洁、友好、口语化，适合聊天室场景。
不要在回复中重复提及"@AI"或"AI 助手"，直接回答即可。`

  const cleanPrompt = extractAIPrompt(userPrompt) || userPrompt

  // 构建历史消息，从最新往前取，直到 token 预算用完
  const TOKEN_BUDGET = 2000  // 为回复预留 1024 token，上下文最多用 2000
  let usedTokens = estimateTokens(systemPrompt) + estimateTokens(cleanPrompt)

  const recentMsgs = contextMsgs
    .filter(m => m.type !== 'sys' && !m.recalled)
    .slice(-30)  // 最多取 30 条候选

  const historyItems: DeepSeekMessage[] = []

  // 从最新往前遍历，直到 token 预算用完
  for (let i = recentMsgs.length - 1; i >= 0; i--) {
    const m = recentMsgs[i]
    let content = ''
    const prefix = m.senderId === AI_ID ? '' : `[${m.senderName}]: `

    if (m.type === 'text' && m.text) {
      content = `${prefix}${m.text}`
    } else if (m.type === 'image') {
      content = `${prefix}[发送了一张图片]`
    } else if (m.type === 'file') {
      content = `${prefix}[发送了文件: ${m.fileName || '未知文件'}]`
    } else if (m.type === 'voice') {
      content = `${prefix}[发送了语音消息]`
    } else {
      continue
    }

    const t = estimateTokens(content)
    if (usedTokens + t > TOKEN_BUDGET) break
    usedTokens += t

    const role = m.senderId === AI_ID ? 'assistant' : 'user'
    historyItems.unshift({ role, content })
  }

  return [
    { role: 'system', content: systemPrompt },
    ...historyItems,
    { role: 'user', content: `[${userName}]: ${cleanPrompt}` },
  ]
}

// ─── SSE 流式解析器 ──────────────────────────────────────────────────────────
class SSEParser {
  private buffer = ''

  feed(chunk: string): string[] {
    this.buffer += chunk
    const deltas: string[] = []
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') {
        deltas.push('\x00DONE\x00')
        continue
      }
      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) deltas.push(delta)
      } catch {
        // 忽略心跳包等非 JSON 行
      }
    }
    return deltas
  }

  reset() { this.buffer = '' }
}

// ─── useAI Hook ──────────────────────────────────────────────────────────────
export interface UseAIReturn {
  askAI: (
    userText: string,
    userName: string,
    contextMsgs: ChatMessage[],
    onChunk: (delta: string) => void,
    onDone: (fullText: string) => void,
    onError: (err: string) => void
  ) => void
  abortAI: () => void
  isThinking: React.MutableRefObject<boolean>
}

export function useAI(): UseAIReturn {
  const abortControllerRef = useRef<AbortController | null>(null)
  const isThinking = useRef(false)
  const sseParser = useRef(new SSEParser())
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimeout_ = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const askAI = useCallback((
    userText: string,
    userName: string,
    contextMsgs: ChatMessage[],
    onChunk: (delta: string) => void,
    onDone: (fullText: string) => void,
    onError: (err: string) => void
  ) => {
    // 中止上一次请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    clearTimeout_()
    sseParser.current.reset()

    const controller = new AbortController()
    abortControllerRef.current = controller
    isThinking.current = true

    // 超时保护：30 秒内没有任何响应则中止
    timeoutRef.current = setTimeout(() => {
      controller.abort()
      isThinking.current = false
      onError('timeout')
    }, REQUEST_TIMEOUT_MS)

    const messages = buildMessages(contextMsgs, userText, userName)

    fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        stream: true,
        max_tokens: 1024,
        temperature: 0.7,
      }),
      signal: controller.signal,
    })
      .then(async res => {
        // 收到响应头即取消超时计时（流式读取可能很慢，但已建立连接）
        clearTimeout_()

        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          throw new Error(`${res.status} ${errText}`)
        }
        if (!res.body) throw new Error('响应体为空')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let fullText = ''
        let firstChunk = true

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const deltas = sseParser.current.feed(chunk)

          for (const delta of deltas) {
            if (delta === '\x00DONE\x00') {
              isThinking.current = false
              onDone(fullText)
              return
            }
            // 收到第一个 chunk 时通知外部（可用于隐藏"思考中"动画）
            if (firstChunk) {
              firstChunk = false
              onChunk('\x00FIRST\x00')  // 特殊标记：首个 chunk
            }
            fullText += delta
            onChunk(delta)
          }
        }

        // 流正常结束但没有收到 [DONE]
        isThinking.current = false
        onDone(fullText)
      })
      .catch(err => {
        clearTimeout_()
        isThinking.current = false
        if (err.name === 'AbortError') return  // 主动中止，静默处理
        onError(friendlyError(err))
      })
  }, [clearTimeout_])

  const abortAI = useCallback(() => {
    clearTimeout_()
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    isThinking.current = false
    sseParser.current.reset()
  }, [clearTimeout_])

  return { askAI, abortAI, isThinking }
}
