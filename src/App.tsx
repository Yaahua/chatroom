import { useState, useEffect, useRef, useCallback } from 'react'
import { useMqtt, pickColor } from './useMqtt'
import MusicPlayer from './MusicPlayer'
import { useSound } from './useSound'
import { useAI, hasAtAI, hasAtKimi, AI_ID, AI_NAME, AI_COLOR, KIMI_ID, KIMI_NAME, KIMI_COLOR } from './useAI'
import type { User, ChatMessage } from './types'

import { LoginView } from './components/LoginView'
import { ChatHeader } from './components/ChatHeader'
import { MessageList } from './components/MessageList'
import { InputBar } from './components/InputBar'
import { Modals } from './components/Modals'
import { FocusOverlay } from './components/FocusOverlay'

// ─── 追踪 visualViewport 高度，修复移动端键盘弹出时布局崩塌 ─────────────────
// iOS/Android 键盘弹出时 window.innerHeight 不会缩小，但 visualViewport.height 会
// 通过 CSS 变量 --app-height 让 .chat-root 始终等于真实可视区域高度
function useVisualViewportHeight() {
  useEffect(() => {
    const update = () => {
      const vv = window.visualViewport
      if (!vv) return
      // 键盘弹出时 vv.height < window.innerHeight，用真实高度覆盖 CSS 变量
      // 键盘收起时恢复为 100%（让 bottom:0 接管）
      const keyboardOpen = vv.height < window.innerHeight * 0.9
      if (keyboardOpen) {
        document.documentElement.style.setProperty('--app-height', `${vv.height}px`)
      } else {
        document.documentElement.style.setProperty('--app-height', '100%')
      }
    }
    update()
    window.visualViewport?.addEventListener('resize', update)
    window.addEventListener('resize', update)
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.removeEventListener('resize', update)
    }
  }, [])
}

export default function App() {
  const [savedName] = useState(() => localStorage.getItem('chat_name') || '')
  const [savedRoom] = useState(() => localStorage.getItem('chat_room') || '')

  // 修复键盘弹出时布局崩塌
  useVisualViewportHeight()

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
  const [mentionCount, setMentionCount] = useState(0)  // 被 @ 的未读数
  const [focused, setFocused] = useState(true)

  const [replyTarget, setReplyTarget] = useState<{ id: string; senderName: string; text?: string; type: string } | null>(null)
  const [longPressId, setLongPressId] = useState<string | null>(null)
  const [focusedMsg, setFocusedMsg] = useState<ChatMessage | null>(null)

  // AI 状态：
  //   null         — 空闲
  //   { id, phase: 'thinking' }  — 已注入占位消息，等待第一个 chunk
  //   { id, phase: 'streaming' } — 正在流式输出
  const [aiState, setAiState] = useState<{ id: string; phase: 'thinking' | 'streaming' } | null>(null)

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
      setMentionCount(0)
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

  // 新消息音效 & 未读计数（排除 AI 消息，AI 完成后统一播放）
  useEffect(() => {
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    if (messages.length > prevMsgCount.current) {
      // B8 修复：同时排除 DeepSeek 和 Kimi 的消息（AI 完成后统一在 onDone 里播放）
      if (last.type !== 'sys' && last.senderId !== AI_ID && last.senderId !== KIMI_ID) {
        if (last.isSelf) {
          playSend()
        } else {
          // 判断自己是否被 @（匹配昵称）
          const isMentioned = !!(last.mentions && last.mentions.includes(user.name))
          playReceive()
          if (!focused) {
            setTimeout(() => {
              if (isMentioned) {
                // 被 @ 时：单独计数，标题显示 [@]
                setMentionCount(n => {
                  const next = n + 1
                  setUnread(u => {
                    document.title = `[@${next}](${u + 1}) 哈吉米德的聊天室`
                    return u + 1
                  })
                  return next
                })
              } else {
                setUnread(n => {
                  const next = n + 1
                  setMentionCount(m => {
                    if (m > 0) {
                      document.title = `[@${m}](${next}) 哈吉米德的聊天室`
                    } else {
                      document.title = `(${next}) 哈吉米德的聊天室`
                    }
                    return m
                  })
                  return next
                })
              }
            }, 0)
          }
        }
      }
      prevMsgCount.current = messages.length
    }
  }, [messages, focused, user.name, playSend, playReceive])

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

  // #22 修复：已处理消息 ID 集合（必须在 doExit 之前声明）
  const aiHandledIdsRef = useRef<Set<string>>(new Set())
  const clearAiHandledIds = useCallback(() => {
    aiHandledIdsRef.current = new Set()
  }, [])

  const doExit = useCallback(() => {
    setShowExitModal(false)
    abortAI()
    disconnect()
    setInRoom(false)
    setRoomCode(null)
    prevMsgCount.current = 0
    setUnread(0)
    setMentionCount(0)
    setAiState(null)
    clearAiHandledIds()        // #22: 清空内存中的已处理 ID（localStorage 保留）
    lastAiTriggerIdRef.current = null
    document.title = '哈吉米德的聊天室'
  }, [disconnect, abortAI, clearAiHandledIds])

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
  // aiHandledIdsRef 已在上方 doExit 前声明
  const lastAiTriggerIdRef = useRef<string | null>(null)
  const isStreamingRef = useRef(false)

  // 进入房间时从 localStorage 恢复已处理 ID 集合
  useEffect(() => {
    if (!inRoom || !roomCode) return
    try {
      const raw = localStorage.getItem(`ai_handled_${roomCode}`)
      if (raw) {
        const ids: string[] = JSON.parse(raw)
        aiHandledIdsRef.current = new Set(ids)
      } else {
        aiHandledIdsRef.current = new Set()
      }
    } catch {
      aiHandledIdsRef.current = new Set()
    }
  }, [inRoom, roomCode])

  useEffect(() => {
    if (!inRoom) return

    // 构建所有 AI 消息 ID 集合（DeepSeek + Kimi），用于判断「回复 AI 消息」触发
    const allAiSenderIds = new Set([AI_ID, KIMI_ID])
    const aiMsgIds = new Set(
      messagesRef.current.filter(m => allAiSenderIds.has(m.senderId)).map(m => m.id)
    )
    // 同时记录每条 AI 消息对应的 AI 类型，用于回复时路由
    const aiMsgTypeMap = new Map<string, 'deepseek' | 'kimi'>(
      messagesRef.current
        .filter(m => allAiSenderIds.has(m.senderId))
        .map(m => [m.id, m.senderId === KIMI_ID ? 'kimi' : 'deepseek'])
    )

    // 从最新消息往前找触发消息
    // 条件 1：用户主动 @AI 或 @Kimi
    // 条件 2：用户回复了某个 AI 的消息
    const triggerMsg = [...messages]
      .reverse()
      .find(m => {
        if (m.type !== 'text' || !m.text || allAiSenderIds.has(m.senderId)) return false
        const isAtAI   = hasAtAI(m.text)
        const isAtKimi = hasAtKimi(m.text)
        const isReplyToAI = !!(m.replyTo && aiMsgIds.has(m.replyTo.id))
        return isAtAI || isAtKimi || isReplyToAI
      })

    if (!triggerMsg) return
    if (triggerMsg.id === lastAiTriggerIdRef.current) return
    if (aiHandledIdsRef.current.has(triggerMsg.id)) return
    if (isStreamingRef.current) return

    lastAiTriggerIdRef.current = triggerMsg.id
    aiHandledIdsRef.current.add(triggerMsg.id)
    try {
      const ids = Array.from(aiHandledIdsRef.current).slice(-200)
      localStorage.setItem(`ai_handled_${roomCode}`, JSON.stringify(ids))
    } catch { /* localStorage 满了忽略 */ }
    isStreamingRef.current = true

    const triggerUserName = triggerMsg.senderName

    // 判断路由到哪个 AI
    const isKimiTrigger = hasAtKimi(triggerMsg.text!) ||
      !!(triggerMsg.replyTo && aiMsgTypeMap.get(triggerMsg.replyTo.id) === 'kimi')
    const aiType: 'deepseek' | 'kimi' = isKimiTrigger ? 'kimi' : 'deepseek'
    const placeholderSenderId    = isKimiTrigger ? KIMI_ID    : AI_ID
    const placeholderSenderName  = isKimiTrigger ? KIMI_NAME  : AI_NAME
    const placeholderSenderColor = isKimiTrigger ? KIMI_COLOR : AI_COLOR

    const placeholderId = Math.random().toString(36).slice(2, 11)
    const placeholder: ChatMessage = {
      id: placeholderId,
      type: 'text',
      senderId: placeholderSenderId,
      senderName: placeholderSenderName,
      senderColor: placeholderSenderColor,
      text: '',
      ts: Date.now(),
      isSelf: false,
      readStatus: 'delivered',
      replyTo: {
        id: triggerMsg.id,
        senderName: triggerUserName,
        text: triggerMsg.text,
        type: 'text',
      },
    }
    injectLocalMessage(placeholder)
    setTimeout(() => setAiState({ id: placeholderId, phase: 'thinking' }), 0)

    const contextSnapshot = messagesRef.current.filter(m => m.id !== placeholderId)
    askAI(
      triggerMsg.text!,
      triggerUserName,
      contextSnapshot,
      (delta) => {
        if (delta === '\x00FIRST\x00') {
          setAiState({ id: placeholderId, phase: 'streaming' })
          return
        }
        if (delta.startsWith('\x00REASONING\x00')) {
          // 思考过程更新（直接替换整个 reasoning 字段）
          const reasoning = delta.slice('\x00REASONING\x00'.length)
          updateLocalMessage(placeholderId, prev => ({ ...prev, reasoning }))
          return
        }
        if (delta.startsWith('\x00CONTENT\x00')) {
          // 正式回答增量
          const piece = delta.slice('\x00CONTENT\x00'.length)
          updateLocalMessage(placeholderId, prev => ({
            ...prev,
            text: (prev.text ?? '') + piece,
          }))
          return
        }
        // 兴趣模型（DeepSeek）无前缀，直接追加到 text
        updateLocalMessage(placeholderId, prev => ({
          ...prev,
          text: (prev.text ?? '') + delta,
        }))
      },
      () => {
        isStreamingRef.current = false
        setAiState(null)
        playReceive()
      },
      (err) => {
        isStreamingRef.current = false
        updateLocalMessage(placeholderId, prev => ({
          ...prev,
          text: `⚠️ ${err}`,
        }))
        setAiState(null)
        showToast(`AI：${err}`)
      },
      triggerUserName,
      { aiType }
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, inRoom, askAI, playReceive, showToast])

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
          selfName={user.name}
        />
      )}

      <div className="chat-inner">
        <ChatHeader
          roomCode={roomCode}
          status={status}
          unread={unread}
          mentionCount={mentionCount}
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
          aiState={aiState}
          selfName={user.name}
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
          aiThinking={!!aiState}
        />
      </div>
    </div>
  )
}
