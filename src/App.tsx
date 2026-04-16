import { useState, useEffect, useRef, useCallback } from 'react'
import { useMqtt, pickColor } from './useMqtt'
import MusicPlayer from './MusicPlayer'
import { useSound } from './useSound'
import type { User, ChatMessage } from './types'

// 拆分出的组件
import { LoginView } from './components/LoginView'
import { ChatHeader } from './components/ChatHeader'
import { MessageList } from './components/MessageList'
import { InputBar } from './components/InputBar'
import { Modals } from './components/Modals'
import { FocusOverlay } from './components/FocusOverlay'

export default function App() {
  const [savedName] = useState(() => localStorage.getItem('chat_name') || '')
  const [savedRoom] = useState(() => localStorage.getItem('chat_room') || '')

  const [inRoom, setInRoom] = useState(false)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [user, setUser] = useState<User>(() => ({ id: Math.random().toString(36).slice(2, 11), name: '', color: '' }))
  const [muted, setMuted] = useState(() => localStorage.getItem('chat_muted') === '1')
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('chat_theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const [showOnlineModal, setShowOnlineModal] = useState(false)
  const [showLogPanel, setShowLogPanel] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [imgViewer, setImgViewer] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [focused, setFocused] = useState(true)

  // 引用回复状态
  const [replyTarget, setReplyTarget] = useState<{ id: string; senderName: string; text?: string; type: string } | null>(null)
  // 长按选中的消息 ID
  const [longPressId, setLongPressId] = useState<string | null>(null)
  // 聚焦沉浸模式
  const [focusedMsg, setFocusedMsg] = useState<ChatMessage | null>(null)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevMsgCount = useRef(0)
  const messagesRef = useRef<ChatMessage[]>([])

  const { status, messages, onlineUsers, typingUsers, logs, connect, disconnect, sendText, sendTyping, sendFile, sendVoice, sendRead, sendRecall, manualReconnect, clearLogs } = useMqtt(user, roomCode)

  useEffect(() => { messagesRef.current = messages }, [messages])

  const { playSend, playReceive } = useSound(muted)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('chat_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    document.body.classList.toggle('page-chat', inRoom)
    document.body.classList.toggle('page-login', !inRoom)
  }, [inRoom])

  useEffect(() => {
    const onFocus = () => {
      setFocused(true)
      setUnread(0)
      document.title = '哈吉米德的聊天室'
      const unreadIds = messagesRef.current
        .filter(m => !m.isSelf && m.type !== 'sys' && m.readStatus !== 'read')
        .map(m => m.id)
      if (unreadIds.length > 0) sendRead(unreadIds)
    }
    const onBlur = () => setFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur) }
  }, [sendRead])

  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    if (messages.length > prevMsgCount.current) {
      if (last.type !== 'sys') {
        if (last.isSelf) playSend()
        else {
          playReceive()
          if (!focused) {
            setTimeout(() => {
              setUnread(n => {
                const next = n + 1
                document.title = `(${next}) 哈吉米德的聊天室`
                return next
              })
            }, 0)
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
    const u: User = { id: Math.random().toString(36).slice(2, 11), name: trimName, color }
    setUser(u)
    setRoomCode(trimCode)
    setInRoom(true)
    localStorage.setItem('chat_name', trimName)
    localStorage.setItem('chat_room', trimCode)
  }, [])

  useEffect(() => {
    if (inRoom && roomCode && user.name) connect()
  }, [inRoom, roomCode, user, connect])

  const doExit = useCallback(() => {
    setShowExitModal(false)
    disconnect()
    setInRoom(false)
    setRoomCode(null)
    prevMsgCount.current = 0
    setUnread(0)
    document.title = '哈吉米德的聊天室'
  }, [disconnect])

  const exportMessages = useCallback(() => {
    const exportable = messages
      .filter(m => m.type !== 'sys')
      .map(m => ({
        id: m.id,
        type: m.type,
        senderId: m.senderId,
        senderName: m.senderName,
        text: m.text,
        fileUrl: m.fileUrl,
        fileName: m.fileName,
        fileSize: m.fileSize,
        duration: m.duration,
        ts: m.ts,
        tsFormatted: new Date(m.ts).toLocaleString(),
        isSelf: m.isSelf,
        readStatus: m.readStatus,
        recalled: m.recalled,
        replyTo: m.replyTo,
      }))
    const payload = JSON.stringify({
      room: roomCode,
      exportedAt: new Date().toISOString(),
      messageCount: exportable.length,
      messages: exportable,
    }, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat_${roomCode}_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast(`导出 ${exportable.length} 条记录`)
  }, [messages, roomCode, showToast])

  if (!inRoom) {
    return (
      <LoginView
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        savedName={savedName}
        savedRoom={savedRoom}
        onEnterRoom={handleEnterRoom}
      />
    )
  }

  return (
    <div className="chat-root">
      {toast && <div className="toast-wrap toast-anim">{toast}</div>}
      <MusicPlayer muted={muted} />

      <Modals
        showOnlineModal={showOnlineModal}
        setShowOnlineModal={setShowOnlineModal}
        onlineUsers={onlineUsers}
        user={user}
        showLogPanel={showLogPanel}
        setShowLogPanel={setShowLogPanel}
        logs={logs}
        clearLogs={clearLogs}
        showExitModal={showExitModal}
        setShowExitModal={setShowExitModal}
        doExit={doExit}
        imgViewer={imgViewer}
        setImgViewer={setImgViewer}
      />

      {focusedMsg && (
        <FocusOverlay
          focusedMsg={focusedMsg}
          setFocusedMsg={setFocusedMsg}
          setLongPressId={setLongPressId}
          setReplyTarget={setReplyTarget}
          sendRecall={sendRecall}
          setImgViewer={setImgViewer}
          showToast={showToast}
        />
      )}

      <div className="chat-inner">
        <ChatHeader
          roomCode={roomCode}
          status={status}
          unread={unread}
          onlineUsers={onlineUsers}
          user={user}
          muted={muted}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          toggleMute={() => setMuted(m => { localStorage.setItem('chat_muted', m ? '0' : '1'); return !m })}
          setShowOnlineModal={setShowOnlineModal}
          setShowLogPanel={setShowLogPanel}
          setShowExitModal={setShowExitModal}
          manualReconnect={manualReconnect}
          exportMessages={exportMessages}
          showToast={showToast}
        />

        <MessageList
          messages={messages}
          typingUsers={typingUsers}
          longPressId={longPressId}
          setLongPressId={setLongPressId}
          setFocusedMsg={setFocusedMsg}
          setReplyTarget={setReplyTarget}
          setImgViewer={setImgViewer}
        />

        <InputBar
          status={status}
          sendText={sendText}
          sendTyping={sendTyping}
          sendFile={sendFile}
          sendVoice={sendVoice}
          replyTarget={replyTarget}
          setReplyTarget={setReplyTarget}
          setLongPressId={setLongPressId}
          setShowLogPanel={setShowLogPanel}
        />
      </div>
    </div>
  )
}
