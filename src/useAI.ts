import { useCallback, useRef } from 'react'
import type { ChatMessage } from './types'

// DeepSeek API 配置
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEEPSEEK_API_KEY = 'sk-209a9d7b033b45b685c3ce767521a802'

// AI 在聊天室中的标识
export const AI_ID = '__ai_deepseek__'
export const AI_NAME = 'AI 助手'
export const AI_COLOR = '#6366f1'

// ─── @ 触发检测 ──────────────────────────────────────────────────────────────
// Bug 修复：原来的 @AI\b 无法匹配 "@AI 助手" 插入的内容
// 现在同时支持：@AI、@ai、@AI 助手 等所有变体
export function hasAtAI(text: string): boolean {
  return /@AI(\s|$|助手)/i.test(text)
}

// 从消息文本中提取 @AI 后的实际提问内容
// 支持 "@AI 你好" 和 "@AI助手 你好" 两种格式
export function extractAIPrompt(text: string): string | null {
  const match = text.match(/@AI(?:\s*助手)?\s*([\s\S]*)/i)
  if (!match) return null
  const prompt = match[1].trim()
  return prompt || null
}

// ─── 上下文构建 ──────────────────────────────────────────────────────────────
type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | { type: string; text?: string; image_url?: { url: string } }[]
}

function buildMessages(
  contextMsgs: ChatMessage[],
  userPrompt: string,
  userName: string
): DeepSeekMessage[] {
  const systemPrompt = `你是一个聊天室里的 AI 助手，昵称为"AI 助手"。
当前聊天室的用户通过 @AI 来召唤你。
你的回复应当简洁、友好、口语化，适合聊天室场景。
如果上下文中有图片描述，你可以根据描述进行分析。
不要在回复中重复提及"@AI"或"AI 助手"这些词，直接回答即可。`

  const history: DeepSeekMessage[] = [
    { role: 'system', content: systemPrompt }
  ]

  // 取最近 20 条非系统消息作为上下文
  const recentMsgs = contextMsgs
    .filter(m => m.type !== 'sys' && !m.recalled)
    .slice(-20)

  for (const m of recentMsgs) {
    const role = m.senderId === AI_ID ? 'assistant' : 'user'
    const prefix = m.senderId === AI_ID ? '' : `[${m.senderName}]: `

    if (m.type === 'text' && m.text) {
      history.push({ role, content: `${prefix}${m.text}` })
    } else if (m.type === 'image') {
      // Bug 修复：blob:// URL 是本地临时 URL，DeepSeek 服务器无法访问
      // 改为仅传递文字描述，不传图片 URL
      history.push({ role, content: `${prefix}[发送了一张图片，图片内容无法直接分析]` })
    } else if (m.type === 'file') {
      history.push({ role, content: `${prefix}[发送了文件: ${m.fileName || '未知文件'}]` })
    } else if (m.type === 'voice') {
      history.push({ role, content: `${prefix}[发送了语音消息，暂不支持语音解析]` })
    }
  }

  // 追加当前用户的提问（去掉 @AI/@AI助手 前缀，只保留实际问题）
  const cleanPrompt = extractAIPrompt(userPrompt) || userPrompt
  history.push({ role: 'user', content: `[${userName}]: ${cleanPrompt}` })

  return history
}

// ─── SSE 流式解析器 ──────────────────────────────────────────────────────────
// Bug 修复：原来直接 split('\n') 会在 chunk 跨帧时丢失数据
// 改用缓冲区拼接，确保每行完整后再解析
class SSEParser {
  private buffer = ''

  feed(chunk: string): string[] {
    this.buffer += chunk
    const deltas: string[] = []
    const lines = this.buffer.split('\n')
    // 最后一行可能不完整，保留在 buffer 中
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') {
        deltas.push('\x00DONE\x00')  // 特殊标记：流结束
        continue
      }
      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) deltas.push(delta)
      } catch {
        // 忽略解析失败的行（如心跳包）
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

  const askAI = useCallback((
    userText: string,
    userName: string,
    contextMsgs: ChatMessage[],
    onChunk: (delta: string) => void,
    onDone: (fullText: string) => void,
    onError: (err: string) => void
  ) => {
    // 如果上一次还在思考，先中止
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    sseParser.current.reset()

    const controller = new AbortController()
    abortControllerRef.current = controller
    isThinking.current = true

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
        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`API 错误 ${res.status}: ${errText}`)
        }
        if (!res.body) throw new Error('响应体为空')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let fullText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // 使用 SSEParser 处理跨帧数据
          const chunk = decoder.decode(value, { stream: true })
          const deltas = sseParser.current.feed(chunk)

          for (const delta of deltas) {
            if (delta === '\x00DONE\x00') {
              isThinking.current = false
              onDone(fullText)
              return
            }
            fullText += delta
            onChunk(delta)
          }
        }

        // 流正常结束但没有收到 [DONE]（网络截断等情况）
        isThinking.current = false
        onDone(fullText)
      })
      .catch(err => {
        isThinking.current = false
        if (err.name === 'AbortError') return  // 主动中止，不报错
        onError(err.message || 'AI 请求失败')
      })
  }, [])

  const abortAI = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    isThinking.current = false
    sseParser.current.reset()
  }, [])

  return { askAI, abortAI, isThinking }
}
