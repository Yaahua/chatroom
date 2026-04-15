import { useState, useEffect, useRef, useCallback } from 'react'
import { useMqtt, pickColor } from './useMqtt'
import { useSound } from './useSound'
import type { User } from './types'

const EMOJIS = ['😀','😂','🥰','😎','🤔','😅','🙏','👍','👎','❤️','🔥','✨','🎉','💯','😭','🤣','😊','😍','🥺','😤','💪','🤝','👏','🎊','🌟']

function genId() { return Math.random().toString(36).slice(2, 11) }

export default function App() {
  // 持久化昵称和最近房间
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
  const [inputText, setInputText] = useState('')
  const [imgViewer, setImgViewer] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [focused, setFocused] = useState(true)

  const msgListRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevMsgCount = useRef(0)

  const { status, messages, onlineUsers, typingUsers, connect, disconnect, sendText, sendTyping, sendFile, manualReconnect } = useMqtt(user, roomCode)
  const { playSend, playReceive } = useSound(muted)

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

  // 新消息处理：滚动、音效、未读数、tab 标题
  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    if (messages.length > prevMsgCount.current) {
      // 滚动到底
      setTimeout(() => {
        if (msgListRef.current) msgListRef.current.scrollTop = msgListRef.current.scrollHeight
      }, 50)
      // 音效
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
    if (roomInput.length !== 6) { alert('请输入6位房间码'); return }
    handleEnterRoom(roomInput, nameInput)
  }, [nameInput, roomInput, handleEnterRoom])

  // 进入房间后连接
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
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
    // 正在输入
    sendTyping()
    if (typingTimer.current) clearTimeout(typingTimer.current)
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

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) sendFile(file)
    e.target.value = ''
  }, [sendFile])

  const copyRoomCode = useCallback(() => {
    if (!roomCode) return
    navigator.clipboard.writeText(roomCode).then(() => showToast(`📋 房间码 ${roomCode} 已复制`)).catch(() => prompt('复制房间码：', roomCode))
  }, [roomCode, showToast])

  const toggleMute = useCallback(() => {
    setMuted(m => { localStorage.setItem('chat_muted', m ? '0' : '1'); return !m })
  }, [])

  const statusColor = { disconnected: 'bg-gray-400', connecting: 'bg-yellow-400 animate-pulse', ok: 'bg-green-400', err: 'bg-red-400' }[status]

  // ---- 登录页 ----
  if (!inRoom) {
    return (
      <div className={`${darkMode ? 'dark' : ''} h-dvh flex items-center justify-center bg-gray-100 dark:bg-black`}>
        <div className="w-full max-w-sm mx-4 bg-white/85 dark:bg-zinc-900/90 backdrop-blur-xl border border-black/10 dark:border-white/15 rounded-3xl p-8 shadow-2xl">
          <div className="flex justify-end mb-1">
            <button onClick={() => setDarkMode(d => !d)} className="text-xl p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">💬</div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1">哈吉米德的聊天室</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">EMQX Cloud · 国内专属节点 · TLS 加密</p>
          </div>

          <input
            className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/15 bg-white/70 dark:bg-zinc-800 text-gray-900 dark:text-white text-base outline-none focus:border-blue-500 transition-colors mb-3 text-center"
            placeholder="你的昵称"
            maxLength={12}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateRoom()}
          />

          <div className="flex gap-2 mb-3">
            <button onClick={handleCreateRoom} className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors">
              新建房间
            </button>
            <button onClick={() => setShowJoin(j => !j)} className="flex-1 py-3 rounded-xl bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/15 text-gray-900 dark:text-white font-semibold transition-colors">
              加入房间
            </button>
          </div>

          {showJoin && (
            <div className="mt-2">
              <input
                className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/15 bg-white/70 dark:bg-zinc-800 text-gray-900 dark:text-white text-base outline-none focus:border-blue-500 transition-colors mb-2 text-center tracking-widest uppercase"
                placeholder="输入6位房间码"
                maxLength={6}
                value={roomInput}
                onChange={e => setRoomInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
              />
              <button onClick={handleJoinRoom} className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold transition-colors">
                进入房间
              </button>
            </div>
          )}

          {savedRoom && (
            <button
              onClick={() => { setRoomInput(savedRoom); setShowJoin(true) }}
              className="w-full mt-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-500 transition-colors"
            >
              最近房间：{savedRoom}
            </button>
          )}

          <div className="mt-5 pt-4 border-t border-black/10 dark:border-white/10 text-center text-xs text-gray-400">
            服务器: u5111311.ala.cn-hangzhou.emqxsl.cn
          </div>
        </div>
      </div>
    )
  }

  // ---- 聊天页 ----
  return (
    <div className={`${darkMode ? 'dark' : ''} h-dvh flex flex-col bg-gray-100 dark:bg-black`}>
      {/* Toast */}
      {toast && (
        <div className="toast-anim fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md border border-black/10 dark:border-white/15 rounded-full text-sm text-gray-800 dark:text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* 图片全屏预览 */}
      {imgViewer && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center" onClick={() => setImgViewer(null)}>
          <img src={imgViewer} className="max-w-[95vw] max-h-[95vh] rounded-lg object-contain" alt="预览" />
        </div>
      )}

      {/* 顶栏 */}
      <header className="flex items-center justify-between px-4 py-3 bg-white/85 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-black/10 dark:border-white/15 flex-shrink-0">
        <button onClick={copyRoomCode} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-zinc-800 border border-black/10 dark:border-white/15 rounded-full text-xs font-bold text-gray-800 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
          房间 {roomCode}
          {unread > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{unread}</span>}
        </button>

        {/* 在线用户头像 */}
        <div className="flex items-center gap-1 flex-1 justify-center overflow-hidden px-2">
          {[{ id: user.id, name: user.name, color: user.color }, ...onlineUsers].slice(0, 6).map(u => (
            <div key={u.id} title={u.name} className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm" style={{ background: u.color }}>
              {u.name.slice(0, 1).toUpperCase()}
            </div>
          ))}
          {onlineUsers.length > 5 && <span className="text-xs text-gray-400 dark:text-gray-500">+{onlineUsers.length - 5}</span>}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={toggleMute} title={muted ? '开启音效' : '静音'} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-base">
            {muted ? '🔇' : '🔔'}
          </button>
          <button onClick={() => setDarkMode(d => !d)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-base">
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button onClick={manualReconnect} title="重连" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-500 dark:text-gray-400 font-bold">
            ↻
          </button>
          <button onClick={handleExit} className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors">
            退出
          </button>
        </div>
      </header>

      {/* 消息列表 */}
      <div ref={msgListRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.map(msg => {
          if (msg.type === 'sys') {
            return (
              <div key={msg.id} className="msg-anim self-center text-xs text-gray-400 dark:text-gray-500 bg-black/5 dark:bg-white/5 px-3 py-1 rounded-full max-w-[90%] text-center">
                {msg.text}
              </div>
            )
          }
          return (
            <div key={msg.id} className={`msg-anim flex flex-col max-w-[80%] ${msg.isSelf ? 'self-end items-end' : 'self-start items-start'}`}>
              {!msg.isSelf && (
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: msg.senderColor }}>
                    {msg.senderName.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{msg.senderName}</span>
                </div>
              )}
              <div className={`group relative rounded-2xl overflow-hidden ${
                msg.isSelf
                  ? 'bg-blue-500 text-white rounded-br-sm'
                  : 'bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 text-gray-900 dark:text-white rounded-bl-sm shadow-sm'
              }`}>
                {msg.type === 'text' && (
                  <div className="px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words select-text">
                    {msg.text}
                  </div>
                )}
                {msg.type === 'image' && msg.fileUrl && (
                  <img
                    src={msg.fileUrl}
                    alt={msg.fileName}
                    className="max-w-[200px] max-h-[280px] object-cover cursor-pointer block"
                    onClick={() => setImgViewer(msg.fileUrl!)}
                  />
                )}
                {msg.type === 'file' && (
                  <div className="flex items-center gap-3 px-3 py-2.5 min-w-[160px]">
                    <span className="text-2xl">📄</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{msg.fileName}</div>
                      <div className="text-xs opacity-70">{msg.fileSize ? (msg.fileSize > 1048576 ? (msg.fileSize / 1048576).toFixed(1) + ' MB' : (msg.fileSize / 1024).toFixed(0) + ' KB') : ''}</div>
                    </div>
                    {msg.fileUrl && (
                      <a href={msg.fileUrl} download={msg.fileName} className="text-xs underline opacity-80 flex-shrink-0">下载</a>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 px-1">
                {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )
        })}

        {/* 正在输入 */}
        {typingUsers.length > 0 && (
          <div className="msg-anim self-start flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 rounded-2xl rounded-bl-sm shadow-sm">
            <span className="text-xs text-gray-500 dark:text-gray-400">{typingUsers.join('、')} 正在输入</span>
            <span className="flex gap-1 text-gray-400">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </span>
          </div>
        )}
      </div>

      {/* 表情面板 */}
      {showEmoji && (
        <div className="flex-shrink-0 px-3 py-2 bg-white/90 dark:bg-zinc-900/90 border-t border-black/10 dark:border-white/10 flex flex-wrap gap-1">
          {EMOJIS.map(e => (
            <button key={e} onClick={() => { setInputText(t => t + e); setShowEmoji(false); inputRef.current?.focus() }}
              className="text-xl p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
              {e}
            </button>
          ))}
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex-shrink-0 flex items-end gap-2 px-3 py-3 bg-white/85 dark:bg-zinc-900/90 backdrop-blur-xl border-t border-black/10 dark:border-white/15">
        <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-xl flex-shrink-0" title="发送文件">
          📎
        </button>
        <button onClick={() => setShowEmoji(s => !s)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-xl flex-shrink-0" title="表情">
          😊
        </button>
        <textarea
          ref={inputRef}
          className="flex-1 min-h-[40px] max-h-[100px] px-3 py-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white text-base outline-none focus:border-blue-500 transition-colors resize-none leading-snug"
          placeholder={status === 'ok' ? '输入消息... (Ctrl+V 粘贴图片)' : status === 'connecting' ? '正在连接...' : '连接失败，点击 ↻ 重连'}
          disabled={status !== 'ok'}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={status !== 'ok' || !inputText.trim()}
          className="px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex-shrink-0"
        >
          发送
        </button>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" accept="*/*" onChange={handleFileChange} />
    </div>
  )
}
