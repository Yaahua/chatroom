import { useState, useEffect, useRef, useCallback } from 'react'
import { useMqtt, pickColor } from './useMqtt'
import MusicPlayer from './MusicPlayer'
import { useSound } from './useSound'
import type { User } from './types'

const EMOJIS = ['😀','😂','🥰','😎','🤔','😅','🙏','👍','👎','❤️','🔥','✨','🎉','💯','😭','🤣','😊','😍','🥺','😤','💪','🤝','👏','🎊','🌟','🍵','🌸','🍂','🌙','⭐']

function genId() { return Math.random().toString(36).slice(2, 11) }
function fmtSize(n: number) {
  return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB'
}
function fmtDuration(s: number) {
  return s < 60 ? `${s}"` : `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`
}

// ===== 语音录制 Hook =====
function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRef.current = mr
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.start(200)
      setRecording(true)
      setDuration(0)
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
      return true
    } catch {
      alert('无法获取麦克风权限')
      return false
    }
  }, [])

  const stop = useCallback((): Promise<{ blob: Blob; duration: number } | null> => {
    return new Promise(resolve => {
      if (!mediaRef.current) { resolve(null); return }
      const mr = mediaRef.current
      if (timerRef.current) clearInterval(timerRef.current)
      let finalDuration = 0
      setDuration(d => { finalDuration = d; return d })
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' })
        mr.stream.getTracks().forEach(t => t.stop())
        setRecording(false)
        resolve({ blob, duration: finalDuration })
      }
      mr.stop()
    })
  }, [])

  return { recording, duration, start, stop }
}

// ===== 在线用户弹窗 =====
function OnlineUsersModal({ users, self, onClose }: {
  users: { id: string; name: string; color: string }[]
  self: User
  onClose: () => void
}) {
  const all = [{ id: self.id, name: self.name, color: self.color }, ...users]
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-anim" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>在线成员 · {all.length} 人</span>
          <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
        </div>
        <div className="modal-body">
          {all.map(u => (
            <div key={u.id} className="modal-user-row">
              <div className="avatar" style={{ background: u.color, width: 32, height: 32, fontSize: 13 }}>
                {u.name.slice(0, 1).toUpperCase()}
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{u.name}</span>
              {u.id === self.id && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--hz-200)', color: 'var(--hz-800)' }}>我</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ===== 日志面板 =====
function LogPanel({ logs, onClear, onClose }: {
  logs: { id: string; level: string; msg: string; ts: number }[]
  onClear: () => void
  onClose: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView() }, [logs])
  return (
    <div className="log-modal-overlay" onClick={onClose}>
      <div className="log-modal modal-anim" onClick={e => e.stopPropagation()}>
        <div className="log-modal-header">
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>调试日志 · {logs.length} 条</span>
          <div className="log-modal-btns">
            <button onClick={onClear} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 8, background: 'var(--hz-500)', color: 'white', border: 'none', cursor: 'pointer' }}>清空</button>
            <button onClick={onClose} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer' }}>关闭</button>
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
  )
}

// ===== 语音气泡 =====
function VoiceBubble({ url, duration, isSelf }: { url: string; duration?: number; isSelf: boolean }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const toggle = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url)
      audioRef.current.onended = () => setPlaying(false)
    }
    if (playing) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }, [url, playing])

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

// ===== 主应用 =====
export default function App() {
  const [savedName] = useState(() => localStorage.getItem('chat_name') || '')
  const [savedRoom] = useState(() => localStorage.getItem('chat_room') || '')

  const [nameInput, setNameInput] = useState(savedName)
  const [roomInput, setRoomInput] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [inRoom, setInRoom] = useState(false)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [user, setUser] = useState<User>({ id: genId(), name: '', color: '' })
  const [muted, setMuted] = useState(() => localStorage.getItem('chat_muted') === '1')
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('chat_theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [showEmoji, setShowEmoji] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showOnlineModal, setShowOnlineModal] = useState(false)
  const [showLogPanel, setShowLogPanel] = useState(false)
  const [inputText, setInputText] = useState('')
  const [imgViewer, setImgViewer] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [focused, setFocused] = useState(true)

  const msgListRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevMsgCount = useRef(0)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { status, messages, onlineUsers, typingUsers, logs, connect, disconnect, sendText, sendTyping, sendFile, sendVoice, manualReconnect: _reconnect, clearLogs } = useMqtt(user, roomCode)
  const manualReconnect = _reconnect
  const { playSend, playReceive } = useSound(muted)
  const { recording, duration: recDuration, start: startRec, stop: stopRec } = useVoiceRecorder()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('chat_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    document.body.classList.toggle('page-chat', inRoom)
    document.body.classList.toggle('page-login', !inRoom)
  }, [inRoom])

  useEffect(() => {
    const onFocus = () => { setFocused(true); setUnread(0); document.title = '哈吉米德的聊天室' }
    const onBlur = () => setFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur) }
  }, [])

  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    if (messages.length > prevMsgCount.current) {
      setTimeout(() => {
        if (msgListRef.current) msgListRef.current.scrollTop = msgListRef.current.scrollHeight
      }, 50)
      if (last.type !== 'sys') {
        if (last.isSelf) playSend()
        else {
          playReceive()
          if (!focused) {
            setUnread(n => {
              const next = n + 1
              document.title = `(${next}) 哈吉米德的聊天室`
              return next
            })
          }
        }
      }
      prevMsgCount.current = messages.length
    }
  }, [messages, focused, playSend, playReceive])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const handleEnterRoom = useCallback((code: string, name: string) => {
    const trimName = name.trim()
    if (!trimName) { alert('请输入昵称'); return }
    const trimCode = code.trim().toUpperCase()
    if (!trimCode) { alert('请输入房间码'); return }
    const color = pickColor(trimName + trimCode)
    const u: User = { id: genId(), name: trimName, color }
    setUser(u)
    setRoomCode(trimCode)
    setInRoom(true)
    localStorage.setItem('chat_name', trimName)
    localStorage.setItem('chat_room', trimCode)
  }, [])

  const handleCreateRoom = useCallback(() => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    handleEnterRoom(code, nameInput)
  }, [nameInput, handleEnterRoom])

  const handleJoinRoom = useCallback(() => {
    if (!roomInput.trim()) { alert('请输入房间码'); return }
    handleEnterRoom(roomInput, nameInput)
  }, [nameInput, roomInput, handleEnterRoom])

  useEffect(() => {
    if (inRoom && roomCode && user.name) connect()
  }, [inRoom, roomCode, user, connect])

  const handleExit = useCallback(() => {
    if (!confirm('确定退出房间？')) return
    disconnect()
    setInRoom(false)
    setRoomCode(null)
    setInputText('')
    prevMsgCount.current = 0
    setUnread(0)
    document.title = '哈吉米德的聊天室'
  }, [disconnect])

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text || status !== 'ok') return
    sendText(text)
    setInputText('')
    if (inputRef.current) { inputRef.current.style.height = 'auto' }
  }, [inputText, status, sendText])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
    sendTyping()
  }, [sendTyping])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) { sendFile(file); e.preventDefault() }
      }
    }
  }, [sendFile])

  const handleVoiceBtn = useCallback(async () => {
    if (recording) {
      const result = await stopRec()
      if (result && result.blob.size > 0) sendVoice(result.blob, result.duration)
    } else {
      await startRec()
    }
  }, [recording, startRec, stopRec, sendVoice])

  const copyRoomCode = useCallback(() => {
    if (!roomCode) return
    navigator.clipboard.writeText(roomCode)
      .then(() => showToast(`房间码 ${roomCode} 已复制`))
      .catch(() => prompt('复制房间码：', roomCode))
  }, [roomCode, showToast])

  const toggleMute = useCallback(() => {
    setMuted(m => { localStorage.setItem('chat_muted', m ? '0' : '1'); return !m })
  }, [])

  const statusDotClass = { disconnected: 'status-disc', connecting: 'status-conn', ok: 'status-ok', err: 'status-err' }[status]
  const statusText = { disconnected: '未连接', connecting: '连接中', ok: '已连接', err: '连接失败' }[status]

  // ===== 登录页 =====
  if (!inRoom) {
    const isDark = darkMode
    const S = {
      root: {
        position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isDark
          ? 'linear-gradient(160deg,#2A1F16 0%,#3A2518 50%,#4A3020 100%)'
          : 'linear-gradient(160deg,#F3EDE2 0%,#E8DCC8 40%,#D9C9A8 100%)',
        padding: '24px 20px',
        overflowY: 'auto' as const,
      },
      card: {
        position: 'relative' as const,
        width: '100%', maxWidth: 360,
        background: isDark ? '#3A2518' : '#FBF7F0',
        borderRadius: 28,
        padding: '32px 28px 28px',
        boxShadow: isDark ? '0 8px 40px rgba(0,0,0,0.55)' : '0 8px 40px rgba(94,80,63,0.22)',
        border: isDark ? '1px solid rgba(200,180,138,0.18)' : '1px solid rgba(174,159,128,0.4)',
        flexShrink: 0,
      },
      themeBtn: {
        position: 'absolute' as const, top: 14, right: 14,
        width: 34, height: 34, borderRadius: '50%',
        background: isDark ? '#452C1C' : '#EDE4D2',
        border: isDark ? '1px solid rgba(200,180,138,0.22)' : '1px solid rgba(94,80,63,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, cursor: 'pointer',
      },
      center: { textAlign: 'center' as const, marginBottom: 20 },
      title: {
        fontSize: 22, fontWeight: 700, margin: '8px 0 6px',
        color: isDark ? '#F3EDE2' : '#231D17',
        fontFamily: 'Noto Serif SC, SimSun, serif',
        display: 'inline-block',
      },
      subtitle: {
        fontSize: 15, margin: 0,
        color: isDark ? '#C8B48A' : '#9A8A6A',
        fontFamily: 'ZCOOL XiaoWei, KaiTi, serif',
      },
      input: {
        width: '100%', padding: '12px 16px',
        fontSize: 15, textAlign: 'center' as const,
        background: isDark ? '#452C1C' : '#EDE4D2',
        border: isDark ? '1.5px solid rgba(200,180,138,0.22)' : '1.5px solid rgba(94,80,63,0.2)',
        borderRadius: 14, outline: 'none',
        color: isDark ? '#F3EDE2' : '#231D17',
        fontFamily: 'inherit', boxSizing: 'border-box' as const,
        marginBottom: 12,
        display: 'block',
      },
      btnRow: { display: 'flex', gap: 8, marginBottom: 12 },
      btnPrimary: {
        flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 600,
        background: '#AE9F80', color: '#fff',
        border: 'none', borderRadius: 14, cursor: 'pointer',
      },
      btnSecondary: {
        flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 600,
        background: isDark ? '#452C1C' : '#EDE4D2',
        color: isDark ? '#F3EDE2' : '#231D17',
        border: isDark ? '1px solid rgba(200,180,138,0.22)' : '1px solid rgba(94,80,63,0.2)',
        borderRadius: 14, cursor: 'pointer',
      },
      btnFull: {
        width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 600,
        background: '#AE9F80', color: '#fff',
        border: 'none', borderRadius: 14, cursor: 'pointer', marginTop: 8,
        display: 'block',
      },
      recentBtn: {
        width: '100%', padding: '8px 0', fontSize: 12,
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#9A8A6A', marginTop: 4, display: 'block',
      },
    }
    return (
      <div style={S.root}>
        <div style={S.card}>
          <button style={S.themeBtn} onClick={() => setDarkMode(d => !d)}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <div style={S.center}>
            <div className="login-gif" style={{ display: 'flex', justifyContent: 'center' }}>
              <img src="/chatroom/avatar.gif" alt="avatar" style={{ width: 72, height: 72, objectFit: 'contain' }} />
            </div>
            <h1 className="login-title" style={S.title}>哈吉米德的聊天室</h1>
            <p className="login-subtitle" style={S.subtitle}>人生无处不青山</p>
          </div>
          <div className="login-input-1">
            <input
              style={S.input}
              placeholder="你的昵称"
              maxLength={12}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateRoom()}
            />
          </div>
          <div className="login-btn-row" style={S.btnRow}>
            <button style={S.btnPrimary} onClick={handleCreateRoom}>新建房间</button>
            <button style={S.btnSecondary} onClick={() => setShowJoin(j => !j)}>加入房间</button>
          </div>
          {showJoin && (
            <div className="login-join-row">
              <input
                style={{ ...S.input, letterSpacing: 4, textTransform: 'uppercase' as const }}
                placeholder="输入房间码"
                maxLength={8}
                value={roomInput}
                onChange={e => setRoomInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
              />
              <button style={S.btnFull} onClick={handleJoinRoom}>进入房间</button>
            </div>
          )}
          {savedRoom && (
            <button style={S.recentBtn} onClick={() => { setRoomInput(savedRoom); setShowJoin(true) }}>
              最近房间：{savedRoom}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ===== 聊天页 =====
  return (
    <div className="chat-root">

      {/* Toast */}
      {toast && (
        <div className="toast-wrap toast-anim">{toast}</div>
      )}

      <MusicPlayer />

      {/* 图片预览 */}
      {imgViewer && (
        <div className="img-viewer" onClick={() => setImgViewer(null)}>
          <img src={imgViewer} alt="预览" />
          <button className="img-viewer-close">×</button>
        </div>
      )}

      {/* 在线用户弹窗 */}
      {showOnlineModal && (
        <OnlineUsersModal users={onlineUsers} self={user} onClose={() => setShowOnlineModal(false)} />
      )}

      {/* 日志面板 */}
      {showLogPanel && (
        <LogPanel logs={logs} onClear={clearLogs} onClose={() => setShowLogPanel(false)} />
      )}

      {/* 聊天区域 */}
      <div className="chat-inner">

        {/* 顶栏 */}
        <header className="chat-header">
          {/* 左：房间码 */}
          <button className="header-room-btn" onClick={copyRoomCode}>
            <span className={`status-dot ${statusDotClass}`} />
            {roomCode}
            {unread > 0 && <span className="unread-badge">{unread}</span>}
          </button>

          {/* 中：在线用户 */}
          <button className="header-users-btn" onClick={() => setShowOnlineModal(true)} title="查看在线成员">
            <div className="header-avatars">
              {[user, ...onlineUsers].slice(0, 5).map(u => (
                <div key={u.id} className="avatar" style={{ background: u.color, border: '2px solid var(--bg-primary)' }}>
                  {u.name.slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>
            <span style={{ fontSize: 12, marginLeft: 4, color: 'var(--text-muted)' }}>
              {1 + onlineUsers.length}人
            </span>
          </button>

          {/* 右：工具按钮 */}
          <div className="header-tools">
            <button className="icon-btn" onClick={toggleMute} title={muted ? '开启音效' : '静音'}>
              {muted ? '🔇' : '🔔'}
            </button>
            <button className="icon-btn" onClick={() => setDarkMode(d => !d)}>
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button className="icon-btn" onClick={manualReconnect} title="手动重连" style={{ fontSize: 14, fontWeight: 700 }}>
              ↻
            </button>
            <button className="icon-btn" onClick={() => setShowLogPanel(true)} title="调试日志">
              🔍
            </button>
            <button className="exit-btn" onClick={handleExit}>退出</button>
          </div>
        </header>

        {/* 消息列表 */}
        <div ref={msgListRef} className="msg-list">
          {messages.map(msg => {
            if (msg.type === 'sys') {
              return (
                <div key={msg.id} className="msg-anim msg-sys">{msg.text}</div>
              )
            }
            return (
              <div key={msg.id} className={`msg-anim ${msg.isSelf ? 'msg-row-self' : 'msg-row-other'}`}>
                {!msg.isSelf && (
                  <div className="msg-sender-row">
                    <div className="avatar" style={{ background: msg.senderColor, width: 20, height: 20, fontSize: 10 }}>
                      {msg.senderName.slice(0, 1).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{msg.senderName}</span>
                  </div>
                )}

                {msg.type === 'text' && (
                  <div className={`${msg.isSelf ? 'bubble-self' : 'bubble-other'}`}
                    style={{ whiteSpace: 'pre-wrap' }}>
                    {msg.text}
                  </div>
                )}

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

                {msg.type === 'voice' && msg.fileUrl && (
                  <VoiceBubble url={msg.fileUrl} duration={msg.duration} isSelf={msg.isSelf} />
                )}

                <span className="msg-time">
                  {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )
          })}

          {/* 正在输入 */}
          {typingUsers.length > 0 && (
            <div className="msg-anim typing-row bubble-other">
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{typingUsers.join('、')} 正在输入</span>
              <span className="typing-dots">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </span>
            </div>
          )}
        </div>

        {/* 表情面板 */}
        {showEmoji && (
          <div className="emoji-panel menu-anim">
            {EMOJIS.map(e => (
              <button key={e} className="emoji-btn"
                onClick={() => { setInputText(t => t + e); setShowEmoji(false); inputRef.current?.focus() }}>
                {e}
              </button>
            ))}
          </div>
        )}

        {/* +号菜单 */}
        {showPlusMenu && (
          <div className="plus-menu menu-anim">
            <div className="plus-menu-grid">
              {[
                { icon: '🖼️', label: '图片', action: () => { imgInputRef.current?.click(); setShowPlusMenu(false) } },
                { icon: '📁', label: '文件', action: () => { fileInputRef.current?.click(); setShowPlusMenu(false) } },
                { icon: '🎤', label: recording ? `录音中 ${recDuration}s` : '语音', action: () => { handleVoiceBtn(); setShowPlusMenu(false) } },
                { icon: '🔍', label: '日志', action: () => { setShowLogPanel(true); setShowPlusMenu(false) } },
              ].map(item => (
                <button key={item.label} className="plus-menu-item" onClick={item.action}>
                  <span className="plus-menu-icon">{item.icon}</span>
                  <span className="plus-menu-label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 底部输入栏 */}
        <div className="input-bar">
          {/* +号按钮 */}
          <button
            className="bar-icon-btn"
            onClick={() => { setShowPlusMenu(s => !s); setShowEmoji(false) }}
            style={{
              background: showPlusMenu ? 'var(--hz-500)' : 'var(--bg-input)',
              color: showPlusMenu ? 'white' : 'var(--text-secondary)',
              transform: showPlusMenu ? 'rotate(45deg)' : 'rotate(0deg)',
              transition: 'background 0.15s, transform 0.2s',
            }}
          >
            +
          </button>

          {/* 表情按钮 */}
          <button
            className="bar-icon-btn"
            onClick={() => { setShowEmoji(s => !s); setShowPlusMenu(false) }}
          >
            😊
          </button>

          {/* 输入区 */}
          {recording ? (
            <div className="recording-bar">
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hz-600)' }}>🔴 录音中 {recDuration}s</span>
              <span className="typing-dots">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </span>
            </div>
          ) : (
            <textarea
              ref={inputRef}
              className="input-hz no-scrollbar"
              style={{ minHeight: 40, maxHeight: 120, padding: '10px 14px', fontSize: 14, lineHeight: '1.4', resize: 'none', overflow: 'hidden' }}
              placeholder={status === 'ok' ? '输入消息... (Ctrl+V 粘贴图片)' : statusText}
              disabled={status !== 'ok'}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
            />
          )}

          {/* 发送/录音按钮 */}
          {recording ? (
            <button className="btn-hz" style={{ padding: '10px 16px', fontSize: 14 }} onClick={handleVoiceBtn}>
              发送
            </button>
          ) : inputText.trim() ? (
            <button className="btn-hz" style={{ padding: '10px 16px', fontSize: 14, opacity: status !== 'ok' ? 0.4 : 1 }}
              onClick={handleSend} disabled={status !== 'ok'}>
              发送
            </button>
          ) : (
            <button className="bar-icon-btn" onClick={handleVoiceBtn}>🎤</button>
          )}
        </div>

        {/* 隐藏文件输入 — 必须用 style 而非 className="hidden" */}
        <input ref={imgInputRef} type="file" style={{ display: 'none' }} accept="image/*"
          onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept="*/*"
          onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />

      </div>
    </div>
  )
}
