import { useState, useRef, useCallback } from 'react'

const EMOJIS = ['😀','😂','🥰','😎','🤔','😅','🙏','👍','👎','❤️','🔥','✨','🎉','💯','😭','🤣','😊','😍','🥺','😤','💪','🤝','👏','🎊','🌟','🍵','🌸','🍂','🌙','⭐']

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

interface InputBarProps {
  status: string
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
  status, sendText, sendTyping, sendFile, sendVoice, replyTarget, setReplyTarget, setLongPressId, setShowLogPanel
}: InputBarProps) {
  const [inputText, setInputText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showPhotoMode, setShowPhotoMode] = useState(false)

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const { recording, duration: recDuration, start: startRec, stop: stopRec } = useVoiceRecorder()

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text || status !== 'ok') return
    sendText(text, replyTarget ?? undefined)
    setInputText('')
    setReplyTarget(null)
    setLongPressId(null)
    if (inputRef.current) { inputRef.current.style.height = 'auto' }
  }, [inputText, status, sendText, replyTarget, setReplyTarget, setLongPressId])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
    sendTyping()
  }, [sendTyping])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

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

  const handleVoiceBtn = useCallback(async () => {
    if (recording) {
      const result = await stopRec()
      if (result && result.blob.size > 0) sendVoice(result.blob, result.duration)
    } else {
      await startRec()
    }
  }, [recording, startRec, stopRec, sendVoice])

  const statusMap: Record<string, string> = { disconnected: '未连接', connecting: '连接中', ok: '已连接', err: '连接失败' }
  const statusText = statusMap[status] || '未连接'

  return (
    <>
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

      <div className="input-bar">
        <button
          className="bar-icon-btn"
          onClick={() => { setShowPlusMenu(s => !s); setShowEmoji(false) }}
          style={{
            background: showPlusMenu ? 'var(--hz-500)' : 'var(--bg-input)',
            color: showPlusMenu ? 'white' : 'var(--text-secondary)',
            transform: showPlusMenu ? 'rotate(45deg)' : 'rotate(0deg)',
            transition: 'background 0.15s, transform 0.2s',
          }}
        >
          +
        </button>

        <button
          className="bar-icon-btn"
          onClick={() => { setShowEmoji(s => !s); setShowPlusMenu(false) }}
        >
          😊
        </button>

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
            placeholder={status === 'ok' ? '语言的力量' : statusText}
            disabled={status !== 'ok'}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
          />
        )}

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

      <input ref={imgInputRef} type="file" style={{ display: 'none' }} accept="image/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />
      <input ref={cameraInputRef} type="file" style={{ display: 'none' }} accept="image/*" capture="environment"
        onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept="*/*"
        onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />
    </>
  )
}
