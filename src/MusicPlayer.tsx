import { useState, useRef, useEffect, useCallback } from 'react'

const PLAYLIST_ID = '17901658544'
const FAB_SIZE = 46
const HIDE_THRESHOLD = 20   // 距边缘多少 px 触发吸附
const PEEK_PX = 14          // 吸附后露出多少 px

// APlayer / MetingJS 类型声明
declare global {
  interface Window {
    APlayer: new (options: APlayerOptions) => APlayerInstance
  }
}
interface APlayerOptions {
  container: HTMLElement
  mini?: boolean
  autoplay?: boolean
  theme?: string
  loop?: 'all' | 'one' | 'none'
  order?: 'list' | 'random'
  preload?: 'none' | 'metadata' | 'auto'
  volume?: number
  mutex?: boolean
  listFolded?: boolean
  listMaxHeight?: string
  audio: APlayerAudio[]
}
interface APlayerAudio {
  name: string
  artist: string
  url: string
  cover: string
  lrc?: string
}
interface APlayerInstance {
  destroy(): void
  play(): void
  pause(): void
  setVolume(volume: number, storage?: boolean): void
}

interface Pos { x: number; y: number }

// 动态加载脚本/样式
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src; s.onload = () => resolve(); s.onerror = reject
    document.head.appendChild(s)
  })
}
function loadStyle(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return
  const l = document.createElement('link')
  l.rel = 'stylesheet'; l.href = href
  document.head.appendChild(l)
}

// MetingJS API 获取歌单
async function fetchPlaylist(id: string): Promise<APlayerAudio[]> {
  const url = `https://api.injahow.cn/meting/?server=netease&type=playlist&id=${id}&r=${Math.random()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`MetingAPI ${res.status}`)
  const data = await res.json()
  return (data as { name: string; artist: string; url: string; pic: string; lrc?: string }[]).map(s => ({
    name: s.name,
    artist: s.artist,
    url: s.url,
    cover: s.pic,
    lrc: s.lrc,
  }))
}

interface MusicPlayerProps {
  muted?: boolean
}

export default function MusicPlayer({ muted = false }: MusicPlayerProps) {
  const [open, setOpen] = useState(false)
  // 使用函数式初始化，避免 SSR 或测试环境中直接读取 window
  const [pos, setPos] = useState<Pos>(() => ({
    x: (window.visualViewport?.width ?? window.innerWidth) - FAB_SIZE - 18,
    y: (window.visualViewport?.height ?? window.innerHeight) - FAB_SIZE - 88,
  }))
  const [hidden, setHidden] = useState(false)
  const [hideSide, setHideSide] = useState<'left' | 'right'>('right')
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // 用 ref 持有最新 muted 值，避免 initPlayer useCallback 因 muted 变化而重新创建
  const mutedRef = useRef(muted)
  useEffect(() => { mutedRef.current = muted }, [muted])

  const dragging = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const moved = useRef(false)
  const startPointer = useRef<Pos>({ x: 0, y: 0 })
  const startPos = useRef<Pos>({ x: 0, y: 0 })
  const fabRef = useRef<HTMLButtonElement>(null)
  const playerContainerRef = useRef<HTMLDivElement>(null)
  const aplayerRef = useRef<APlayerInstance | null>(null)
  const playlistRef = useRef<APlayerAudio[]>([])
  const mountedRef = useRef(false)  // 防止重复初始化（含 StrictMode 双重调用保护）

  // 初始化 APlayer（加载资源 + 创建实例）
  const initPlayer = useCallback(async () => {
    // StrictMode 下 effect 会被调用两次：第一次 mount → unmount → 第二次 mount
    // 第一次调用时 playerContainerRef 可能已被卸载
    if (mountedRef.current) return
    if (!playerContainerRef.current) return
    mountedRef.current = true
    setLoadState('loading')
    try {
      // 1. 加载 APlayer CSS
      loadStyle('https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.css')
      // 2. 并行：加载 APlayer JS + 获取歌单数据
      const [, playlist] = await Promise.all([
        loadScript('https://cdn.jsdelivr.net/npm/aplayer/dist/APlayer.min.js'),
        fetchPlaylist(PLAYLIST_ID),
      ])
      playlistRef.current = playlist
      if (!playerContainerRef.current) return
      // 3. 创建 APlayer 实例
      aplayerRef.current = new window.APlayer({
        container: playerContainerRef.current,
        mini: false,
        autoplay: false,
        theme: '#C4956A',
        loop: 'all',
        order: 'list',
        preload: 'none',
        volume: mutedRef.current ? 0 : 0.7,
        mutex: true,
        listFolded: false,
        listMaxHeight: '200px',
        audio: playlist,
      })
      setLoadState('ready')
    } catch (e) {
      mountedRef.current = false  // 允许重试
      setErrorMsg((e as Error).message || '加载失败')
      setLoadState('error')
    }
  }, [])

  // 首次打开时初始化
  useEffect(() => {
    if (open && !hidden && loadState === 'idle') {
      // 用 setTimeout 避免在 effect 中直接触发 setState
      const t = setTimeout(() => initPlayer(), 0)
      return () => clearTimeout(t)
    }
  }, [open, hidden, loadState, initPlayer])

  // 组件卸载时销毁 APlayer
  useEffect(() => {
    return () => {
      if (aplayerRef.current) {
        try { aplayerRef.current.destroy() } catch { /* ignore */ }
        aplayerRef.current = null
      }
    }
  }, [])

  // 监听全局静音状态，同步控制 APlayer 音量
  useEffect(() => {
    try {
      aplayerRef.current?.setVolume(muted ? 0 : 0.7, false)
    } catch { /* APlayer 尚未初始化时忽略 */ }
  }, [muted])

  // 吸附逻辑
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
    setIsDragging(true)
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
    setHidden(false)
    e.preventDefault()
  }, [])

  // 指针松开
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    setIsDragging(false)
    if (!moved.current) {
      if (hidden) {
        setHidden(false)
      } else {
        setOpen(o => !o)
      }
    } else {
      snapToEdge(pos.x, pos.y)
    }
    e.preventDefault()
  }, [hidden, pos, snapToEdge])

  // 窗口 resize 时重新约束位置
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

  const fabTranslateX = hidden
    ? hideSide === 'right' ? FAB_SIZE - PEEK_PX : -(FAB_SIZE - PEEK_PX)
    : 0

  // 使用 visualViewport 尺寸，与 resize handler 保持一致，避免键盘弹出时卡片位置错误
  const vpW = window.visualViewport?.width ?? window.innerWidth
  const vpH = window.visualViewport?.height ?? window.innerHeight
  const cardRight = hideSide === 'right'
    ? vpW - pos.x - FAB_SIZE + (hidden ? FAB_SIZE - PEEK_PX : 0)
    : undefined
  const cardLeft = hideSide === 'left'
    ? pos.x + FAB_SIZE + 8 + (hidden ? -(FAB_SIZE - PEEK_PX) : 0)
    : undefined
  const cardBottom = vpH - pos.y + 8

  const isVisible = open && !hidden

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
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          cursor: isDragging ? 'grabbing' : 'grab',
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
      <div
        className="music-card-wrap"
        style={{
          position: 'fixed',
          bottom: cardBottom,
          right: cardRight,
          left: cardLeft,
          top: 'auto',
          zIndex: 39,
          visibility: isVisible ? 'visible' : 'hidden',
          opacity: isVisible ? 1 : 0,
          pointerEvents: isVisible ? 'auto' : 'none',
          transition: 'opacity 0.2s ease, visibility 0.2s ease',
          animation: isVisible ? 'cardSlideIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both' : 'none',
        }}
      >
        <div className="music-card" style={{ overflow: 'hidden' }}>
          {/* 卡片头部 */}
          <div className="music-card-header">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
              <span className="text-xs font-semibold" style={{ color: 'var(--hz-800)', letterSpacing: '0.05em' }}>Blog · 歌单</span>
            </div>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>网易云音乐</span>
          </div>

          {/* 加载中 */}
          {loadState === 'loading' && (
            <div className="music-loading">
              <span className="flex gap-1">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
              <span className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>加载歌单中...</span>
            </div>
          )}

          {/* 加载失败 */}
          {loadState === 'error' && (
            <div className="music-loading" style={{ gap: 8 }}>
              <span style={{ fontSize: 24 }}>😢</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                加载失败<br />{errorMsg}
              </span>
              <button
                onClick={() => { mountedRef.current = false; setLoadState('idle'); initPlayer() }}
                style={{
                  marginTop: 8, padding: '6px 16px', fontSize: 12,
                  background: 'var(--hz-500)', color: 'white',
                  border: 'none', borderRadius: 8, cursor: 'pointer'
                }}
              >
                重试
              </button>
            </div>
          )}

          {/* APlayer 容器：始终挂载，ready 后才可见 */}
          <div
            ref={playerContainerRef}
            style={{
              display: loadState === 'ready' ? 'block' : 'none',
              // APlayer 样式覆盖：适配暗色主题
            }}
          />
        </div>
      </div>
    </>
  )
}
