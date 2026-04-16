import { useState, useRef, useCallback, useEffect } from 'react'
import type { OnlineUser, User } from '../types'
import { AtMentionPanel } from './AtMentionPanel'
import type { MentionCandidate } from './AtMentionPanel'
import { AI_ID, KIMI_ID } from '../useAI'

// ─── 语音录制 Hook ────────────────────────────────────────────────────────────
function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find(m => MediaRecorder.isTypeSupported(m)) || ''
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      mediaRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(200)
      setRecording(true)
      setDuration(0)
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
      return true
    } catch {
      alert('无法获取麦克风权限，请允许浏览器使用麦克风')
      return false
    }
  }, [])

  const stop = useCallback((): Promise<{ blob: Blob; duration: number } | null> => {
    return new Promise(resolve => {
      if (!mediaRef.current) { resolve(null); return }
      const mr = mediaRef.current
      if (timerRef.current) clearInterval(timerRef.current)
      let finalDuration = 0
      setDuration(d => { finalDuration = d; return d })
      mr.onstop = () => {
        const mimeType = mr.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })
        mr.stream.getTracks().forEach(t => t.stop())
        mediaRef.current = null
        setRecording(false)
        resolve({ blob, duration: finalDuration })
      }
      mr.stop()
    })
  }, [])

  return { recording, duration, start, stop }
}

// ─── 解析当前光标前的 @ 触发词 ─────────────────────────────────────────────────
// 返回 @ 的位置和 @ 后面已输入的查询字符串
function parseAtQuery(text: string, cursorPos: number): { atStart: number; query: string } | null {
  const before = text.slice(0, cursorPos)
  const atIdx = before.lastIndexOf('@')
  if (atIdx === -1) return null
  // @ 前面必须是空白或行首
  if (atIdx > 0 && !/[\s]/.test(before[atIdx - 1])) return null
  const query = before.slice(atIdx + 1)
  // query 中出现空格说明已经完成了 @ 提及，关闭面板
  if (/\s/.test(query)) return null
  return { atStart: atIdx, query }
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface InputBarProps {
  status: string
  onlineUsers: OnlineUser[]
  self: User
  sendText: (text: string, replyTo?: { id: string; senderName: string; text?: string; type: string }) => void
  sendTyping: () => void
  sendFile: (file: File) => void
  sendVoice: (blob: Blob, duration: number) => void
  replyTarget: { id: string; senderName: string; text?: string; type: string } | null
  setReplyTarget: (target: { id: string; senderName: string; text?: string; type: string } | null) => void
  setLongPressId: (id: string | null) => void
  /** AI 正在思考或回复中，placeholder 给出提示 */
  aiThinking?: boolean
}

export function InputBar({
  status, onlineUsers, self,
  sendText, sendTyping, sendFile, sendVoice,
  replyTarget, setReplyTarget, setLongPressId,
  aiThinking = false,
}: InputBarProps) {
  const [inputText, setInputText] = useState('')
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showPhotoMode, setShowPhotoMode] = useState(false)

  // @ 面板状态：null = 关闭，否则包含 @ 的位置和查询字符串
  const [atQuery, setAtQuery] = useState<{ atStart: number; query: string } | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const { recording, duration: recDuration, start: startRec, stop: stopRec } = useVoiceRecorder()

  // ── 修复 #21：拦截 textarea 的 touchmove 冒泡，防止外层列表滚动 ─────────────
  // 使用原生 addEventListener（而非 React 合成事件）以便精确控制事件传播。
  // 只在 textarea 内容可滚动时调用 stopPropagation()，阻止冒泡到外层消息列表。
  // 不调用 preventDefault()，保留浏览器原生文本滚动行为，因此 passive:true 即可。
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const handler = (e: TouchEvent) => {
      const canScrollUp = el.scrollTop > 0
      const canScrollDown = el.scrollTop < el.scrollHeight - el.clientHeight
      if (canScrollUp || canScrollDown) {
        e.stopPropagation()
      }
    }
    el.addEventListener('touchmove', handler, { passive: true })
    return () => el.removeEventListener('touchmove', handler)
  }, [])

  // ── 发送消息 ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text || status !== 'ok') return
    sendText(text, replyTarget ?? undefined)
    setInputText('')
    setReplyTarget(null)
    setLongPressId(null)
    setAtQuery(null)
    if (inputRef.current) { inputRef.current.style.height = 'auto' }
  }, [inputText, status, sendText, replyTarget, setReplyTarget, setLongPressId])

  // ── 输入框内容变化：同步高度 + 检测 @ 触发 ────────────────────────────────
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInputText(val)
    // 自适应高度
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
    sendTyping()
    // 检测 @ 触发
    const cursor = e.target.selectionStart ?? val.length
    setAtQuery(parseAtQuery(val, cursor))
  }, [sendTyping])

  // ── 光标移动时重新检测（用户用方向键移动光标） ────────────────────────────
  const handleSelect = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const cursor = el.selectionStart ?? el.value.length
    setAtQuery(parseAtQuery(el.value, cursor))
  }, [])

  // ── 键盘事件：Enter 发送（@ 面板打开时由面板处理 Enter）────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (atQuery) return  // @ 面板打开时，Enter/Tab/Esc 交给面板处理
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend, atQuery])

  // ── 粘贴图片 ──────────────────────────────────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) { sendFile(file); e.preventDefault() }
      }
    }
  }, [sendFile])

  // ── 语音按钮 ──────────────────────────────────────────────────────────────
  const handleVoiceBtn = useCallback(async () => {
    if (recording) {
      const result = await stopRec()
      if (result && result.blob.size > 0) sendVoice(result.blob, result.duration)
    } else {
      await startRec()
    }
  }, [recording, startRec, stopRec, sendVoice])

  // ── AI 快捷指令面板 ──────────────────────────────────────────────────────────
  const [showAiPrompts, setShowAiPrompts] = useState(false)

  const AI_QUICK_PROMPTS = [
    { label: '总结聊天', text: '@AI 请帮我总结一下上面的聊天内容' },
    { label: '翻译成英文', text: '@Kimi 请把上面这段话翻译成英文' },
    { label: '润色文字', text: '@AI 请帮我润色以下文字：' },
    { label: '解释一下', text: '@AI 请解释一下：' },
    { label: '写首诗', text: '@Kimi 请以「' },
  ]

  const handleQuickPrompt = useCallback((text: string) => {
    setInputText(text)
    setShowAiPrompts(false)
    setShowPlusMenu(false)
    setTimeout(() => {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(text.length, text.length)
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 120) + 'px'
      }
    }, 50)
  }, [])

  // ── 点击 @ 按钮：立即弹出候选列表（不插入 @，atStart 记录光标位置）────────
  const handleAtBtn = useCallback(() => {
    const el = inputRef.current
    // 输入框为空时，显示 AI 快捷指令面板
    if (!inputText.trim()) {
      setShowAiPrompts(s => !s)
      setShowPlusMenu(false)
      return
    }
    setShowAiPrompts(false)
    // 获取当前光标位置（或末尾）
    const cursor = el?.selectionStart ?? inputText.length
    setAtQuery({ atStart: cursor, query: '' })
    setShowPlusMenu(false)
    // 延迟聚焦，避免 blur 立即关闭面板
    setTimeout(() => el?.focus(), 50)
  }, [inputText])

  // ── 选中 @ 候选项：在光标处插入 @昵称 ────────────────────────────────────
  const handleMentionSelect = useCallback((candidate: MentionCandidate) => {
    if (!atQuery) return
    const el = inputRef.current

    // AI 插入 @AI，其他用户插入 @昵称
    // B5 修复：明确匹配 AI 和 Kimi，保证插入名称与触发检测一致
    const mentionText = candidate.id === AI_ID ? 'AI' : candidate.id === KIMI_ID ? 'Kimi' : candidate.name

    // 分割文本：@ 前的部分 + @ 后已输入的 query 之后的部分
    const before = inputText.slice(0, atQuery.atStart)
    const afterQuery = inputText.slice(atQuery.atStart + 1 + atQuery.query.length)

    // 如果 @ 前面没有空格且有内容，自动补一个空格
    const needLeadingSpace = before.length > 0 && !/\s$/.test(before)
    const insert = `${needLeadingSpace ? ' ' : ''}@${mentionText} `

    const newText = before + insert + afterQuery
    const newCursor = before.length + insert.length

    setInputText(newText)
    setAtQuery(null)

    // 聚焦并移动光标到插入点之后
    setTimeout(() => {
      if (el) {
        el.focus()
        el.setSelectionRange(newCursor, newCursor)
        // 同步高度
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 120) + 'px'
      }
    }, 0)
  }, [atQuery, inputText])

  const closeAtPanel = useCallback(() => setAtQuery(null), [])

  const statusMap: Record<string, string> = { disconnected: '未连接', connecting: '连接中', ok: '已连接', err: '连接失败' }
  const statusText = statusMap[status] || '未连接'

  const placeholder = status !== 'ok'
    ? statusText
    : aiThinking
      ? 'AI 正在回复中…'
      : '语言的力量'

  return (
    // ⚠️ 关键：position:relative 让 .at-panel 的 absolute 定位相对于此容器
    <div style={{ position: 'relative' }}>

      {/* + 号菜单 */}
      {showPlusMenu && (
        <div className="plus-menu menu-anim">
          {showPhotoMode ? (
            <div className="photo-mode-panel">
              <div className="photo-mode-title">选择方式</div>
              <div className="plus-menu-grid">
                <button className="plus-menu-item" onClick={() => { cameraInputRef.current?.click(); setShowPlusMenu(false); setShowPhotoMode(false) }}>
                  <span className="plus-menu-icon">📷</span>
                  <span className="plus-menu-label">拍照</span>
                </button>
                <button className="plus-menu-item" onClick={() => { imgInputRef.current?.click(); setShowPlusMenu(false); setShowPhotoMode(false) }}>
                  <span className="plus-menu-icon">🖼️</span>
                  <span className="plus-menu-label">从相册选择</span>
                </button>
              </div>
              <button className="photo-mode-back" onClick={() => setShowPhotoMode(false)}>← 返回</button>
            </div>
          ) : (
            <div className="plus-menu-grid">
              <button className="plus-menu-item" onClick={() => setShowPhotoMode(true)}>
                <span className="plus-menu-icon">🖼️</span>
                <span className="plus-menu-label">图片</span>
              </button>
              <button className="plus-menu-item" onClick={() => { fileInputRef.current?.click(); setShowPlusMenu(false) }}>
                <span className="plus-menu-icon">📁</span>
                <span className="plus-menu-label">文件 <span className="file-limit-badge">≤20MB</span></span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI 快捷指令面板 */}
      {showAiPrompts && (
        <div className="ai-prompts-panel menu-anim">
          <div className="ai-prompts-title">✨ AI 快捷指令</div>
          <div className="ai-prompts-list">
            {AI_QUICK_PROMPTS.map((p, i) => (
              <button key={i} className="ai-prompt-item" onClick={() => handleQuickPrompt(p.text)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* @ 提及面板（position:absolute，相对于外层 div 定位到输入栏上方） */}
      {atQuery !== null && (
        <AtMentionPanel
          query={atQuery.query}
          onlineUsers={onlineUsers}
          self={self}
          onSelect={handleMentionSelect}
          onClose={closeAtPanel}
        />
      )}

      {/* 引用回复预览条 */}
      {replyTarget && (
        <div className="reply-bar">
          <div className="reply-bar-content">
            <span className="reply-bar-name">{replyTarget.senderName}</span>
            <span className="reply-bar-text">
              {replyTarget.type === 'text' ? (replyTarget.text || '') : `[图片/文件/语音]`}
            </span>
          </div>
          <button
            className="reply-bar-close"
            onClick={() => { setReplyTarget(null); setLongPressId(null) }}
          >✕</button>
        </div>
      )}

      {/* 底部输入栏 */}
      <div className="input-bar">
        {/* + 号按钮 */}
        <button
          className="bar-icon-btn"
          onClick={() => { setShowPlusMenu(s => !s); setAtQuery(null) }}
          style={{
            background: showPlusMenu ? 'var(--hz-500)' : 'var(--bg-input)',
            color: showPlusMenu ? 'white' : 'var(--text-secondary)',
            transform: showPlusMenu ? 'rotate(45deg)' : 'rotate(0deg)',
            transition: 'background 0.15s, transform 0.2s',
          }}
        >
          +
        </button>

        {/* @ 按钮 */}
        <button
          className="bar-icon-btn at-btn"
          onClick={handleAtBtn}
          title="@ 提及 · 召唤 AI"
          disabled={status !== 'ok'}
          style={{
            opacity: status !== 'ok' ? 0.4 : 1,
            background: atQuery !== null ? 'var(--hz-500)' : 'var(--bg-input)',
            color: atQuery !== null ? 'white' : 'var(--text-secondary)',
            transition: 'background 0.15s',
          }}
        >
          @
        </button>

        {/* 输入区 / 录音状态 */}
        {recording ? (
          <div className="recording-bar">
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hz-600)' }}>🔴 录音中 {recDuration}s</span>
            <span className="typing-dots">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </span>
          </div>
        ) : (
          <textarea
            ref={inputRef}
            className="input-hz"
            style={{ minHeight: 40, maxHeight: 120, padding: '10px 14px', fontSize: 14, lineHeight: '1.4', resize: 'none', overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            placeholder={placeholder}
            disabled={status !== 'ok'}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onSelect={handleSelect}
            onPaste={handlePaste}
            rows={1}
          />
        )}

        {/* 发送 / 录音按钮 */}
        {recording ? (
          <button className="btn-hz" style={{ padding: '10px 16px', fontSize: 14 }} onClick={handleVoiceBtn}>
            发送
          </button>
        ) : inputText.trim() ? (
          <button className="btn-hz" style={{ padding: '10px 16px', fontSize: 14, opacity: status !== 'ok' ? 0.4 : 1 }}
            onClick={handleSend} disabled={status !== 'ok'}>
            发送
          </button>
        ) : (
          <button className="bar-icon-btn" onClick={handleVoiceBtn}>🎤</button>
        )}
      </div>

      {/* 隐藏文件输入 */}
      <input ref={imgInputRef} type="file" style={{ display: 'none' }} accept="image/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />
      <input ref={cameraInputRef} type="file" style={{ display: 'none' }} accept="image/*" capture="environment"
        onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept="*/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />
    </div>
  )
}
