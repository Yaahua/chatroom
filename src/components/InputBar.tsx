import { useState, useRef, useCallback } from 'react'
import type { OnlineUser, User } from '../types'
import { AtMentionPanel } from './AtMentionPanel'
import type { MentionCandidate } from './AtMentionPanel'
import { AI_NAME } from '../useAI'

const EMOJIS = ['😀','😂','🥰','😎','🤔','😅','🙏','👍','👎','❤️','🔥','✨','🎉','💯','😭','🤣','😊','😍','🥺','😤','💪','🤝','👏','🎊','🌟','🍵','🌸','🍂','🌙','⭐']

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
// 返回 { atStart, query } 或 null（未触发）
function parseAtQuery(text: string, cursorPos: number): { atStart: number; query: string } | null {
  // 从光标往前找最近的 @
  const before = text.slice(0, cursorPos)
  const atIdx = before.lastIndexOf('@')
  if (atIdx === -1) return null
  // @ 前面必须是行首或空格（防止邮箱地址触发）
  if (atIdx > 0 && !/[\s]/.test(before[atIdx - 1])) return null
  const query = before.slice(atIdx + 1)
  // query 中不能有空格（有空格说明已经完成了 @ 输入）
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
  setShowLogPanel: (show: boolean) => void
}

export function InputBar({
  status, onlineUsers, self,
  sendText, sendTyping, sendFile, sendVoice,
  replyTarget, setReplyTarget, setLongPressId, setShowLogPanel
}: InputBarProps) {
  const [inputText, setInputText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showPhotoMode, setShowPhotoMode] = useState(false)

  // @ 面板状态
  const [atQuery, setAtQuery] = useState<{ atStart: number; query: string } | null>(null)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const { recording, duration: recDuration, start: startRec, stop: stopRec } = useVoiceRecorder()

  // 发送消息
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

  // 输入框内容变化：同步高度 + 检测 @ 触发
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInputText(val)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
    sendTyping()

    // 检测 @ 触发
    const cursor = e.target.selectionStart ?? val.length
    const parsed = parseAtQuery(val, cursor)
    setAtQuery(parsed)
  }, [sendTyping])

  // 光标移动时也重新检测（用户用方向键移动光标）
  const handleSelect = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const cursor = el.selectionStart ?? el.value.length
    const parsed = parseAtQuery(el.value, cursor)
    setAtQuery(parsed)
  }, [])

  // 键盘事件：Enter 发送（@ 面板打开时由面板自己处理 Enter）
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (atQuery) return  // @ 面板打开时，Enter/Tab/方向键由面板处理
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend, atQuery])

  // 粘贴图片
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

  // 语音按钮
  const handleVoiceBtn = useCallback(async () => {
    if (recording) {
      const result = await stopRec()
      if (result && result.blob.size > 0) sendVoice(result.blob, result.duration)
    } else {
      await startRec()
    }
  }, [recording, startRec, stopRec, sendVoice])

  // 点击 @ 按钮：在光标处插入 @ 并打开面板
  const handleAtBtn = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const cursor = el.selectionStart ?? inputText.length
    const before = inputText.slice(0, cursor)
    const after = inputText.slice(cursor)
    // 如果前面不是空格/行首，先补一个空格
    const prefix = before.length > 0 && !/\s$/.test(before) ? ' ' : ''
    const newText = before + prefix + '@' + after
    const newCursor = cursor + prefix.length + 1
    setInputText(newText)
    setAtQuery({ atStart: cursor + prefix.length, query: '' })
    // 等 DOM 更新后设置光标位置
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(newCursor, newCursor)
    }, 0)
  }, [inputText])

  // 选中 @ 候选项：将 @xxx 替换为 @昵称（加空格）
  const handleMentionSelect = useCallback((candidate: MentionCandidate) => {
    if (!atQuery) return
    const el = inputRef.current
    const cursor = el?.selectionStart ?? inputText.length
    const before = inputText.slice(0, atQuery.atStart)
    const after = inputText.slice(cursor)
    const mention = `@${candidate.name} `
    const newText = before + mention + after
    const newCursor = atQuery.atStart + mention.length
    setInputText(newText)
    setAtQuery(null)
    setTimeout(() => {
      el?.focus()
      el?.setSelectionRange(newCursor, newCursor)
    }, 0)
  }, [atQuery, inputText])

  // 关闭 @ 面板
  const closeAtPanel = useCallback(() => setAtQuery(null), [])

  const statusMap: Record<string, string> = { disconnected: '未连接', connecting: '连接中', ok: '已连接', err: '连接失败' }
  const statusText = statusMap[status] || '未连接'

  return (
    <>
      {/* 表情面板 */}
      {showEmoji && (
        <div className="emoji-panel menu-anim">
          {EMOJIS.map(e => (
            <button key={e} className="emoji-btn"
              onClick={() => { setInputText(t => t + e); setShowEmoji(false); inputRef.current?.focus() }}>
              {e}
            </button>
          ))}
        </div>
      )}

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
              <button className="plus-menu-item" onClick={() => { setShowLogPanel(true); setShowPlusMenu(false) }}>
                <span className="plus-menu-icon">🔍</span>
                <span className="plus-menu-label">日志</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* @ 提及面板 */}
      {atQuery && (
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
          onClick={() => { setShowPlusMenu(s => !s); setShowEmoji(false); setAtQuery(null) }}
          style={{
            background: showPlusMenu ? 'var(--hz-500)' : 'var(--bg-input)',
            color: showPlusMenu ? 'white' : 'var(--text-secondary)',
            transform: showPlusMenu ? 'rotate(45deg)' : 'rotate(0deg)',
            transition: 'background 0.15s, transform 0.2s',
          }}
        >
          +
        </button>

        {/* 表情按钮 */}
        <button
          className="bar-icon-btn"
          onClick={() => { setShowEmoji(s => !s); setShowPlusMenu(false); setAtQuery(null) }}
        >
          😊
        </button>

        {/* @ 按钮 */}
        <button
          className="bar-icon-btn at-btn"
          onClick={handleAtBtn}
          title={`@ 提及 · 召唤 ${AI_NAME}`}
          disabled={status !== 'ok'}
          style={{ opacity: status !== 'ok' ? 0.4 : 1 }}
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
            className="input-hz no-scrollbar"
            style={{ minHeight: 40, maxHeight: 120, padding: '10px 14px', fontSize: 14, lineHeight: '1.4', resize: 'none', overflow: 'hidden' }}
            placeholder={status === 'ok' ? '语言的力量 · 输入 @AI 召唤助手' : statusText}
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
    </>
  )
}
