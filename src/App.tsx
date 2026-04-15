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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="modal-anim relative w-full max-w-xs mx-4 mb-4 sm:mb-0 rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>在线成员 · {all.length} 人</span>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-lg" style={{ color: 'var(--text-muted)' }}>×</button>
          </div>
        </div>
        <div className="p-3 max-h-64 overflow-y-auto flex flex-col gap-1">
          {all.map(u => (
            <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'var(--bg-input)' }}>
              <div className="avatar" style={{ background: u.color, width: 32, height: 32, fontSize: 13 }}>
                {u.name.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{u.name}</span>
              {u.id === self.id && <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--hz-200)', color: 'var(--hz-800)' }}>我</span>}
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
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="modal-anim relative w-full max-h-[70vh] flex flex-col rounded-t-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>调试日志 · {logs.length} 条</span>
          <div className="flex gap-2">
            <button onClick={onClear} className="text-xs px-3 py-1 rounded-lg" style={{ background: 'var(--hz-500)', color: 'white' }}>清空</button>
            <button onClick={onClose} className="text-xs px-3 py-1 rounded-lg" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>关闭</button>
          </div>
        </div>
        <div className="log-panel flex-1 overflow-y-auto p-4 flex flex-col gap-1">
          {logs.length === 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>暂无日志</span>}
          {logs.map(l => (
            <div key={l.id} className={`log-${l.level} flex gap-2`}>
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
    <div className={`flex items-center gap-3 px-4 py-3 min-w-[140px] cursor-pointer select-none ${isSelf ? 'bubble-self' : 'bubble-other'}`} onClick={toggle}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: isSelf ? 'rgba(255,255,255,0.25)' : 'var(--hz-200)' }}>
        <span className="text-base">{playing ? '⏸' : '▶️'}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="flex gap-0.5 items-end h-5">
          {[3,5,4,6,3,5,4,3,5,6,4,3].map((h, i) => (
            <div key={i} className="w-0.5 rounded-full transition-all" style={{
              height: playing ? `${h * 3}px` : `${h * 2}px`,
              background: isSelf ? 'rgba(255,255,255,0.7)' : 'var(--hz-500)',
              animation: playing ? `typingBounce ${0.8 + i * 0.07}s infinite` : 'none'
            }} />
          ))}
        </div>
        <span className="text-xs opacity-70">{duration ? fmtDuration(duration) : '语音'}</span>
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

  // 深色模式
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('chat_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // 窗口焦点
  useEffect(() => {
    const onFocus = () => { setFocused(true); setUnread(0); document.title = '哈吉米德的聊天室' }
    const onBlur = () => setFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur) }
  }, [])

  // 新消息处理
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
    // 自动扩张，无滚动条
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
      if (result && result.blob.size > 0) {
        sendVoice(result.blob, result.duration)
      }
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

  const statusDot = {
    disconnected: 'status-disc',
    connecting: 'status-conn',
    ok: 'status-ok',
    err: 'status-err'
  }[status]

  const statusText = {
    disconnected: '未连接',
    connecting: '连接中',
    ok: '已连接',
    err: '连接失败'
  }[status]

  // ===== 登录页 =====
  if (!inRoom) {
    return (
      <div className="login-root">
        <div className="login-card w-full max-w-sm mx-4 glass-card rounded-3xl p-8">
          <div className="flex justify-end mb-2">
            <button onClick={() => setDarkMode(d => !d)} className="w-9 h-9 flex items-center justify-center rounded-full text-xl transition-colors" style={{ background: 'var(--bg-input)' }}>
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>

          <div className="text-center mb-7">
            <div className="login-gif mb-3 flex justify-center">
              <img src="/chatroom/avatar.gif" alt="avatar" className="w-20 h-20 object-contain" />
            </div>
            <h1 className="login-title text-xl font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>哈吉米德的聊天室</h1>
            <p className="login-subtitle font-kai text-base" style={{ color: 'var(--hz-600)' }}>人生无处不青山</p>
          </div>

          <input
            className="login-input-1 input-hz w-full px-4 py-3 text-base mb-3 text-center"
            placeholder="你的昵称"
            maxLength={12}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateRoom()}
          />

          <div className="login-btn-row flex gap-2 mb-3">
            <button onClick={handleCreateRoom} className="btn-hz flex-1 py-3 text-sm">
              新建房间
            </button>
            <button
              onClick={() => setShowJoin(j => !j)}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              加入房间
            </button>
          </div>

          {showJoin && (
            <div className="login-join-row mt-1">
              <input
                className="input-hz w-full px-4 py-3 text-base mb-2 text-center tracking-widest uppercase"
                placeholder="输入房间码"
                maxLength={8}
                value={roomInput}
                onChange={e => setRoomInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
              />
              <button onClick={handleJoinRoom} className="btn-hz w-full py-3 text-sm">
                进入房间
              </button>
            </div>
          )}

          {savedRoom && (
            <button
              onClick={() => { setRoomInput(savedRoom); setShowJoin(true) }}
              className="w-full mt-3 py-2 text-xs transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
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

      {/* 全局悬浮层（不受 chat-inner 居中限制）*/}
      {toast && (
        <div className="toast-anim fixed top-16 left-1/2 z-50 px-4 py-2 rounded-full text-sm shadow-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', transform: 'translateX(-50%)' }}>
          {toast}
        </div>
      )}
      <MusicPlayer />
      {imgViewer && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center" onClick={() => setImgViewer(null)}>
          <img src={imgViewer} className="max-w-[95vw] max-h-[95vh] rounded-xl object-contain" alt="预览" />
          <button className="absolute top-4 right-4 text-white text-3xl opacity-70 hover:opacity-100">×</button>
        </div>
      )}
      {showOnlineModal && (
        <OnlineUsersModal users={onlineUsers} self={user} onClose={() => setShowOnlineModal(false)} />
      )}
      {showLogPanel && (
        <LogPanel logs={logs} onClear={clearLogs} onClose={() => setShowLogPanel(false)} />
      )}

      {/* 聊天区域（平板/PC 居中限宽）*/}
      <div className="chat-inner">

      {/* 顶栏 */}
      <header className="glass-card flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none', borderTop: 'none', borderRadius: 0 }}>
        {/* 左：房间码 + 状态 */}
        <button onClick={copyRoomCode} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
          {roomCode}
          {unread > 0 && <span className="ml-1 text-white text-[10px] rounded-full px-1.5 py-0.5" style={{ background: 'var(--hz-600)' }}>{unread}</span>}
        </button>

        {/* 中：在线用户头像组（点击弹窗） */}
        <button onClick={() => setShowOnlineModal(true)} className="flex items-center gap-1 px-2 flex-1 justify-center" title="查看在线成员">
          <div className="flex -space-x-1.5">
            {[user, ...onlineUsers].slice(0, 5).map(u => (
              <div key={u.id} className="avatar" style={{ background: u.color, border: '2px solid var(--bg-primary)' }}>
                {u.name.slice(0, 1).toUpperCase()}
              </div>
            ))}
          </div>
          <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
            {1 + onlineUsers.length}人
          </span>
        </button>

        {/* 右：工具按钮 */}
        <div className="flex items-center gap-1">
          <button onClick={toggleMute} className="w-8 h-8 flex items-center justify-center rounded-full text-base transition-colors" style={{ background: 'var(--bg-input)' }} title={muted ? '开启音效' : '静音'}>
            {muted ? '🔇' : '🔔'}
          </button>
          <button onClick={() => setDarkMode(d => !d)} className="w-8 h-8 flex items-center justify-center rounded-full text-base transition-colors" style={{ background: 'var(--bg-input)' }}>
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={manualReconnect} className="w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-colors" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }} title="手动重连">
            ↻
          </button>
          <button onClick={() => setShowLogPanel(true)} className="w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-colors" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }} title="调试日志">
            🔍
          </button>
          <button onClick={handleExit} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-colors" style={{ background: '#c07070' }}>
            退出
          </button>
        </div>
      </header>

      {/* 消息列表 */}
      <div ref={msgListRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.map(msg => {
          if (msg.type === 'sys') {
            return (
              <div key={msg.id} className="msg-anim self-center text-xs px-3 py-1 rounded-full max-w-[90%] text-center" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
                {msg.text}
              </div>
            )
          }

          return (
            <div key={msg.id} className={`msg-anim flex flex-col max-w-[78%] ${msg.isSelf ? 'self-end items-end' : 'self-start items-start'}`}>
              {!msg.isSelf && (
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="avatar" style={{ background: msg.senderColor, width: 20, height: 20, fontSize: 10 }}>
                    {msg.senderName.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{msg.senderName}</span>
                </div>
              )}

              {msg.type === 'text' && (
                <div className={`px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words select-text ${msg.isSelf ? 'bubble-self' : 'bubble-other'}`}>
                  {msg.text}
                </div>
              )}

              {msg.type === 'image' && msg.fileUrl && (
                <div className={`overflow-hidden ${msg.isSelf ? 'bubble-self' : 'bubble-other'}`} style={{ padding: 0 }}>
                  <img
                    src={msg.fileUrl}
                    alt={msg.fileName}
                    className="max-w-[220px] max-h-[300px] object-cover cursor-pointer block"
                    onClick={() => setImgViewer(msg.fileUrl!)}
                  />
                </div>
              )}

              {msg.type === 'file' && (
                <div className={`flex items-center gap-3 px-4 py-3 min-w-[180px] ${msg.isSelf ? 'bubble-self' : 'bubble-other'}`}>
                  <span className="text-2xl flex-shrink-0">📄</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{msg.fileName}</div>
                    <div className="text-xs opacity-60">{msg.fileSize ? fmtSize(msg.fileSize) : ''}</div>
                  </div>
                  {msg.fileUrl && (
                    <a href={msg.fileUrl} download={msg.fileName} className="text-xs underline opacity-70 flex-shrink-0" onClick={e => e.stopPropagation()}>下载</a>
                  )}
                </div>
              )}

              {msg.type === 'voice' && msg.fileUrl && (
                <VoiceBubble url={msg.fileUrl} duration={msg.duration} isSelf={msg.isSelf} />
              )}

              <span className="text-[10px] mt-1 px-1" style={{ color: 'var(--text-muted)' }}>
                {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )
        })}

        {/* 正在输入 */}
        {typingUsers.length > 0 && (
          <div className="msg-anim self-start flex items-center gap-2 px-3.5 py-2.5 bubble-other">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{typingUsers.join('、')} 正在输入</span>
            <span className="flex gap-1">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </span>
          </div>
        )}
      </div>

      {/* 表情面板 */}
      {showEmoji && (
        <div className="flex-shrink-0 px-3 py-2 flex flex-wrap gap-1" style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
          {EMOJIS.map(e => (
            <button key={e} onClick={() => { setInputText(t => t + e); setShowEmoji(false); inputRef.current?.focus() }}
              className="text-xl p-1.5 rounded-xl transition-colors" style={{ background: 'transparent' }}
              onMouseEnter={el => (el.currentTarget.style.background = 'var(--bg-input)')}
              onMouseLeave={el => (el.currentTarget.style.background = 'transparent')}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* +号菜单 */}
      {showPlusMenu && (
        <div className="flex-shrink-0 px-4 py-3 menu-anim" style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
          <div className="grid grid-cols-4 gap-3">
            {[
              { icon: '🖼️', label: '图片', action: () => { imgInputRef.current?.click(); setShowPlusMenu(false) } },
              { icon: '📁', label: '文件', action: () => { fileInputRef.current?.click(); setShowPlusMenu(false) } },
              { icon: '🎤', label: recording ? `录音中 ${recDuration}s` : '语音', action: () => { handleVoiceBtn(); setShowPlusMenu(false) } },
              { icon: '🔍', label: '日志', action: () => { setShowLogPanel(true); setShowPlusMenu(false) } },
            ].map(item => (
              <button key={item.label} onClick={item.action} className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-colors" style={{ background: 'var(--bg-input)' }}>
                <span className="text-2xl">{item.icon}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 底部输入栏 */}
      <div className="flex-shrink-0 flex items-end gap-2 px-3 py-3 glass-card rounded-none" style={{ borderTop: '1px solid var(--border)', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}>
        {/* +号按钮 */}
        <button
          onClick={() => { setShowPlusMenu(s => !s); setShowEmoji(false) }}
          className="w-10 h-10 flex items-center justify-center rounded-full text-xl font-light flex-shrink-0 transition-all"
          style={{ background: showPlusMenu ? 'var(--hz-500)' : 'var(--bg-input)', color: showPlusMenu ? 'white' : 'var(--text-secondary)', border: '1px solid var(--border)', transform: showPlusMenu ? 'rotate(45deg)' : 'rotate(0deg)' }}
        >
          +
        </button>

        {/* 表情按钮 */}
        <button
          onClick={() => { setShowEmoji(s => !s); setShowPlusMenu(false) }}
          className="w-10 h-10 flex items-center justify-center rounded-full text-xl flex-shrink-0 transition-colors"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
        >
          😊
        </button>

        {/* 语音录制中显示 */}
        {recording ? (
          <div className="flex-1 flex items-center justify-center gap-3 h-10 rounded-xl" style={{ background: 'var(--bg-input)', border: '1px solid var(--hz-500)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--hz-600)' }}>🔴 录音中 {recDuration}s</span>
            <span className="flex gap-1">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </span>
          </div>
        ) : (
          <textarea
            ref={inputRef}
            className="input-hz no-scrollbar flex-1 px-3.5 py-2.5 text-sm leading-snug resize-none overflow-hidden"
            style={{ minHeight: '40px', maxHeight: '120px' }}
            placeholder={status === 'ok' ? '输入消息... (Ctrl+V 粘贴图片)' : statusText}
            disabled={status !== 'ok'}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
          />
        )}

        {/* 发送 / 停止录音 */}
        {recording ? (
          <button onClick={handleVoiceBtn} className="btn-hz px-4 py-2.5 text-sm flex-shrink-0">
            发送
          </button>
        ) : inputText.trim() ? (
          <button onClick={handleSend} disabled={status !== 'ok'} className="btn-hz px-4 py-2.5 text-sm flex-shrink-0 disabled:opacity-40">
            发送
          </button>
        ) : (
          <button onClick={handleVoiceBtn} className="w-10 h-10 flex items-center justify-center rounded-full text-xl flex-shrink-0 transition-colors" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            🎤
          </button>
        )}
      </div>

      {/* 隐藏文件输入 */}
      <input ref={imgInputRef} type="file" className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />
      <input ref={fileInputRef} type="file" className="hidden" accept="*/*" onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = '' }} />

      </div> {/* end chat-inner */}
    </div>
  )
}
