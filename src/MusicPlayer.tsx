import { useState, useRef, useEffect, useCallback } from 'react'

const PLAYLIST_ID = '17901658544'
const FAB_SIZE = 46
const HIDE_THRESHOLD = 20   // 距边缘多少 px 触发吸附
const PEEK_PX = 14          // 吸附后露出多少 px

interface Pos { x: number; y: number }

export default function MusicPlayer() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [pos, setPos] = useState<Pos>({ x: window.innerWidth - FAB_SIZE - 18, y: window.innerHeight - FAB_SIZE - 88 })
  const [hidden, setHidden] = useState(false)   // 是否吸附到侧边半隐
  const [hideSide, setHideSide] = useState<'left' | 'right'>('right')

  const dragging = useRef(false)
  const moved = useRef(false)           // 区分点击和拖动
  const startPointer = useRef<Pos>({ x: 0, y: 0 })
  const startPos = useRef<Pos>({ x: 0, y: 0 })
  const fabRef = useRef<HTMLButtonElement>(null)

  // 吸附逻辑：松手后自动吸附到最近的左/右边缘
  const snapToEdge = useCallback((x: number, y: number) => {
    const W = window.innerWidth
    const H = window.innerHeight
    const clampedY = Math.max(60, Math.min(H - FAB_SIZE - 10, y))
    const toLeft = x
    const toRight = W - x - FAB_SIZE
    if (toLeft < toRight) {
      setPos({ x: 0, y: clampedY })
      setHideSide('left')
    } else {
      setPos({ x: W - FAB_SIZE, y: clampedY })
      setHideSide('right')
    }
    // 如果距边缘很近，触发半隐
    if (toLeft < HIDE_THRESHOLD || toRight < HIDE_THRESHOLD) {
      setHidden(true)
    } else {
      setHidden(false)
    }
  }, [])

  // 指针按下
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    dragging.current = true
    moved.current = false
    startPointer.current = { x: e.clientX, y: e.clientY }
    startPos.current = { ...pos }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [pos])

  // 指针移动
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - startPointer.current.x
    const dy = e.clientY - startPointer.current.y
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true
    const W = window.innerWidth
    const H = window.innerHeight
    const nx = Math.max(0, Math.min(W - FAB_SIZE, startPos.current.x + dx))
    const ny = Math.max(60, Math.min(H - FAB_SIZE - 10, startPos.current.y + dy))
    setPos({ x: nx, y: ny })
    setHidden(false)   // 拖动时取消半隐
    e.preventDefault()
  }, [])

  // 指针松开
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    if (!moved.current) {
      // 纯点击：若当前半隐，先取消半隐；否则切换播放器
      if (hidden) {
        setHidden(false)
      } else {
        setOpen(o => !o)
      }
    } else {
      // 拖动结束：吸附到边缘
      snapToEdge(pos.x, pos.y)
    }
    e.preventDefault()
  }, [hidden, pos, snapToEdge])

  // 窗口 resize / visualViewport 变化时重新吸附（兼容 iOS 键盘弹起）
  useEffect(() => {
    const onResize = () => {
      const W = window.visualViewport?.width ?? window.innerWidth
      const H = window.visualViewport?.height ?? window.innerHeight
      setPos(p => ({
        x: Math.max(0, Math.min(W - FAB_SIZE, p.x)),
        y: Math.max(60, Math.min(H - FAB_SIZE - 10, p.y))
      }))
    }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('scroll', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('scroll', onResize)
    }
  }, [])

  // 计算 FAB 的实际 translate（半隐时向边缘偏移）
  const fabTranslateX = hidden
    ? hideSide === 'right'
      ? FAB_SIZE - PEEK_PX
      : -(FAB_SIZE - PEEK_PX)
    : 0

  // 播放器卡片的位置：在 FAB 上方，靠近吸附侧
  const cardRight = hideSide === 'right'
    ? window.innerWidth - pos.x - FAB_SIZE + (hidden ? FAB_SIZE - PEEK_PX : 0)
    : undefined
  const cardLeft = hideSide === 'left'
    ? pos.x + FAB_SIZE + 8 + (hidden ? -(FAB_SIZE - PEEK_PX) : 0)
    : undefined
  const cardBottom = window.innerHeight - pos.y + 8

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        ref={fabRef}
        className="music-fab"
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          bottom: 'auto',
          right: 'auto',
          transform: `translateX(${fabTranslateX}px)`,
          transition: dragging.current ? 'none' : 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          cursor: dragging.current ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title={hidden ? '点击展开' : open ? '收起播放器' : '打开音乐播放器'}
        aria-label="音乐播放器"
      >
        {open && !hidden ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            {!hidden && (
              <span className="music-fab-wave" aria-hidden="true">
                <span /><span /><span />
              </span>
            )}
          </>
        )}
        {/* 半隐时显示小箭头提示 */}
        {hidden && (
          <span style={{
            position: 'absolute',
            fontSize: 10,
            opacity: 0.7,
            [hideSide === 'right' ? 'left' : 'right']: 2,
            top: '50%',
            transform: 'translateY(-50%)',
          }}>
            {hideSide === 'right' ? '‹' : '›'}
          </span>
        )}
      </button>

      {/* 播放器卡片 */}
      {open && !hidden && (
        <div
          className="music-card-wrap"
          style={{
            position: 'fixed',
            bottom: cardBottom,
            right: cardRight,
            left: cardLeft,
            top: 'auto',
            zIndex: 39,
          }}
        >
          <div className="music-card">
            <div className="music-card-header">
              <div className="flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
                <span className="text-xs font-semibold" style={{ color: 'var(--hz-800)', letterSpacing: '0.05em' }}>Blog · 歌单</span>
              </div>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>网易云音乐</span>
            </div>
            <div className="music-iframe-wrap">
              {!loaded && (
                <div className="music-loading">
                  <span className="flex gap-1">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                  <span className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>加载中...</span>
                </div>
              )}
              <iframe
                title="网易云音乐播放器"
                frameBorder="no"
                allow="autoplay"
                src={`https://music.163.com/outchain/player?type=0&id=${PLAYLIST_ID}&auto=0&height=430`}
                style={{
                  width: '100%',
                  height: '430px',
                  display: loaded ? 'block' : 'none',
                  borderRadius: '0 0 16px 16px',
                }}
                onLoad={() => setLoaded(true)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
