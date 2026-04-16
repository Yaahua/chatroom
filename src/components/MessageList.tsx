import { useRef, useEffect, useCallback, useState } from 'react'
import type { ChatMessage } from '../types'
import { AI_ID } from '../useAI'

// 语音气泡组件
function VoiceBubble({ url, duration, isSelf }: { url: string; duration?: number; isSelf: boolean }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const resumeTimeRef = useRef(0)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ except: HTMLAudioElement | null }>).detail
      if (audioRef.current && audioRef.current !== detail.except) {
        resumeTimeRef.current = audioRef.current.currentTime
        audioRef.current.pause()
        setPlaying(false)
      }
    }
    window.addEventListener('voice-stop-all', handler)
    return () => window.removeEventListener('voice-stop-all', handler)
  }, [])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
    }
  }, [])

  const toggle = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url)
      audioRef.current.onended = () => { setPlaying(false); resumeTimeRef.current = 0 }
      audioRef.current.onerror = () => { setPlaying(false); resumeTimeRef.current = 0 }
    }
    if (playing) {
      resumeTimeRef.current = audioRef.current.currentTime
      audioRef.current.pause()
      setPlaying(false)
    } else {
      window.dispatchEvent(new CustomEvent('voice-stop-all', { detail: { except: audioRef.current } }))
      audioRef.current.currentTime = resumeTimeRef.current
      audioRef.current.play().catch(() => setPlaying(false))
      setPlaying(true)
    }
  }, [url, playing])

  const fmtDuration = (s: number) => s < 60 ? `${s}"` : `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`

  return (
    <div className={`voice-bubble ${isSelf ? 'bubble-self' : 'bubble-other'}`} onClick={toggle}>
      <div className="voice-play-btn" style={{ background: isSelf ? 'rgba(255,255,255,0.25)' : 'var(--hz-200)' }}>
        <span style={{ fontSize: 14 }}>{playing ? '⏸' : '▶️'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="voice-waves">
          {[3,5,4,6,3,5,4,3,5,6,4,3].map((h, i) => (
            <div key={i} style={{
              width: 2, borderRadius: 2,
              height: playing ? `${h * 3}px` : `${h * 2}px`,
              background: isSelf ? 'rgba(255,255,255,0.7)' : 'var(--hz-500)',
              animation: playing ? `typingBounce ${0.8 + i * 0.07}s infinite` : 'none'
            }} />
          ))}
        </div>
        <span style={{ fontSize: 11, opacity: 0.7 }}>{duration ? fmtDuration(duration) : '语音'}</span>
      </div>
    </div>
  )
}

export { VoiceBubble }

interface MessageListProps {
  messages: ChatMessage[]
  typingUsers: string[]
  longPressId: string | null
  setLongPressId: (id: string | null) => void
  setFocusedMsg: (msg: ChatMessage | null) => void
  setReplyTarget: (target: { id: string; senderName: string; text?: string; type: string } | null) => void
  setImgViewer: (url: string) => void
  /** AI 正在流式输出的消息 ID，用于展示打字动画 */
  aiStreamingId?: string | null
}

export function MessageList({
  messages, typingUsers, longPressId, setLongPressId, setFocusedMsg, setReplyTarget, setImgViewer, aiStreamingId
}: MessageListProps) {
  const msgListRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 自动滚动：只在用户已在底部附近（距底部 120px 内）时才自动滚动
  // 防止用户向上翻阅历史时被强制拉回底部
  useEffect(() => {
    const el = msgListRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 120) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, typingUsers])

  const handleLongPressStart = useCallback((msg: ChatMessage) => {
    longPressTimer.current = setTimeout(() => {
      setLongPressId(msg.id)
      setFocusedMsg(msg)
      if (navigator.vibrate) navigator.vibrate(40)
    }, 500)
  }, [setLongPressId, setFocusedMsg])

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }, [])

  const fmtSize = (n: number) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB'

  return (
    <>
      {longPressId && (
        <div
          className="reply-overlay"
          onClick={() => { setLongPressId(null); setReplyTarget(null) }}
        />
      )}
      <div ref={msgListRef} className="msg-list">
        {messages.map(msg => {
          if (msg.type === 'sys') {
            return <div key={msg.id} className="msg-anim msg-sys">{msg.text}</div>
          }
          if (msg.recalled) {
            return (
              <div key={msg.id} className="msg-anim msg-recalled">
                {msg.text || `${msg.senderName} 撤回了一条消息`}
              </div>
            )
          }
          const isHighlighted = longPressId === msg.id
          // AI 消息不支持长按操作（无法撤回/回复 AI 消息）
          const isAiMsg = msg.senderId === AI_ID
          return (
            <div
              key={msg.id}
              className={`msg-anim ${msg.isSelf ? 'msg-row-self' : 'msg-row-other'}${isHighlighted ? ' msg-highlighted' : ''}`}
              onMouseDown={isAiMsg ? undefined : () => handleLongPressStart(msg)}
              onMouseUp={isAiMsg ? undefined : handleLongPressEnd}
              onMouseLeave={isAiMsg ? undefined : handleLongPressEnd}
              onTouchStart={isAiMsg ? undefined : () => handleLongPressStart(msg)}
              onTouchEnd={isAiMsg ? undefined : handleLongPressEnd}
              onTouchCancel={isAiMsg ? undefined : handleLongPressEnd}
            >
              {!msg.isSelf && (
                <div className="msg-sender-row">
                  {msg.senderId === AI_ID ? (
                    <div className="avatar" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', width: 20, height: 20, fontSize: 10 }}>
                      🤖
                    </div>
                  ) : (
                    <div className="avatar" style={{ background: msg.senderColor, width: 20, height: 20, fontSize: 10 }}>
                      {msg.senderName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 500, color: msg.senderId === AI_ID ? '#6366f1' : 'var(--text-muted)' }}>
                    {msg.senderName}
                  </span>
                </div>
              )}

              {msg.type === 'text' && (
                <div className={`${msg.isSelf ? 'bubble-self' : 'bubble-other'}${msg.senderId === AI_ID ? ' bubble-ai-msg' : ''}${aiStreamingId === msg.id ? ' bubble-streaming' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
                  {msg.replyTo && (
                    <div className="reply-preview">
                      <span className="reply-preview-name">{msg.replyTo.senderName}</span>
                      <span className="reply-preview-text">
                        {msg.replyTo.type === 'text' ? (msg.replyTo.text || '') : `[图片/文件/语音]`}
                      </span>
                    </div>
                  )}
                  {msg.text}
                  {aiStreamingId === msg.id && (
                    <span className="ai-cursor" aria-hidden="true" />
                  )}
                </div>
              )}

              {msg.type === 'image' && msg.fileUrl && (
                <div className={`${msg.isSelf ? 'bubble-self' : 'bubble-other'}`} style={{ padding: 0, overflow: 'hidden' }}>
                  <img
                    src={msg.fileUrl}
                    alt={msg.fileName}
                    style={{ maxWidth: 220, maxHeight: 300, objectFit: 'cover', cursor: 'pointer', display: 'block' }}
                    onClick={() => setImgViewer(msg.fileUrl!)}
                  />
                </div>
              )}

              {msg.type === 'file' && (
                <div className={`file-bubble ${msg.isSelf ? 'bubble-self' : 'bubble-other'}`}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>📄</span>
                  <div className="file-info">
                    <div className="file-name">{msg.fileName}</div>
                    <div className="file-size">{msg.fileSize ? fmtSize(msg.fileSize) : ''}</div>
                  </div>
                  {msg.fileUrl && (
                    <a href={msg.fileUrl} download={msg.fileName}
                      style={{ fontSize: 12, textDecoration: 'underline', opacity: 0.7, flexShrink: 0 }}
                      onClick={e => e.stopPropagation()}>下载</a>
                  )}
                </div>
              )}

              {msg.type === 'voice' && msg.fileUrl && (
                <VoiceBubble url={msg.fileUrl} duration={msg.duration} isSelf={msg.isSelf} />
              )}

              <span className="msg-time">
                {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {msg.isSelf && (
                  <span className={`read-tick${msg.readStatus === 'read' ? ' read-tick-read' : ''}`}>
                    {msg.readStatus === 'read' ? '✓✓' : '✓'}
                  </span>
                )}
              </span>
            </div>
          )
        })}

        {typingUsers.length > 0 && (
          <div className="msg-anim typing-row bubble-other">
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{typingUsers.join('、')} 正在输入</span>
            <span className="typing-dots">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </span>
          </div>
        )}
      </div>
    </>
  )
}
