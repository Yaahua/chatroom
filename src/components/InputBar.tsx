import { useState, useRef, useCallback, useEffect } from 'react'
import type { OnlineUser, User } from '../types'
import { AtMentionPanel } from './AtMentionPanel'
import type { MentionCandidate } from './AtMentionPanel'
import { AI_ID, AI_NAME, AI_COLOR, KIMI_ID, KIMI_NAME, KIMI_COLOR } from '../useAI'

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
      window.dispatchEvent(new CustomEvent('chatroom-toast', { detail: '无法获取麦克风权限，请允许浏览器使用麦克风' }))
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
function parseAtQuery(text: string, cursorPos: number): { atStart: number; query: string } | null {
  const before = text.slice(0, cursorPos)
  const atIdx = before.lastIndexOf('@')
  if (atIdx === -1) return null
  if (atIdx > 0 && !/[\s]/.test(before[atIdx - 1])) return null
  const query = before.slice(atIdx + 1)
  if (/\s/.test(query)) return null
  return { atStart: atIdx, query }
}

// ─── 助手定义（两阶段菜单数据源）────────────────────────────────────────────────
interface AssistantDef {
  id: string
  name: string
  color: string
  desc: string   // 简短描述，显示在助手列表中
  mentionText: string  // 插入文本时使用的 @名称
}

const ASSISTANTS: AssistantDef[] = [
  {
    id: AI_ID,
    name: AI_NAME,
    color: AI_COLOR,
    desc: 'DeepSeek · 深度推理',
    mentionText: 'AI',
  },
  {
    id: KIMI_ID,
    name: KIMI_NAME,
    color: KIMI_COLOR,
    desc: 'Moonshot · 长文理解',
    mentionText: 'Kimi',
  },
]

// ─── 每个助手的快捷指令 ──────────────────────────────────────────────────────────
const ASSISTANT_PROMPTS: Record<string, { label: string; suffix: string }[]> = {
  [AI_ID]: [
    { label: '📝 总结聊天', suffix: '简要总结以上对话要点' },
    { label: '🐢 来玩海龟汤', suffix: '生成一道海龟汤，只给汤面（场景），我先提问猜真相，你只用回答"是/否/无关"' },
    { label: '📚 5W2H学习法', suffix: '用5W2H学习法解释' },
    { label: '🎋 生成诗词', suffix: '给我生成一段当前聊天的诗词' },
  ],
  [KIMI_ID]: [
    { label: '📝 总结聊天', suffix: '简要总结以上对话要点' },
    { label: '🐢 来玩海龟汤', suffix: '生成一道海龟汤，只给汤面（场景），我先提问猜真相，你只用回答"是/否/无关"' },
    { label: '📚 5W2H学习法', suffix: '用5W2H学习法解释' },
    { label: '🎋 生成诗词', suffix: '给我生成一段当前聊天的诗词' },
  ],
}

// ─── 两阶段 @ 菜单组件 ──────────────────────────────────────────────────────────
type AtPhase = 'assistant' | 'prompt'

interface TwoPhaseAtPanelProps {
  phase: AtPhase
  selectedAssistant: AssistantDef | null
  onSelectAssistant: (a: AssistantDef) => void
  onSelectPrompt: (text: string) => void
  onBack: () => void
  onClose: () => void
}

function TwoPhaseAtPanel({
  phase, selectedAssistant,
  onSelectAssistant, onSelectPrompt, onBack, onClose,
}: TwoPhaseAtPanelProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  const items = phase === 'assistant'
    ? ASSISTANTS
    : (selectedAssistant ? ASSISTANT_PROMPTS[selectedAssistant.id] ?? [] : [])

  // 阶段切换时重置高亮
  useEffect(() => { setActiveIndex(0) }, [phase])

  // 键盘导航（不再处理 Escape，由 InputBar 层统一处理）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(i => (i + 1) % Math.max(items.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(i => (i - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (items.length > 0) {
          e.preventDefault()
          e.stopPropagation()
          if (phase === 'assistant') {
            onSelectAssistant(ASSISTANTS[activeIndex])
          } else if (selectedAssistant) {
            const p = ASSISTANT_PROMPTS[selectedAssistant.id]?.[activeIndex]
            if (p) onSelectPrompt(`@${selectedAssistant.mentionText} ${p.suffix}`)
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (phase === 'prompt') onBack()
        else onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [items, activeIndex, phase, selectedAssistant, onSelectAssistant, onSelectPrompt, onBack, onClose])

  // ⚠️ 点击外部关闭逻辑已移至 InputBar 层，避免阶段切换时 ref 失效导致误关闭

  return (
    <div className="at-panel menu-anim">
      {/* 面板头部 */}
      <div className="at-panel-header">
        {phase === 'prompt' && (
          <button
            className="at-panel-back-btn"
            onMouseDown={e => { e.preventDefault(); onBack() }}
            title="返回助手列表"
          >
            ←
          </button>
        )}
        <span className="at-panel-title">
          {phase === 'assistant'
            ? '选择助手'
            : `${selectedAssistant?.name} · 快捷指令`}
        </span>
        {phase === 'prompt' && selectedAssistant && (
          <div
            className="at-avatar at-avatar-ai at-panel-header-avatar"
            style={{ background: selectedAssistant.color }}
          >
            🤖
          </div>
        )}
      </div>

      {/* 列表内容 */}
      <div className="at-panel-list">
        {phase === 'assistant' && ASSISTANTS.map((a, i) => (
          <button
            key={a.id}
            className={`at-panel-item${i === activeIndex ? ' at-panel-item-active' : ''}`}
            onMouseDown={e => { e.preventDefault(); onSelectAssistant(a) }}
            onMouseEnter={() => setActiveIndex(i)}
          >
            <div className="at-avatar at-avatar-ai" style={{ background: a.color }}>
              🤖
            </div>
            <div className="at-info">
              <span className="at-name">{a.name}</span>
              <span className="at-desc">{a.desc}</span>
            </div>
            <span className="at-panel-chevron">›</span>
          </button>
        ))}

        {phase === 'prompt' && selectedAssistant && (
          ASSISTANT_PROMPTS[selectedAssistant.id]?.map((p, i) => (
            <button
              key={i}
              className={`at-panel-item at-panel-item-prompt${i === activeIndex ? ' at-panel-item-active' : ''}`}
              onMouseDown={e => {
                e.preventDefault()
                onSelectPrompt(`@${selectedAssistant.mentionText} ${p.suffix}`)
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="at-prompt-label">{p.label}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
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

  // ── 键盘输入 @ 触发的提及面板（原有逻辑，保持不变）────────────────────────
  const [atQuery, setAtQuery] = useState<{ atStart: number; query: string } | null>(null)

  // ── 按钮触发的两阶段 @ 菜单状态 ──────────────────────────────────────────────
  // null = 关闭；'assistant' = 第一阶段（选助手）；'prompt' = 第二阶段（选指令）
  const [atPhase, setAtPhase] = useState<AtPhase | null>(null)
  const [selectedAssistant, setSelectedAssistant] = useState<AssistantDef | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  // 稳定容器 ref，包裹整个两阶段面板区域，用于点击外部关闭
  const panelWrapRef = useRef<HTMLDivElement>(null)

  const { recording, duration: recDuration, start: startRec, stop: stopRec } = useVoiceRecorder()

  // ── 修复 #21：拦截 textarea 的 touchmove 冒泡，防止外层列表滚动 ─────────────
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const handler = (e: TouchEvent) => {
      const canScrollUp = el.scrollTop > 0
      const canScrollDown = el.scrollTop < el.scrollHeight - el.clientHeight
      if (canScrollUp || canScrollDown) e.stopPropagation()
    }
    el.addEventListener('touchmove', handler, { passive: true })
    return () => el.removeEventListener('touchmove', handler)
  }, [])

  // ── 关闭所有 @ 面板的统一方法 ────────────────────────────────────────────────
  // withMention: 关闭时是否将已选助手的 @mention 填入输入框（用户不选指令直接关闭时保留 @ 意图）
  const closeAllAtPanels = useCallback((withMention?: AssistantDef | null) => {
    setAtQuery(null)
    setAtPhase(null)
    setSelectedAssistant(null)
    if (withMention) {
      // 在当前输入框内容末尾插入 @mention，光标置于末尾，用户可继续打字
      const mention = `@${withMention.mentionText} `
      setInputText(prev => {
        const base = prev.trimEnd()
        return base ? base + ' ' + mention : mention
      })
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        // 光标移到末尾
        const len = el.value.length
        el.setSelectionRange(len, len)
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 120) + 'px'
      })
    }
  }, [])

  // ── 点击面板外部关闭两阶段菜单（提升到 InputBar 层，避免阶段切换时 ref 失效）────
  // 用 ref 持有最新的 selectedAssistant，避免 useEffect 闭包捕获旧值
  const selectedAssistantRef = useRef<AssistantDef | null>(null)
  useEffect(() => { selectedAssistantRef.current = selectedAssistant }, [selectedAssistant])

  useEffect(() => {
    if (atPhase === null) return
    const handler = (e: MouseEvent) => {
      if (panelWrapRef.current && !panelWrapRef.current.contains(e.target as Node)) {
        // 若已进入第二阶段（已选助手），关闭时保留 @mention，用户可继续打字
        closeAllAtPanels(selectedAssistantRef.current)
      }
    }
    // 延迟注册，避免捕获到触发面板打开的同一个 mousedown
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 150)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
  }, [atPhase, closeAllAtPanels])

  // ── 发送消息 ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text || status !== 'ok') return
    sendText(text, replyTarget ?? undefined)
    setInputText('')
    setReplyTarget(null)
    setLongPressId(null)
    closeAllAtPanels()
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }, [inputText, status, sendText, replyTarget, setReplyTarget, setLongPressId, closeAllAtPanels])

  // ── 输入框内容变化：同步高度 + 检测 @ 触发 ────────────────────────────────
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInputText(val)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
    sendTyping()
    const cursor = e.target.selectionStart ?? val.length
    const parsed = parseAtQuery(val, cursor)
    setAtQuery(parsed)
    // 键盘输入 @ 时，关闭按钮触发的两阶段面板，避免同时显示两个面板
    if (parsed) { setAtPhase(null); setSelectedAssistant(null) }
  }, [sendTyping])

  // ── 光标移动时重新检测 ────────────────────────────────────────────────────
  const handleSelect = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const cursor = el.selectionStart ?? el.value.length
    setAtQuery(parseAtQuery(el.value, cursor))
  }, [])

  // ── 键盘事件：Enter 发送（任意 @ 面板打开时交给面板处理）────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (atQuery || atPhase) return
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend, atQuery, atPhase])

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

  // ── 点击 @ 按钮 ──────────────────────────────────────────────────────────
  // 输入框为空：进入两阶段流程（助手列表）
  // 输入框有内容：走原有 atQuery 路径（助手+用户混合列表）
  const handleAtBtn = useCallback(() => {
    if (status !== 'ok') return
    const el = inputRef.current

    if (!inputText.trim()) {
      // 切换两阶段面板
      if (atPhase) {
        closeAllAtPanels()
      } else {
        setAtPhase('assistant')
        setSelectedAssistant(null)
        setAtQuery(null)
        setShowPlusMenu(false)
      }
      return
    }

    // 输入框有内容：走原有 atQuery 路径
    setAtPhase(null)
    setSelectedAssistant(null)
    const cursor = el?.selectionStart ?? inputText.length
    setAtQuery({ atStart: cursor, query: '' })
    setShowPlusMenu(false)
    setTimeout(() => el?.focus(), 50)
  }, [inputText, status, atPhase, closeAllAtPanels])

  // ── 两阶段面板：选中助手（第一阶段 → 第二阶段）────────────────────────────
  const handleSelectAssistant = useCallback((a: AssistantDef) => {
    setSelectedAssistant(a)
    setAtPhase('prompt')
  }, [])

  // ── 两阶段面板：选中快捷指令（填入输入框）────────────────────────────────
  const handleSelectPrompt = useCallback((text: string) => {
    // 末尾加空格，用户选完指令后可直接追加补充内容，不会紧贴在指令文本后
    const textWithSpace = text.endsWith(' ') ? text : text + ' '
    setInputText(textWithSpace)
    closeAllAtPanels()
    setShowPlusMenu(false)
    // 双重聚焦：requestAnimationFrame 确保 DOM 更新后再聚焦，兼容移动端
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(textWithSpace.length, textWithSpace.length)
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    })
  }, [closeAllAtPanels])

  // ── 两阶段面板：从第二阶段返回第一阶段 ──────────────────────────────────
  const handleBackToAssistant = useCallback(() => {
    setAtPhase('assistant')
    setSelectedAssistant(null)
  }, [])

  // ── 选中 @ 候选项（原有路径）：在光标处插入 @昵称 ────────────────────────
  const handleMentionSelect = useCallback((candidate: MentionCandidate) => {
    if (!atQuery) return
    const el = inputRef.current
    const mentionText = candidate.id === AI_ID ? 'AI' : candidate.id === KIMI_ID ? 'Kimi' : candidate.name
    const before = inputText.slice(0, atQuery.atStart)
    const afterQuery = inputText.slice(atQuery.atStart + 1 + atQuery.query.length)
    const needLeadingSpace = before.length > 0 && !/\s$/.test(before)
    const insert = `${needLeadingSpace ? ' ' : ''}@${mentionText} `
    const newText = before + insert + afterQuery
    const newCursor = before.length + insert.length
    setInputText(newText)
    setAtQuery(null)
    setTimeout(() => {
      if (el) {
        el.focus()
        el.setSelectionRange(newCursor, newCursor)
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

  // @ 按钮是否处于激活态
  const atBtnActive = atQuery !== null || atPhase !== null

  return (
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

      {/* 两阶段 @ 菜单（按钮触发，输入框为空时显示）
           panelWrapRef 包裹整个面板区域，用于稳定的点击外部检测 */}
      <div ref={panelWrapRef} style={{ position: 'static' }}>
        {atPhase !== null && (
          <TwoPhaseAtPanel
            phase={atPhase}
            selectedAssistant={selectedAssistant}
            onSelectAssistant={handleSelectAssistant}
            onSelectPrompt={handleSelectPrompt}
            onBack={handleBackToAssistant}
            onClose={() => closeAllAtPanels(selectedAssistant)}
          />
        )}
      </div>

      {/* 原有 @ 提及面板（键盘输入 @ 触发，或输入框有内容时按钮触发） */}
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
          onClick={() => { setShowPlusMenu(s => !s); closeAllAtPanels() }}
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
            background: atBtnActive ? 'var(--hz-500)' : 'var(--bg-input)',
            color: atBtnActive ? 'white' : 'var(--text-secondary)',
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
