import { useCallback, useRef } from 'react'
import type { ChatMessage } from './types'

// DeepSeek API 配置
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEEPSEEK_API_KEY = 'sk-209a9d7b033b45b685c3ce767521a802'

// AI 在聊天室中的标识
export const AI_ID = '__ai_deepseek__'
export const AI_NAME = 'AI 助手'
export const AI_COLOR = '#6366f1'  // 紫色，区别于普通用户

// 构建发送给 DeepSeek 的消息上下文
// 取最近 N 条文本消息作为对话历史，图片以 URL 形式传入（多模态）
function buildMessages(
  contextMsgs: ChatMessage[],
  userPrompt: string,
  userName: string
): { role: 'system' | 'user' | 'assistant'; content: string | { type: string; text?: string; image_url?: { url: string } }[] }[] {
  const systemPrompt = `你是一个聊天室里的 AI 助手，昵称为"AI 助手"。
当前聊天室的用户通过 @AI 来召唤你。
你的回复应当简洁、友好、口语化，适合聊天室场景。
如果上下文中有图片，你可以对图片内容进行描述和分析。
不要在回复中重复提及"@AI"或"AI 助手"这些词，直接回答即可。`

  const history: { role: 'system' | 'user' | 'assistant'; content: string | { type: string; text?: string; image_url?: { url: string } }[] }[] = [
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
    } else if (m.type === 'image' && m.fileUrl) {
      // 多模态：图片消息以 vision 格式传入
      history.push({
        role,
        content: [
          { type: 'text', text: `${prefix}[发送了一张图片]` },
          { type: 'image_url', image_url: { url: m.fileUrl } }
        ]
      })
    } else if (m.type === 'file') {
      history.push({ role, content: `${prefix}[发送了文件: ${m.fileName || '未知文件'}]` })
    } else if (m.type === 'voice') {
      history.push({ role, content: `${prefix}[发送了语音消息，暂不支持语音解析]` })
    }
  }

  // 最后追加当前用户的提问（去掉 @AI 前缀）
  history.push({ role: 'user', content: `[${userName}]: ${userPrompt}` })

  return history
}

// 从消息文本中提取 @AI 后的实际提问内容
export function extractAIPrompt(text: string): string | null {
  // 匹配 @AI、@ai、@Ai 等变体，提取后面的内容
  const match = text.match(/@AI\s*([\s\S]*)/i)
  if (!match) return null
  const prompt = match[1].trim()
  return prompt || null  // 空内容不触发
}

// 检测消息是否包含 @AI
export function hasAtAI(text: string): boolean {
  return /@AI\b/i.test(text)
}

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

  const askAI = useCallback((
    userText: string,
    userName: string,
    contextMsgs: ChatMessage[],
    onChunk: (delta: string) => void,
    onDone: (fullText: string) => void,
    onError: (err: string) => void
  ) => {
    // 提取 @AI 后的实际提问
    const prompt = extractAIPrompt(userText)
    if (!prompt) { onError('请在 @AI 后输入问题'); return }

    // 如果上一次还在思考，先中止
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    isThinking.current = true

    const messages = buildMessages(contextMsgs, prompt, userName)

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

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

          for (const line of lines) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              isThinking.current = false
              onDone(fullText)
              return
            }
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content || ''
              if (delta) {
                fullText += delta
                onChunk(delta)
              }
            } catch {
              // 忽略解析失败的行
            }
          }
        }

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
  }, [])

  return { askAI, abortAI, isThinking }
}
