import { useEffect, useRef } from 'react'
import type { User, OnlineUser } from '../types'

interface ModalsProps {
  showOnlineModal: boolean
  setShowOnlineModal: (show: boolean) => void
  onlineUsers: OnlineUser[]
  user: User
  showLogPanel: boolean
  setShowLogPanel: (show: boolean) => void
  logs: { id: string; level: string; msg: string; ts: number }[]
  clearLogs: () => void
  showExitModal: boolean
  setShowExitModal: (show: boolean) => void
  doExit: () => void
  imgViewer: string | null
  setImgViewer: (url: string | null) => void
}

export function Modals({
  showOnlineModal, setShowOnlineModal, onlineUsers, user,
  showLogPanel, setShowLogPanel, logs, clearLogs,
  showExitModal, setShowExitModal, doExit,
  imgViewer, setImgViewer
}: ModalsProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView() }, [logs])

  return (
    <>
      {imgViewer && (
        <div className="img-viewer" onClick={() => setImgViewer(null)}>
          <img src={imgViewer} alt="预览" />
          <button className="img-viewer-close">✕</button>
        </div>
      )}

      {showOnlineModal && (
        <div className="modal-overlay" onClick={() => setShowOnlineModal(false)}>
          <div className="modal-box modal-anim" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>在线成员 · {1 + onlineUsers.length} 人</span>
              <button onClick={() => setShowOnlineModal(false)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
            </div>
            <div className="modal-body">
              {[{ id: user.id, name: user.name, color: user.color }, ...onlineUsers].map(u => (
                <div key={u.id} className="modal-user-row">
                  <div className="avatar" style={{ background: u.color, width: 32, height: 32, fontSize: 13 }}>
                    {u.name.slice(0, 1).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{u.name}</span>
                  {u.id === user.id && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--hz-200)', color: 'var(--hz-800)' }}>我</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showLogPanel && (
        <div className="log-modal-overlay" onClick={() => setShowLogPanel(false)}>
          <div className="log-modal modal-anim" onClick={e => e.stopPropagation()}>
            <div className="log-modal-header">
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>调试日志 · {logs.length} 条</span>
              <div className="log-modal-btns">
                <button onClick={clearLogs} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 8, background: 'var(--hz-500)', color: 'white', border: 'none', cursor: 'pointer' }}>清空</button>
                <button onClick={() => setShowLogPanel(false)} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>关闭</button>
              </div>
            </div>
            <div className="log-modal-body log-panel">
              {logs.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无日志</span>}
              {logs.map(l => (
                <div key={l.id} className="log-row">
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(l.ts).toLocaleTimeString()}</span>
                  <span className={`log-${l.level}`}>[{l.level.toUpperCase()}]</span>
                  <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{l.msg}</span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>
        </div>
      )}

      {showExitModal && (
        <div className="modal-overlay" onClick={() => setShowExitModal(false)}>
          <div className="modal-box modal-anim exit-modal" onClick={e => e.stopPropagation()}>
            <div className="exit-modal-icon">🚶</div>
            <div className="exit-modal-title">退出房间</div>
            <div className="exit-modal-body">确定要离开当前房间吗？</div>
            <div className="exit-modal-btns">
              <button className="exit-modal-btn exit-modal-btn-cancel" onClick={() => setShowExitModal(false)}>留下</button>
              <button className="exit-modal-btn exit-modal-btn-confirm" onClick={doExit}>退出</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
