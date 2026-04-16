import type { ChatMessage } from '../types'
import { useState } from 'react'
import { VoiceBubble } from './MessageList'
import { AI_ID, KIMI_ID } from '../useAI'

interface FocusOverlayProps {
  focusedMsg: ChatMessage
  setFocusedMsg: (msg: ChatMessage | null) => void
  setLongPressId: (id: string | null) => void
  setReplyTarget: (target: { id: string; senderName: string; text?: string; type: string } | null) => void
  sendRecall: (id: string) => void
  setImgViewer: (url: string) => void
  showToast: (msg: string) => void
  /** 当前用户昵称，用于 @ 高亮 */
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

// 思考过程折叠块（FocusOverlay 专用，默认折叠）
function FocusReasoningBlock({ reasoning }: { reasoning: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div
      style={{
        marginBottom: 6, borderRadius: 6,
        background: 'rgba(14,165,233,0.07)',
        border: '1px solid rgba(14,165,233,0.15)',
        fontSize: 12, cursor: 'pointer', overflow: 'hidden',
      }}
      onClick={() => setExpanded(e => !e)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', color: '#0ea5e9', fontWeight: 500, fontSize: 11 }}>
        <span>💡</span>
        <span style={{ flex: 1 }}>思考过程</span>
        <span style={{ fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (
        <div style={{ padding: '0 8px 6px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {reasoning}
        </div>
      )}
    </div>
  )
}

export function FocusOverlay({
  focusedMsg, setFocusedMsg, setLongPressId, setReplyTarget, sendRecall, setImgViewer, showToast, selfName
}: FocusOverlayProps) {
  const exitFocusMode = () => {
    setFocusedMsg(null)
    setLongPressId(null)
  }

  const fmtSize = (n: number) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB'

  // B1 修复：同时识别 DeepSeek 和 Kimi
  const isAiMsg = focusedMsg.senderId === AI_ID || focusedMsg.senderId === KIMI_ID
  const isKimiMsg = focusedMsg.senderId === KIMI_ID

  // 可复制的文本内容（文本消息且有内容）
  const copyableText = focusedMsg.type === 'text' && focusedMsg.text ? focusedMsg.text : null

  // 撤回条件：自己发送的、未撤回的消息（AI 消息是本地生成的，senderId 为 AI_ID，isSelf 为 false，不可撤回）
  const canRecall = focusedMsg.isSelf && !focusedMsg.recalled

  return (
    <div className="focus-overlay" onClick={exitFocusMode}>
      <div className="focus-card" onClick={e => e.stopPropagation()}>

        {/* 发送者信息（他人消息和 AI 消息都显示） */}
        {!focusedMsg.isSelf && (
          <div className="focus-sender">
            {isAiMsg ? (
              <div className="avatar ai-avatar" style={{ width: 28, height: 28, fontSize: 16 }}>🤖</div>
            ) : (
              <div className="avatar" style={{ background: focusedMsg.senderColor, width: 28, height: 28, fontSize: 13 }}>
                {focusedMsg.senderName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <span
              className="focus-sender-name"
              style={isAiMsg ? { color: isKimiMsg ? '#0ea5e9' : '#6366f1', fontWeight: 600 } : undefined}
            >
              {focusedMsg.senderName}
            </span>
          </div>
        )}

        {/* 消息内容 */}
        {focusedMsg.type === 'text' && (
          <div className={`focus-bubble ${focusedMsg.isSelf ? 'bubble-self' : isAiMsg ? 'bubble-other bubble-ai-msg' : 'bubble-other'}`}>
            {focusedMsg.replyTo && (
              <div className="reply-preview">
                <span className="reply-preview-name">{focusedMsg.replyTo.senderName}</span>
                <span className="reply-preview-text">
                  {focusedMsg.replyTo.type === 'text' ? (focusedMsg.replyTo.text || '') : '[图片/文件/语音]'}
                </span>
              </div>
            )}
            {/* B3 修复：渲染思考过程，默认折叠 */}
            {focusedMsg.reasoning && <FocusReasoningBlock reasoning={focusedMsg.reasoning} />}
            {focusedMsg.reasoning && focusedMsg.text && (
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0', opacity: 0.5 }} />
            )}
            {/* B4 修复： @ 高亮渲染 */}
            {focusedMsg.text ? renderTextWithMentions(focusedMsg.text, selfName) : null}
          </div>
        )}
        {focusedMsg.type === 'image' && focusedMsg.fileUrl && (
          <img
            src={focusedMsg.fileUrl}
            alt={focusedMsg.fileName}
            className="focus-image"
            onClick={() => { setImgViewer(focusedMsg.fileUrl!); exitFocusMode() }}
          />
        )}
        {focusedMsg.type === 'voice' && focusedMsg.fileUrl && (
          <VoiceBubble url={focusedMsg.fileUrl} duration={focusedMsg.duration} isSelf={focusedMsg.isSelf} />
        )}
        {focusedMsg.type === 'file' && (
          <div className={`file-bubble ${focusedMsg.isSelf ? 'bubble-self' : 'bubble-other'}`}>
            <span style={{ fontSize: 24 }}>📄</span>
            <div className="file-info">
              <div className="file-name">{focusedMsg.fileName}</div>
              <div className="file-size">{focusedMsg.fileSize ? fmtSize(focusedMsg.fileSize) : ''}</div>
            </div>
          </div>
        )}

        <span className="focus-time">
          {new Date(focusedMsg.ts).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </span>

        {/* 操作菜单：所有消息都有回复/复制/关闭，撤回仅限自己 */}
        <div className="focus-menu">

          {/* 回复：所有消息都可以回复 */}
          <button
            className="focus-menu-item"
            onClick={() => {
              setReplyTarget({
                id: focusedMsg.id,
                senderName: focusedMsg.senderName,
                text: focusedMsg.text,
                type: focusedMsg.type,
              })
              exitFocusMode()
            }}
          >
            <span className="focus-menu-icon">↩</span>
            <span>回复</span>
          </button>

          {/* 复制：有文本内容的消息都可以复制 */}
          {copyableText && (
            <button
              className="focus-menu-item"
              onClick={() => {
                navigator.clipboard.writeText(copyableText)
                  .then(() => { showToast('已复制'); exitFocusMode() })
                  .catch(() => { showToast('复制失败'); exitFocusMode() })
              }}
            >
              <span className="focus-menu-icon">📋</span>
              <span>复制</span>
            </button>
          )}

          {/* 撤回：仅自己发送的、未撤回的消息 */}
          {canRecall && (
            <button
              className="focus-menu-item focus-menu-item-danger"
              onClick={() => {
                sendRecall(focusedMsg.id)
                exitFocusMode()
              }}
            >
              <span className="focus-menu-icon">↺</span>
              <span>撤回</span>
            </button>
          )}

          {/* 关闭：所有消息都有 */}
          <button className="focus-menu-item focus-menu-item-close" onClick={exitFocusMode}>
            <span className="focus-menu-icon">✕</span>
            <span>关闭</span>
          </button>
        </div>
      </div>
    </div>
  )
}
