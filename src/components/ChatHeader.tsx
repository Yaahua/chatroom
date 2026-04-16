import { useState, useEffect, useRef } from 'react'
import type { User, OnlineUser } from '../types'

interface ChatHeaderProps {
  roomCode: string | null
  status: string
  unread: number
  mentionCount: number
  onlineUsers: OnlineUser[]
  user: User
  muted: boolean
  darkMode: boolean
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>
  toggleMute: () => void
  setShowOnlineModal: (show: boolean) => void
  setShowLogPanel: (show: boolean) => void
  setShowExitModal: (show: boolean) => void
  manualReconnect: () => void
  exportMessages: () => void
  showToast: (msg: string) => void
}

export function ChatHeader({
  roomCode, status, unread, mentionCount, onlineUsers, user, muted, darkMode, setDarkMode,
  toggleMute, setShowOnlineModal, setShowLogPanel, setShowExitModal,
  manualReconnect, exportMessages, showToast
}: ChatHeaderProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMoreMenu) { setShowAdvanced(false); return }
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMoreMenu])

  const copyRoomCode = () => {
    if (!roomCode) return
    navigator.clipboard.writeText(roomCode)
      .then(() => showToast(`房间码 ${roomCode} 已复制`))
      .catch(() => prompt('复制房间码：', roomCode))
  }

  const isDisconnected = status === 'disconnected' || status === 'err'
  const statusMap: Record<string, string> = { disconnected: 'status-disc', connecting: 'status-conn', ok: 'status-ok', err: 'status-err' }
  const statusDotClass = statusMap[status] || 'status-disc'

  return (
    <header className="chat-header">
      {/* 房间码 + 连接状态 */}
      <button className="header-room-btn" onClick={copyRoomCode} title="点击复制房间码">
        <span className={`status-dot ${statusDotClass}`} />
        {roomCode}
        <span className="header-copy-icon" aria-hidden="true">⎘</span>
        {mentionCount > 0 && <span className="mention-badge">@{mentionCount}</span>}
        {unread > 0 && !mentionCount && <span className="unread-badge">{unread}</span>}
      </button>

      {/* 在线成员头像堆叠 */}
      <button className="header-users-btn" onClick={() => setShowOnlineModal(true)} title="查看在线成员">
        <div className="header-avatars">
          {[user, ...onlineUsers.filter(u => u.id !== user.id)].slice(0, 5).map(u => (
            <div key={u.id} className="avatar" style={{ background: u.color, border: '2px solid var(--bg-primary)' }}>
              {u.name.slice(0, 1).toUpperCase()}
            </div>
          ))}
        </div>
        <span style={{ fontSize: 12, marginLeft: 4, color: 'var(--text-muted)' }}>
          {1 + onlineUsers.filter(u => u.id !== user.id).length}人
        </span>
      </button>

      {/* 工具栏 */}
      <div className="header-tools">
        {/* 断线时显示重连按钮 */}
        {isDisconnected && (
          <button className="icon-btn reconnect-btn" onClick={manualReconnect} title="连接已断开，点击重连">
            ↻
          </button>
        )}
        <button className="icon-btn" onClick={toggleMute} title={muted ? '开启音效' : '关闭音效'}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="icon-btn" onClick={() => setDarkMode(d => !d)} title={darkMode ? '切换亮色模式' : '切换暗色模式'}>
          {darkMode ? '☀️' : '🌙'}
        </button>

        {/* 更多菜单 */}
        <div className="more-menu-wrap" ref={moreMenuRef}>
          <button
            className={`icon-btn more-btn${showMoreMenu ? ' more-btn-active' : ''}`}
            onClick={() => setShowMoreMenu(s => !s)}
            title="更多选项"
          >
            ⋯
          </button>
          {showMoreMenu && (
            <div className="more-menu menu-anim">
              {/* 普通用户常用操作 */}
              <button className="more-menu-item" onClick={() => { exportMessages(); setShowMoreMenu(false) }}>
                <span className="more-menu-icon">📥</span>
                <span>导出记录</span>
              </button>

              {/* 高级 / 开发者选项（折叠） */}
              <button
                className="more-menu-item more-menu-advanced-toggle"
                onClick={() => setShowAdvanced(s => !s)}
              >
                <span className="more-menu-icon">{showAdvanced ? '▲' : '▼'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>高级选项</span>
              </button>
              {showAdvanced && (
                <>
                  <button className="more-menu-item" onClick={() => { setShowLogPanel(true); setShowMoreMenu(false) }}>
                    <span className="more-menu-icon">🔍</span>
                    <span>调试日志</span>
                  </button>
                  <button className="more-menu-item" onClick={() => { manualReconnect(); setShowMoreMenu(false) }}>
                    <span className="more-menu-icon">↻</span>
                    <span>手动重连</span>
                  </button>
                </>
              )}

              <div className="more-menu-divider" />
              <button className="more-menu-item more-menu-exit" onClick={() => { setShowExitModal(true); setShowMoreMenu(false) }}>
                <span className="more-menu-icon">🚪</span>
                <span>退出房间</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
