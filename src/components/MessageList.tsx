import { useRef, useEffect, useCallback, useState } from 'react'
import type { ChatMessage } from '../types'
import { AI_ID } from '../useAI'

// ─── 语音气泡 ─────────────────────────────────────────────────────────────────
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

// ─── AI 思考动画（三个跳动的点）────────────────────────────────────────────────
function AiThinkingDots() {
  return (
    <span className="ai-thinking-dots" aria-label="AI 思考中">
      <span className="ai-dot" />
      <span className="ai-dot" />
      <span className="ai-dot" />
    </span>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface MessageListProps {
  messages: ChatMessage[]
  typingUsers: string[]
  longPressId: string | null
  setLongPressId: (id: string | null) => void
  setFocusedMsg: (msg: ChatMessage | null) => void
  setReplyTarget: (target: { id: string; senderName: string; text?: string; type: string } | null) => void
  setImgViewer: (url: string) => void
  /** AI 当前状态：null=空闲，thinking=等待首个chunk，streaming=流式输出中 */
  aiState?: { id: string; phase: 'thinking' | 'streaming' } | null
  /** 当前用户昵称，用于判断消息是否 @ 了自己 */
  selfName?: string
}

// 将消息文本中的 @昵称 渲染为高亮 span
function renderTextWithMentions(text: string, selfName?: string): React.ReactNode {
  const parts = text.split(/(@[^\s@]+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const name = part.slice(1)
      const isSelf = selfName && name === selfName
      return (
        <span key={i} className={isSelf ? 'mention-self' : 'mention-other'}>
          {part}
        </span>
      )
    }
    return part
  })
}

export function MessageList({
  messages, typingUsers, longPressId, setLongPressId, setFocusedMsg, setReplyTarget, setImgViewer, aiState, selfName
}: MessageListProps) {
  const msgListRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 记录触摸起始坐标，用于连动阈值检测（防止截图误触）
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)

  // 监听页面可见性变化（截图后系统 UI 弹出时页面会短暂失焦），取消长按
  useEffect(() => {
    const cancelOnHide = () => {
      if (document.hidden && longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
    }
    document.addEventListener('visibilitychange', cancelOnHide)
    return () => document.removeEventListener('visibilitychange', cancelOnHide)
  }, [])

  // 自动滚动：只在用户已在底部附近（距底部 120px 内）时才自动滚动
  useEffect(() => {
    const el = msgListRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 120) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, typingUsers, aiState])

  const handleLongPressStart = useCallback((msg: ChatMessage, e: React.TouchEvent | React.MouseEvent) => {
    // 记录起始坐标
    if ('touches' in e && e.touches.length > 0) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      // 多点触控（如双指）直接不触发长按（某些设备截图会产生双指事件）
      if (e.touches.length > 1) return
    } else {
      touchStartPos.current = null
    }
    longPressTimer.current = setTimeout(() => {
      setLongPressId(msg.id)
      setFocusedMsg(msg)
      if (navigator.vibrate) navigator.vibrate(40)
    }, 500)
  }, [setLongPressId, setFocusedMsg])

  const handleLongPressMove = useCallback((e: React.TouchEvent) => {
    if (!longPressTimer.current || !touchStartPos.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartPos.current.x
    const dy = touch.clientY - touchStartPos.current.y
    // 移动超过 8px 即取消长按（截图时手指通常有轻微移动）
    if (Math.sqrt(dx * dx + dy * dy) > 8) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
    touchStartPos.current = null
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
            return (
              <div key={msg.id} className="msg-anim msg-sys">
                <span className="msg-sys-line" />
                <span className="msg-sys-text">{msg.text}</span>
                <span className="msg-sys-line" />
              </div>
            )
          }
          if (msg.recalled) {
            return (
              <div key={msg.id} className="msg-anim msg-recalled">
                {msg.text || `${msg.senderName} 撤回了一条消息`}
              </div>
            )
          }

          const isHighlighted = longPressId === msg.id
          const isMentionedMe = !!(selfName && msg.mentions && msg.mentions.includes(selfName) && !msg.isSelf)
          const isAiMsg = msg.senderId === AI_ID
          const isThisAiThinking = isAiMsg && aiState?.id === msg.id && aiState.phase === 'thinking'
          const isThisAiStreaming = isAiMsg && aiState?.id === msg.id && aiState.phase === 'streaming'

          return (
            <div
              key={msg.id}
              className={`msg-anim ${msg.isSelf ? 'msg-row-self' : 'msg-row-other'}${isHighlighted ? ' msg-highlighted' : ''}`}
              onMouseDown={(e) => handleLongPressStart(msg, e)}
              onMouseUp={handleLongPressEnd}
              onMouseLeave={handleLongPressEnd}
              onTouchStart={(e) => handleLongPressStart(msg, e)}
              onTouchMove={handleLongPressMove}
              onTouchEnd={handleLongPressEnd}
              onTouchCancel={handleLongPressEnd}
            >
              {/* 发送者信息行（仅他人消息显示） */}
              {!msg.isSelf && (
                <div className="msg-sender-row">
                  {isAiMsg ? (
                    <div className="avatar ai-avatar">🤖</div>
                  ) : (
                    <div className="avatar" style={{ background: msg.senderColor, width: 20, height: 20, fontSize: 10 }}>
                      {msg.senderName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 500, color: isAiMsg ? '#6366f1' : 'var(--text-muted)' }}>
                    {msg.senderName}
                  </span>
                  {/* AI 正在思考时在名字旁显示状态标签 */}
                  {isThisAiThinking && (
                    <span className="ai-status-badge ai-status-thinking">思考中</span>
                  )}
                  {isThisAiStreaming && (
                    <span className="ai-status-badge ai-status-streaming">回复中</span>
                  )}
                </div>
              )}

              {/* 文本气泡 */}
              {msg.type === 'text' && (
                <div
                  className={[
                    msg.isSelf ? 'bubble-self' : 'bubble-other',
                    isAiMsg ? 'bubble-ai-msg' : '',
                    isThisAiStreaming ? 'bubble-streaming' : '',
                    isMentionedMe ? 'bubble-mentioned' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {msg.replyTo && (
                    <div className="reply-preview">
                      <span className="reply-preview-name">{msg.replyTo.senderName}</span>
                      <span className="reply-preview-text">
                        {msg.replyTo.type === 'text' ? (msg.replyTo.text || '') : `[图片/文件/语音]`}
                      </span>
                    </div>
                  )}

                  {/* 思考中：显示跳动点动画 */}
                  {isThisAiThinking ? (
                    <AiThinkingDots />
                  ) : (
                    <>
                      {msg.text ? renderTextWithMentions(msg.text, selfName) : null}
                      {/* 流式输出中：末尾显示光标 */}
                      {isThisAiStreaming && (
                        <span className="ai-cursor" aria-hidden="true" />
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 图片 */}
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

              {/* 文件 */}
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

              {/* 语音 */}
              {msg.type === 'voice' && msg.fileUrl && (
                <VoiceBubble url={msg.fileUrl} duration={msg.duration} isSelf={msg.isSelf} />
              )}

              {/* 时间戳 + 已读状态（AI 思考中时不显示时间，避免视觉干扰） */}
              {!isThisAiThinking && (
                <span className="msg-time">
                  {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {msg.isSelf && (
                    <span className={`read-tick${msg.readStatus === 'read' ? ' read-tick-read' : ''}`}>
                      {msg.readStatus === 'read' ? '✓✓' : '✓'}
                    </span>
                  )}
                </span>
              )}
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
