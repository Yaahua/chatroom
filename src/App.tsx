import { useState, useEffect, useRef, useCallback } from 'react'
import { useMqtt, pickColor } from './useMqtt'
import MusicPlayer from './MusicPlayer'
import { useSound } from './useSound'
import { useAI, hasAtAI, AI_ID, AI_NAME, AI_COLOR } from './useAI'
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

  // AI 流式回复状态：存储正在生成中的消息 ID
  const [aiStreamingId, setAiStreamingId] = useState<string | null>(null)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevMsgCount = useRef(0)
  const messagesRef = useRef<ChatMessage[]>([])

  const {
    status, messages, onlineUsers, typingUsers, logs,
    connect, disconnect, sendText, sendTyping, sendFile, sendVoice,
    sendRead, sendRecall, manualReconnect, clearLogs,
    injectLocalMessage, updateLocalMessage
  } = useMqtt(user, roomCode)

  const { askAI, abortAI } = useAI()

  // 始终保持 messagesRef 与 messages 同步，供 AI 上下文快照使用
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

  // 新消息到达时播放音效 & 更新未读计数
  // 排除 AI 消息的音效（AI 完成后统一在 onDone 中播放一次）
  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    if (messages.length > prevMsgCount.current) {
      if (last.type !== 'sys' && last.senderId !== AI_ID) {
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
    abortAI()
    disconnect()
    setInRoom(false)
    setRoomCode(null)
    prevMsgCount.current = 0
    setUnread(0)
    setAiStreamingId(null)
    document.title = '哈吉米德的聊天室'
  }, [disconnect, abortAI])

  const exportMessages = useCallback(() => {
    const exportable = messages
      .filter(m => m.type !== 'sys')
      .map(m => ({
        id: m.id, type: m.type, senderId: m.senderId,
        senderName: m.senderName, text: m.text,
        fileUrl: m.fileUrl, fileName: m.fileName, fileSize: m.fileSize,
        duration: m.duration, ts: m.ts,
        tsFormatted: new Date(m.ts).toLocaleString(),
        isSelf: m.isSelf, readStatus: m.readStatus,
        recalled: m.recalled, replyTo: m.replyTo,
      }))
    const payload = JSON.stringify({
      room: roomCode, exportedAt: new Date().toISOString(),
      messageCount: exportable.length, messages: exportable,
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

  // ─── AI 触发逻辑 ──────────────────────────────────────────────────────────────
  // 当用户发送包含 @AI 的消息后，自动触发 AI 回复
  const lastAiTriggerIdRef = useRef<string | null>(null)
  // 用 ref 跟踪是否正在流式输出，避免将 aiStreamingId state 加入 effect 依赖导致重复触发
  const isStreamingRef = useRef(false)

  useEffect(() => {
    if (!inRoom) return

    // 找最新一条自己发的、含 @AI 的文本消息
    const triggerMsg = [...messages]
      .reverse()
      .find(m => m.isSelf && m.type === 'text' && m.text && hasAtAI(m.text))

    // 同一条消息不重复触发；如果 AI 正在回复也不触发
    if (!triggerMsg || triggerMsg.id === lastAiTriggerIdRef.current) return
    if (isStreamingRef.current) return

    lastAiTriggerIdRef.current = triggerMsg.id
    isStreamingRef.current = true

    // 先注入一条"思考中"的占位消息
    const placeholderId = Math.random().toString(36).slice(2, 11)
    const placeholder: ChatMessage = {
      id: placeholderId,
      type: 'text',
      senderId: AI_ID,
      senderName: AI_NAME,
      senderColor: AI_COLOR,
      text: '…',
      ts: Date.now(),
      isSelf: false,
      readStatus: 'delivered',
    }
    injectLocalMessage(placeholder)
    // 延迟一帧设置 streaming ID，避免在 effect 中同步 setState
    setTimeout(() => setAiStreamingId(placeholderId), 0)

    // 使用当前 messages 的快照（过滤占位消息）作为上下文，避免闭包陈旧
    const contextSnapshot = messagesRef.current.filter(m => m.id !== placeholderId)
    askAI(
      triggerMsg.text!,
      user.name,
      contextSnapshot,
      // onChunk：逐步更新占位消息的文本
      (delta) => {
        updateLocalMessage(placeholderId, prev => ({
          ...prev,
          text: (prev.text === '…' ? '' : prev.text ?? '') + delta,
        }))
      },
      // onDone：完成后清除 streaming 状态，播放一次提示音
      () => {
        isStreamingRef.current = false
        setAiStreamingId(null)
        playReceive()
      },
      // onError：显示错误信息
      (err) => {
        isStreamingRef.current = false
        updateLocalMessage(placeholderId, prev => ({
          ...prev,
          text: `⚠️ AI 回复失败：${err}`,
        }))
        setAiStreamingId(null)
        showToast(`AI 错误：${err}`)
      }
    )
  // 故意不将 aiStreamingId 加入依赖，改用 isStreamingRef 判断，避免重复触发
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, inRoom, askAI, user.name, playReceive, showToast])

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
          aiStreamingId={aiStreamingId}
        />

        <InputBar
          status={status}
          onlineUsers={onlineUsers}
          self={user}
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
