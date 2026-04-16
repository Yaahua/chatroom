import type { ChatMessage } from '../types'
import { VoiceBubble } from './MessageList'

interface FocusOverlayProps {
  focusedMsg: ChatMessage
  setFocusedMsg: (msg: ChatMessage | null) => void
  setLongPressId: (id: string | null) => void
  setReplyTarget: (target: { id: string; senderName: string; text?: string; type: string } | null) => void
  sendRecall: (id: string) => void
  setImgViewer: (url: string) => void
  showToast: (msg: string) => void
}

export function FocusOverlay({
  focusedMsg, setFocusedMsg, setLongPressId, setReplyTarget, sendRecall, setImgViewer, showToast
}: FocusOverlayProps) {
  const exitFocusMode = () => {
    setFocusedMsg(null)
    setLongPressId(null)
  }

  const fmtSize = (n: number) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB'

  return (
    <div className="focus-overlay" onClick={exitFocusMode}>
      <div className="focus-card" onClick={e => e.stopPropagation()}>
        {!focusedMsg.isSelf && (
          <div className="focus-sender">
            <div className="avatar" style={{ background: focusedMsg.senderColor, width: 28, height: 28, fontSize: 13 }}>
              {focusedMsg.senderName.slice(0, 1).toUpperCase()}
            </div>
            <span className="focus-sender-name">{focusedMsg.senderName}</span>
          </div>
        )}

        {focusedMsg.type === 'text' && (
          <div className={`focus-bubble ${focusedMsg.isSelf ? 'bubble-self' : 'bubble-other'}`}>
            {focusedMsg.replyTo && (
              <div className="reply-preview">
                <span className="reply-preview-name">{focusedMsg.replyTo.senderName}</span>
                <span className="reply-preview-text">{focusedMsg.replyTo.text || '[...]'}</span>
              </div>
            )}
            {focusedMsg.text}
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

        <div className="focus-menu">
          <button
            className="focus-menu-item"
            onClick={() => {
              setReplyTarget({ id: focusedMsg.id, senderName: focusedMsg.senderName, text: focusedMsg.text, type: focusedMsg.type })
              exitFocusMode()
            }}
          >
            <span className="focus-menu-icon">↩</span>
            <span>回复</span>
          </button>

          {focusedMsg.type === 'text' && focusedMsg.text && (
            <button
              className="focus-menu-item"
              onClick={() => {
                navigator.clipboard.writeText(focusedMsg.text!)
                  .then(() => { showToast('已复制'); exitFocusMode() })
                  .catch(() => { showToast('复制失败'); exitFocusMode() })
              }}
            >
              <span className="focus-menu-icon">📋</span>
              <span>复制</span>
            </button>
          )}

          {focusedMsg.isSelf && !focusedMsg.recalled && (
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

          <button className="focus-menu-item focus-menu-item-close" onClick={exitFocusMode}>
            <span className="focus-menu-icon">✕</span>
            <span>关闭</span>
          </button>
        </div>
      </div>
    </div>
  )
}
