import { useState } from 'react'

const PLAYLIST_ID = '17901658544'

export default function MusicPlayer() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  return (
    <>
      {/* 悬浮触发按钮 */}
      <button
        onClick={() => setOpen(o => !o)}
        className="music-fab"
        title={open ? '收起播放器' : '打开音乐播放器'}
        aria-label="音乐播放器"
      >
        {open ? (
          /* 关闭图标 */
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          /* 音符图标 */
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        )}
        {/* 音符跳动装饰 */}
        {!open && (
          <span className="music-fab-wave" aria-hidden="true">
            <span /><span /><span />
          </span>
        )}
      </button>

      {/* 播放器卡片 */}
      {open && (
        <div className="music-card-wrap">
          <div className="music-card">
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

            {/* iframe 播放器 */}
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
