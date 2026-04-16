import { useState, useEffect, useRef, useCallback } from 'react'
import type { ChatMessage } from '../types'
import { AI_ID, KIMI_ID } from '../useAI'

// ─── 语音气泡（含播放进度条）─────────────────────────────────────────────────
function VoiceBubble({ url, duration, isSelf }: { url: string; duration?: number; isSelf: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)   // 0~1
  const [elapsed, setElapsed] = useState(0)      // 已播放秒数
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const resumeTimeRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ except: HTMLAudioElement | null }>).detail
      if (audioRef.current && audioRef.current !== detail.except) {
        resumeTimeRef.current = audioRef.current.currentTime
        audioRef.current.pause()
        setPlaying(false)
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
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
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const durationRef = useRef(duration)  // 避免 tick 闭包引用过期的 duration prop
  useEffect(() => { durationRef.current = duration }, [duration])

  const tick = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    const dur = a.duration || durationRef.current || 1
    setElapsed(Math.floor(a.currentTime))
    setProgress(a.currentTime / dur)
    rafRef.current = requestAnimationFrame(tick)
  }, [])  // 不再依赖 duration，通过 ref 读取最新值

  const toggle = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url)
      audioRef.current.onended = () => {
        setPlaying(false)
        setProgress(0)
        setElapsed(0)
        resumeTimeRef.current = 0
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      }
      audioRef.current.onerror = () => {
        setPlaying(false)
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      }
    }
    if (playing) {
      resumeTimeRef.current = audioRef.current.currentTime
      audioRef.current.pause()
      setPlaying(false)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    } else {
      window.dispatchEvent(new CustomEvent('voice-stop-all', { detail: { except: audioRef.current } }))
      audioRef.current.currentTime = resumeTimeRef.current
      audioRef.current.play().catch(() => setPlaying(false))
      setPlaying(true)
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [url, playing, tick])

  const fmtDuration = (s: number) => s < 60 ? `${s}"` : `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`
  const totalSec = duration ?? 0
  const displayTime = playing ? fmtDuration(elapsed) : (totalSec ? fmtDuration(totalSec) : '语音')

  return (
    <div className={`voice-bubble ${isSelf ? 'bubble-self' : 'bubble-other'}`} onClick={toggle}>
      <div className="voice-play-btn" style={{ background: isSelf ? 'rgba(255,255,255,0.25)' : 'var(--hz-200)' }}>
        <span style={{ fontSize: 14 }}>{playing ? '⏸' : '▶️'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 80 }}>
        {/* 进度条 */}
        <div style={{
          height: 3, borderRadius: 2,
          background: isSelf ? 'rgba(255,255,255,0.25)' : 'var(--hz-300)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${progress * 100}%`,
            background: isSelf ? 'rgba(255,255,255,0.85)' : 'var(--hz-600)',
            transition: 'width 0.1s linear',
          }} />
        </div>
        {/* 波形 + 时间 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
          <span style={{ fontSize: 11, opacity: 0.7 }}>{displayTime}</span>
        </div>
      </div>
    </div>
  )
}

export { VoiceBubble }

// ─── AI 思考动画（三个跳动的点）──────────────────────────────────────────
function AiThinkingDots() {
  return (
    <span className="ai-thinking-dots" aria-label="AI 思考中">
      <span className="ai-dot" />
      <span className="ai-dot" />
      <span className="ai-dot" />
    </span>
  )
}

// ─── 思考过程可折叠块 ──────────────────────────────────────────
function ReasoningBlock({ reasoning, streaming }: { reasoning: string; streaming: boolean }) {
  // 始终默认折叠，点击整个卡片即可展开/折叠
  const [expanded, setExpanded] = useState(false)

  // 监听长按事件，自动收起
  useEffect(() => {
    const handler = () => setExpanded(false)
    window.addEventListener('reasoning-collapse-all', handler)
    return () => window.removeEventListener('reasoning-collapse-all', handler)
  }, [])

  return (
    <div
      className="reasoning-block"
      onClick={() => setExpanded(e => !e)}
      style={{ cursor: 'pointer' }}
    >
      <div className="reasoning-toggle">
        <span className="reasoning-icon">💡</span>
        <span className="reasoning-label">{streaming ? '思考中…' : '思考过程'}</span>
        <span className="reasoning-chevron">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div className="reasoning-content">
          {reasoning}
          {streaming && <span className="ai-cursor" aria-hidden="true" />}
        </div>
      )}
    </div>
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
  aiState?: { id: string; phase: 'thinking' | 'streaming' } | null
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
        <span key={i} className={isSelf ? 'mention-self' : 'mention-other'}>{part}</span>
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
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)

  // ── 智能滚动：用户主动上翻时暂停自动跟随，回到底部后恢复 ──────────────────
  const userScrolledUpRef = useRef(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const handleScroll = useCallback(() => {
    const el = msgListRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    if (dist > 160) {
      userScrolledUpRef.current = true
      setShowScrollBtn(true)
    } else {
      userScrolledUpRef.current = false
      setShowScrollBtn(false)
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = msgListRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    // 延迟重置，等平滑滚动完成后再清除标志，避免新消息到来时闪烁跳回底部
    setTimeout(() => {
      userScrolledUpRef.current = false
      setShowScrollBtn(false)
    }, 400)
  }, [])

  useEffect(() => {
    const el = msgListRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // 自动滚动：仅在用户未主动上翻时跟随
  useEffect(() => {
    const el = msgListRef.current
    if (!el) return
    if (!userScrolledUpRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, typingUsers, aiState])

  // 监听页面可见性变化，取消长按
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

  const handleLongPressStart = useCallback((msg: ChatMessage, e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      if (e.touches.length > 1) return
    } else {
      // 框架端：记录鼠标按下位置，用于移动取消判断
      touchStartPos.current = { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY }
    }
    longPressTimer.current = setTimeout(() => {
      setLongPressId(msg.id)
      setFocusedMsg(msg)
      if (navigator.vibrate) navigator.vibrate(40)
      // 长按弹出操作菜单时，自动收起所有思考过程卡片
      window.dispatchEvent(new Event('reasoning-collapse-all'))
    }, 500)
  }, [setLongPressId, setFocusedMsg])

  const handleLongPressMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!longPressTimer.current || !touchStartPos.current) return
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY
    const dx = clientX - touchStartPos.current.x
    const dy = clientY - touchStartPos.current.y
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
          const isAiMsg = msg.senderId === AI_ID || msg.senderId === KIMI_ID
          const isThisAiThinking = isAiMsg && aiState?.id === msg.id && aiState.phase === 'thinking'
          const isThisAiStreaming = isAiMsg && aiState?.id === msg.id && aiState.phase === 'streaming'
          const hasReasoning = !!(msg.reasoning)

          return (
            <div
              key={msg.id}
              className={`msg-anim msg-row-wrap ${msg.isSelf ? 'msg-row-self' : 'msg-row-other'}${isHighlighted ? ' msg-highlighted' : ''}`}
              onMouseDown={(e) => handleLongPressStart(msg, e)}
              onMouseMove={(e) => handleLongPressMove(e)}
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
                  <span style={{ fontSize: 12, fontWeight: 500, color: isAiMsg ? (msg.senderId === KIMI_ID ? '#0ea5e9' : '#6366f1') : 'var(--text-muted)' }}>
                    {msg.senderName}
                  </span>
                  {isThisAiThinking && <span className="ai-status-badge ai-status-thinking">思考中</span>}
                  {isThisAiStreaming && <span className="ai-status-badge ai-status-streaming">回复中</span>}
                </div>
              )}

              {/* 消息内容 + 桌面端悬停快捷操作 */}
              <div className="msg-content-wrap">
                {/* 桌面端悬停快捷操作（仅非 AI 消息、非系统消息显示） */}
                {!isAiMsg && (
                  <div className={`msg-hover-actions ${msg.isSelf ? 'msg-hover-actions-self' : 'msg-hover-actions-other'}`}>
                    <button
                      className="msg-hover-btn"
                      title="回复"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation()
                        setReplyTarget({ id: msg.id, senderName: msg.senderName, text: msg.text, type: msg.type })
                      }}
                    >↩</button>
                    {msg.type === 'text' && msg.text && (
                      <button
                        className="msg-hover-btn"
                        title="复制"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          navigator.clipboard.writeText(msg.text!).catch(() => {})
                        }}
                      >⎘</button>
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
                    {isThisAiThinking ? (
                      <AiThinkingDots />
                    ) : (
                      <>
                        {hasReasoning && (
                          <ReasoningBlock reasoning={msg.reasoning!} streaming={isThisAiStreaming && !msg.text} />
                        )}
                        {hasReasoning && msg.text && <div className="reasoning-divider" />}
                        {msg.text ? renderTextWithMentions(msg.text, selfName) : null}
                        {isThisAiStreaming && msg.text && <span className="ai-cursor" aria-hidden="true" />}
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
              </div>

              {/* 时间戳 + 已读状态 */}
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

      {/* 回到底部按钮（用户上翻时出现） */}
      {showScrollBtn && (
        <button className="scroll-to-bottom-btn" onClick={scrollToBottom} title="回到最新消息">
          ↓
        </button>
      )}
    </>
  )
}
