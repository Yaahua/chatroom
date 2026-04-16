import { useEffect, useRef, useState, useCallback } from 'react'
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

// ─── 图片查看器：支持双指缩放 + 拖拽 ─────────────────────────────────────────
function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const lastTouchDist = useRef<number | null>(null)
  const lastOffset = useRef({ x: 0, y: 0 })
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const isPinching = useRef(false)

  const clampScale = (s: number) => Math.min(Math.max(s, 0.5), 5)

  // 双击还原
  const handleDoubleClick = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  // 双指缩放
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isPinching.current = true
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastTouchDist.current = Math.sqrt(dx * dx + dy * dy)
      lastOffset.current = offset
    } else if (e.touches.length === 1) {
      dragStart.current = { x: e.touches[0].clientX - offset.x, y: e.touches[0].clientY - offset.y }
    }
  }, [offset])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation()
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const ratio = dist / lastTouchDist.current
      setScale(s => clampScale(s * ratio))
      lastTouchDist.current = dist
    } else if (e.touches.length === 1 && dragStart.current && !isPinching.current) {
      setOffset({
        x: e.touches[0].clientX - dragStart.current.x,
        y: e.touches[0].clientY - dragStart.current.y,
      })
    }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      lastTouchDist.current = null
      isPinching.current = false
    }
    if (e.touches.length === 0) dragStart.current = null
  }, [])

  // 鼠标滚轮缩放（桌面端）
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale(s => clampScale(s * delta))
  }, [])

  return (
    <div
      className="img-viewer"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onDoubleClick={handleDoubleClick}
      onWheel={handleWheel}
    >
      <img
        src={src}
        alt="预览"
        draggable={false}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: isPinching.current ? 'none' : 'transform 0.05s',
          cursor: scale > 1 ? 'grab' : 'default',
          userSelect: 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      <button className="img-viewer-close" onClick={onClose}>✕</button>
      {scale !== 1 && (
        <div className="img-viewer-hint">双击还原 · 滚轮/双指缩放</div>
      )}
    </div>
  )
}

export function Modals({
  showOnlineModal, setShowOnlineModal, onlineUsers, user,
  showLogPanel, setShowLogPanel, logs, clearLogs,
  showExitModal, setShowExitModal, doExit,
  imgViewer, setImgViewer
}: ModalsProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showLogPanel) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [logs, showLogPanel])

  // ── 全局 Esc 键关闭弹窗 ──────────────────────────────────────────────────────
  useEffect(() => {
    const anyOpen = imgViewer || showExitModal || showOnlineModal || showLogPanel
    if (!anyOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (imgViewer) { setImgViewer(null); return }
      if (showExitModal) { setShowExitModal(false); return }
      if (showOnlineModal) { setShowOnlineModal(false); return }
      if (showLogPanel) { setShowLogPanel(false); return }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [imgViewer, showExitModal, showOnlineModal, showLogPanel,
    setImgViewer, setShowExitModal, setShowOnlineModal, setShowLogPanel])

  return (
    <>
      {imgViewer && <ImageViewer src={imgViewer} onClose={() => setImgViewer(null)} />}

      {showOnlineModal && (
        <div className="modal-overlay" onClick={() => setShowOnlineModal(false)}>
          <div className="modal-box modal-anim" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>在线成员 · {1 + onlineUsers.filter(u => u.id !== user.id).length} 人</span>
              <button onClick={() => setShowOnlineModal(false)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
            </div>
            <div className="modal-body">
              {[{ id: user.id, name: user.name, color: user.color }, ...onlineUsers.filter(u => u.id !== user.id)].map(u => (
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
