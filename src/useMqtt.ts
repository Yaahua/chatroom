import { useRef, useState, useCallback, useEffect } from 'react'
import mqtt from 'mqtt'
import type { MqttClient } from 'mqtt'
import { CONFIG, BROKERS } from './config'
import type {
  ConnStatus, User, ChatMessage, OnlineUser,
  MqttTextMsg, MqttTypingMsg, MqttPresenceMsg, MqttFileMsg
} from './types'

// 已读回执 MQTT 消息类型
interface MqttReadMsg {
  type: 'read'
  senderId: string
  msgIds: string[]  // 已读的消息 ID 列表
}

// 安全的 base64 编码：避免展开运算符导致大数组栈溢出
function safeBase64Encode(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'
export interface LogEntry {
  id: string
  level: LogLevel
  msg: string
  ts: number
}

const COLORS = ['#C4956A','#9B7E5A','#7D6E52','#B8956A','#A07850','#C8A87A','#8B6E4E','#D4A574']
export function pickColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xFFFFFF
  return COLORS[h % COLORS.length]
}

// ─── 消息缓存工具 ───────────────────────────────────────────────────────────
const CACHE_MAX = 100  // 最多缓存 100 条

/** 从 localStorage 读取历史消息（过滤掉 sys 消息，不持久化系统提示） */
function loadCachedMessages(roomCode: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`chat_history_${roomCode}`)
    if (!raw) return []
    const msgs: ChatMessage[] = JSON.parse(raw)
    return msgs.filter(m => m.type !== 'sys')
  } catch {
    return []
  }
}

/** 将消息列表写入 localStorage（只保留最近 CACHE_MAX 条非 sys 消息） */
function saveCachedMessages(roomCode: string, msgs: ChatMessage[]) {
  try {
    const toSave = msgs.filter(m => m.type !== 'sys').slice(-CACHE_MAX)
    localStorage.setItem(`chat_history_${roomCode}`, JSON.stringify(toSave))
  } catch {
    // 存储满了忽略
  }
}

export function useMqtt(user: User, roomCode: string | null) {
  const clientRef = useRef<MqttClient | null>(null)
  const [status, setStatus] = useState<ConnStatus>('disconnected')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [activeBrokerIndex, setActiveBrokerIndex] = useState(0)

  const reconnectAttempts = useRef(0)
  const brokerIndexRef = useRef(0)
  const connectToBrokerRef = useRef<(idx: number) => void>(() => {})
  // 是否是首次进入房间（区分首次连接和重连，避免重连时重复刷屏“已进入房间”）
  const isFirstConnectRef = useRef(true)
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  // 幽灵在线方案一：心跳超时剔除定时器
  const presenceCleanupTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  // 主动断开标志：防止 close 事件在主动断开时误触发重连
  const intentionalDisconnectRef = useRef(false)
  // 已接收消息 ID 集合：防止重连后重复消息
  const receivedMsgIdsRef = useRef<Set<string>>(new Set())
  // 跟踪所有创建的 ObjectURL，组件卸载时统一释放
  const objectUrlsRef = useRef<string[]>([])

  const addLog = useCallback((level: LogLevel, msg: string) => {
    const entry: LogEntry = { id: Math.random().toString(36).slice(2), level, msg, ts: Date.now() }
    setLogs(prev => [...prev.slice(-199), entry])
    if (level === 'error') console.error(`[chatroom] ${msg}`)
    else if (level === 'warn') console.warn(`[chatroom] ${msg}`)
    else console.log(`[chatroom][${level}] ${msg}`)
  }, [])

  const clearLogs = useCallback(() => setLogs([]), [])

  const addSysMsg = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      type: 'sys', senderId: '', senderName: '', senderColor: '',
      text, ts: Date.now(), isSelf: false
    }])
  }, [])

  const publish = useCallback((topic: string, payload: object, retained = false) => {
    if (!clientRef.current?.connected) return
    clientRef.current.publish(topic, JSON.stringify(payload), { qos: 1, retain: retained })
  }, [])

  // ─── 消息缓存：每次 messages 变化时同步写入 localStorage ────────────────
  useEffect(() => {
    if (!roomCode || messages.length === 0) return
    saveCachedMessages(roomCode, messages)
  }, [messages, roomCode])

  // ─── 消息缓存：发布 MQTT retained 历史快照 ──────────────────────────────
  const publishHistorySnapshot = useCallback((msgs: ChatMessage[]) => {
    if (!roomCode) return
    const toSave = msgs
      .filter(m => m.type !== 'sys' && m.type !== 'image' && m.type !== 'file' && m.type !== 'voice')
      .slice(-50)
      .map(m => ({ id: m.id, type: m.type, senderId: m.senderId, senderName: m.senderName, senderColor: m.senderColor, text: m.text, ts: m.ts, isSelf: false }))
    if (toSave.length === 0) return
    publish(`chat/${roomCode}/history`, { msgs: toSave, updatedAt: Date.now() }, true)
  }, [roomCode, publish])

  const connectToBroker = useCallback((brokerIdx: number) => {
    if (!roomCode) return
    const broker = BROKERS[brokerIdx]
    brokerIndexRef.current = brokerIdx
    setActiveBrokerIndex(brokerIdx)

    const clientId = `chat_${user.id}_${Date.now().toString(36)}`
    addLog('info', `正在连接 ${broker.label}... clientId=${clientId}`)

    // 幽灵在线方案二：LWT 遗嘱消息
    // 当客户端异常断线时，Broker 会自动广播此消息，其他用户立即知道该用户已离线
    const willPayload = JSON.stringify({
      type: 'leave',
      senderId: user.id,
      senderName: user.name,
      senderColor: user.color
    })
    const client = mqtt.connect(broker.url, {
      clientId,
      username: broker.username,
      password: broker.password,
      clean: true,
      keepalive: 60,
      connectTimeout: 15000,
      reconnectPeriod: 0,
      protocolVersion: 5,
      properties: { sessionExpiryInterval: CONFIG.SESSION_EXPIRY },
      // LWT: 异常断线时 Broker 自动发布离开消息
      will: {
        topic: `chat/${roomCode}/presence`,
        payload: willPayload,
        qos: 1 as const,
        retain: false
      }
    })
    clientRef.current = client
    setStatus('connecting')

    client.on('connect', () => {
      reconnectAttempts.current = 0
      addLog('info', `已连接到 ${broker.label}，订阅房间 ${roomCode}`)
      const topics = [
        `chat/${roomCode}/msg`,
        `chat/${roomCode}/file`,
        `chat/${roomCode}/presence`,
        `chat/${roomCode}/typing`,
        `chat/${roomCode}/voice`,
        `chat/${roomCode}/history`,  // 订阅历史快照（retained）
        `chat/${roomCode}/read`,      // 已读回执
        `chat/${roomCode}/recall`,    // 消息撤回
      ]
      client.subscribe(topics, { qos: 1 }, (err) => {
        if (err) {
          addLog('error', `订阅失败: ${err.message}`)
          setStatus('err')
          return
        }
        setStatus('ok')
        addLog('info', `订阅成功，共 ${topics.length} 个 topic`)
        publish(`chat/${roomCode}/presence`, {
          type: 'join', senderId: user.id,
          senderName: user.name, senderColor: user.color
        })
        // 首次连接显示“已进入房间”，重连只显示“已重新连接”，避免刷屏
        if (isFirstConnectRef.current) {
          isFirstConnectRef.current = false
          addSysMsg(`已进入房间 ${roomCode}`)
          if (brokerIdx > 0) {
            addSysMsg(`当前使用备用节点（${broker.label}）`)
          }
        } else {
          addSysMsg('已重新连接')
        }
        // B6 修复：创建新定时器前先清除旧的，防止重连时心跳频率翻倍
        if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
        heartbeatTimer.current = setInterval(() => {
          publish(`chat/${roomCode}/presence`, {
            type: 'heartbeat', senderId: user.id,
            senderName: user.name, senderColor: user.color
          })
        }, 20000)

        // 幽灵在线方案一：心跳超时剔除
        // 每 10 秒检查一次在线列表，剔除超过 60 秒没有心跳的用户
        // 心跳周期为 20s，60s = 3 个周期内没有心跳则认定已掉线
        if (presenceCleanupTimer.current) clearInterval(presenceCleanupTimer.current)
        presenceCleanupTimer.current = setInterval(() => {
          const now = Date.now()
          setOnlineUsers(prev => {
            const active = prev.filter(u => now - u.ts < 60000)
            if (active.length < prev.length) {
              addLog('info', `心跳超时，剔除 ${prev.length - active.length} 个失联用户`)
            }
            return active
          })
        }, 10000)
      })
    })

    client.on('message', (topic, payload) => {
      try {
        const msg = JSON.parse(payload.toString())

        // ── MQTT retained 历史快照 ──────────────────────────────────────
        if (topic.endsWith('/history')) {
          const remoteMsgs: ChatMessage[] = (msg.msgs || []).map((m: ChatMessage) => ({ ...m, isSelf: m.senderId === user.id }))
          if (remoteMsgs.length === 0) return
          // 合并：本地缓存 + 远端快照，去重，按时间排序
          setMessages(prev => {
            const localNonSys = prev.filter(m => m.type !== 'sys')
            const allIds = new Set(localNonSys.map(m => m.id))
            const merged = [...localNonSys]
            for (const rm of remoteMsgs) {
              if (!allIds.has(rm.id)) merged.push(rm)
            }
            merged.sort((a, b) => a.ts - b.ts)
            // 保留 sys 消息在末尾
            const sysMessages = prev.filter(m => m.type === 'sys')
            return [...merged.slice(-CACHE_MAX), ...sysMessages]
          })
          addLog('info', `收到历史快照：${remoteMsgs.length} 条`)
          return
        }

        // 已读回执处理
        if (topic.endsWith('/read')) {
          const m = msg as MqttReadMsg
          if (m.senderId === user.id) return  // 自己发的回执不处理
          setMessages(prev => prev.map(pm =>
            m.msgIds.includes(pm.id) ? { ...pm, readStatus: 'read' as const } : pm
          ))
          return
        }

        // 撤回处理（自己和他人都处理）
        if (topic.endsWith('/recall')) {
          const { msgId, senderName: recallSender } = msg as { msgId: string; senderId: string; senderName: string }
          setMessages(prev => prev.map(pm =>
            pm.id === msgId
              ? { ...pm, recalled: true, text: `${recallSender} 撤回了一条消息` }
              : pm
          ))
          addLog('info', `消息被撤回: ${msgId}`)
          return
        }

        if (msg.senderId === user.id) return

        if (topic.endsWith('/presence')) {
          const m = msg as MqttPresenceMsg
          if (m.type === 'join' || m.type === 'heartbeat') {
            setOnlineUsers(prev => {
              const filtered = prev.filter(u => u.id !== m.senderId)
              return [...filtered, { id: m.senderId, name: m.senderName, color: m.senderColor, ts: Date.now() }]
            })
            if (m.type === 'join') {
              addSysMsg(`🟢 ${m.senderName} 加入了房间`)
              addLog('info', `用户加入: ${m.senderName}`)
            }
          } else if (m.type === 'leave') {
            setOnlineUsers(prev => prev.filter(u => u.id !== m.senderId))
            addSysMsg(`🔴 ${m.senderName} 离开了房间`)
            addLog('info', `用户离开: ${m.senderName}`)
          }
        } else if (topic.endsWith('/typing')) {
          const m = msg as MqttTypingMsg
          setTypingUsers(prev => prev.includes(m.senderName) ? prev : [...prev, m.senderName])
          clearTimeout(typingTimers.current[m.senderId])
          typingTimers.current[m.senderId] = setTimeout(() => {
            setTypingUsers(prev => prev.filter(n => n !== m.senderName))
          }, CONFIG.TYPING_DEBOUNCE + 500)
        } else if (topic.endsWith('/msg')) {
          const m = msg as MqttTextMsg & { id?: string; replyTo?: ChatMessage['replyTo'] }
          const newMsgId = m.id || Math.random().toString(36).slice(2)
          // 去重：重连后同一消息不重复展示
          if (receivedMsgIdsRef.current.has(newMsgId)) return
          receivedMsgIdsRef.current.add(newMsgId)
          setMessages(prev => [...prev, {
            id: newMsgId,
            type: 'text', senderId: m.senderId,
            senderName: m.senderName, senderColor: m.senderColor,
            text: m.text, ts: m.ts, isSelf: false,
            readStatus: 'delivered' as const,
            replyTo: m.replyTo,
            ...(m.mentions && m.mentions.length > 0 ? { mentions: m.mentions } : {})
          }])
          // 自动发送已送达回执
          publish(`chat/${roomCode}/read`, { type: 'read', senderId: user.id, msgIds: [newMsgId] })
        } else if (topic.endsWith('/file')) {
          const m = msg as MqttFileMsg
          // 去重：同一文件 ID 不重复处理
          const fileId = m.id || `${m.senderId}_${m.name}_${m.size}`
          if (receivedMsgIdsRef.current.has(fileId)) return
          receivedMsgIdsRef.current.add(fileId)
          try {
            const binaryChunks = m.chunks.map(c => {
              const binStr = atob(c)
              const bytes = new Uint8Array(binStr.length)
              for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
              return bytes
            })
            const total = binaryChunks.reduce((a, c) => a + c.length, 0)
            const combined = new Uint8Array(total)
            let offset = 0
            binaryChunks.forEach(c => { combined.set(c, offset); offset += c.length })
            const mime = m.mime || 'application/octet-stream'
            const blob = new Blob([combined], { type: mime })
            const url = URL.createObjectURL(blob)
            objectUrlsRef.current.push(url)  // 跟踪以便释放
            const isImage = /image\//i.test(mime) || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(m.name)
            setMessages(prev => [...prev, {
              id: fileId,
              type: isImage ? 'image' : 'file',
              senderId: m.senderId, senderName: m.senderName, senderColor: m.senderColor,
              fileUrl: url, fileName: m.name, fileSize: m.size, fileMime: mime,
              ts: Date.now(), isSelf: false
            }])
            addLog('info', `收到文件: ${m.name} (${(m.size / 1024).toFixed(1)}KB, ${m.chunks.length} 片)`)
          } catch (e) {
            addLog('error', `文件接收失败: ${(e as Error).message}`)
          }
        } else if (topic.endsWith('/voice')) {
          try {
            const { senderId, senderName, senderColor, chunks, duration, id: voiceId } = msg
            // 去重：同一语音 ID 不重复处理
            const msgId = voiceId || `${senderId}_voice_${duration}`
            if (receivedMsgIdsRef.current.has(msgId)) return
            receivedMsgIdsRef.current.add(msgId)
            const binaryChunks = chunks.map((c: string) => {
              const binStr = atob(c)
              const bytes = new Uint8Array(binStr.length)
              for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
              return bytes
            })
            const total = binaryChunks.reduce((a: number, c: Uint8Array) => a + c.length, 0)
            const combined = new Uint8Array(total)
            let offset = 0
            binaryChunks.forEach((c: Uint8Array) => { combined.set(c, offset); offset += c.length })
            const blob = new Blob([combined], { type: 'audio/webm;codecs=opus' })
            const url = URL.createObjectURL(blob)
            objectUrlsRef.current.push(url)  // 跟踪以便释放
            setMessages(prev => [...prev, {
              id: msgId,
              type: 'voice',
              senderId, senderName, senderColor,
              fileUrl: url, duration,
              ts: Date.now(), isSelf: false
            }])
            addLog('info', `收到语音: ${senderName} (${duration}s)`)
          } catch (e) {
            addLog('error', `语音接收失败: ${(e as Error).message}`)
          }
        }
      } catch (e) {
        addLog('error', `消息解析错误: ${(e as Error).message}`)
      }
    })

    client.on('close', () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
      if (presenceCleanupTimer.current) clearInterval(presenceCleanupTimer.current)
      // 主动断开时不重连
      if (intentionalDisconnectRef.current) return
      setStatus(s => {
        if (s === 'disconnected') return s
        reconnectAttempts.current++
        const maxPerBroker = CONFIG.MAX_RECONNECT_ATTEMPTS_PER_BROKER
        if (reconnectAttempts.current > maxPerBroker) {
          const nextIdx = (brokerIndexRef.current + 1) % BROKERS.length
          if (nextIdx !== brokerIndexRef.current) {
            addLog('warn', `${BROKERS[brokerIndexRef.current].label} 连接失败，切换到 ${BROKERS[nextIdx].label}`)
            reconnectAttempts.current = 0
            client.end(true)
            setTimeout(() => connectToBrokerRef.current(nextIdx), 1000)
            return 'connecting'
          }
          addLog('error', `所有 Broker 均连接失败，停止重连`)
          return 'err'
        }
        const delay = Math.min(CONFIG.RECONNECT_BASE_DELAY * Math.pow(1.5, reconnectAttempts.current - 1), 30000)
        addLog('warn', `连接断开，${(delay / 1000).toFixed(1)}s 后重连 (${BROKERS[brokerIndexRef.current].label} 第 ${reconnectAttempts.current}/${maxPerBroker} 次)`)
        setTimeout(() => { if (!client.connected) client.reconnect() }, delay)
        return 'connecting'
      })
    })

    client.on('error', (err) => {
      addLog('error', `MQTT 错误 (${broker.label}): ${err.message}`)
      setStatus('err')
    })
  }, [roomCode, user, publish, addSysMsg, addLog])

  const connect = useCallback(() => {
    if (!roomCode) return
    if (clientRef.current?.connected) return
    reconnectAttempts.current = 0
    // 先从 localStorage 恢复历史消息，再连接
    const cached = loadCachedMessages(roomCode)
    if (cached.length > 0) {
      setMessages(cached)
      addLog('info', `从本地缓存恢复 ${cached.length} 条历史消息`)
    }
    connectToBroker(0)
  }, [roomCode, connectToBroker, addLog])

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
    if (presenceCleanupTimer.current) clearInterval(presenceCleanupTimer.current)
    setStatus('disconnected')
    if (clientRef.current && roomCode) {
      publish(`chat/${roomCode}/presence`, {
        type: 'leave', senderId: user.id,
        senderName: user.name, senderColor: user.color
      })
      // 退出前发布最终历史快照到 MQTT retained
      setMessages(prev => {
        publishHistorySnapshot(prev)
        return prev
      })
      setTimeout(() => {
        clientRef.current?.end(true)
        clientRef.current = null
      }, 300)
    }
    addLog('info', '已主动断开连接')
    setMessages([])
    setOnlineUsers([])
    setTypingUsers([])
    reconnectAttempts.current = 0
    brokerIndexRef.current = 0
    setActiveBrokerIndex(0)
    isFirstConnectRef.current = true   // 重置，下次进入房间时再次显示“已进入房间”
    receivedMsgIdsRef.current.clear()
    // 释放所有 ObjectURL
    objectUrlsRef.current.forEach(u => URL.revokeObjectURL(u))
    objectUrlsRef.current = []
    // 延迟重置，防止在 end() 回调中误进入重连分支
    setTimeout(() => { intentionalDisconnectRef.current = false }, 500)
  }, [roomCode, user, publish, addLog, publishHistorySnapshot])

  const sendText = useCallback((text: string, replyTo?: ChatMessage['replyTo']) => {
    if (!roomCode || !text.trim() || status !== 'ok') return
    const msgId = Math.random().toString(36).slice(2)
    const ts = Date.now()
    // 解析文本中所有 @昵称，注入 mentions 字段（匹配 @昵称 直到空格/标点/行尾）
    const mentionMatches = text.match(/@([^\s@]+)/g) || []
    const mentions = mentionMatches.map(m => m.slice(1)).filter(Boolean)
    publish(`chat/${roomCode}/msg`, {
      type: 'text', senderId: user.id,
      senderName: user.name, senderColor: user.color,
      text: text.trim(), ts, id: msgId,
      ...(replyTo ? { replyTo } : {}),
      ...(mentions.length > 0 ? { mentions } : {})
    })
    setMessages(prev => {
      const next = [...prev, {
        id: msgId, type: 'text' as const, senderId: user.id,
        senderName: user.name, senderColor: user.color,
        text: text.trim(), ts, isSelf: true,
        readStatus: 'sent' as const,
        ...(replyTo ? { replyTo } : {}),
        ...(mentions.length > 0 ? { mentions } : {})
      }]
      // 每发 10 条同步一次 MQTT retained 快照
      if (next.filter(m => m.type !== 'sys').length % 10 === 0) {
        setTimeout(() => publishHistorySnapshot(next), 100)
      }
      return next
    })
  }, [roomCode, user, status, publish, publishHistorySnapshot])

  // 发送已读回执（主动调用，用于展示窗口切换时批量标记已读）
  const sendRead = useCallback((msgIds: string[]) => {
    if (!roomCode || msgIds.length === 0 || !clientRef.current?.connected) return
    publish(`chat/${roomCode}/read`, { type: 'read', senderId: user.id, msgIds })
    // 同时更新本地状态
    setMessages(prev => prev.map(m =>
      msgIds.includes(m.id) && !m.isSelf ? { ...m, readStatus: 'read' as const } : m
    ))
  }, [roomCode, user, publish])

  const sendRecall = useCallback((msgId: string) => {
    if (!roomCode || !clientRef.current?.connected) return
    publish(`chat/${roomCode}/recall`, { type: 'recall', senderId: user.id, senderName: user.name, msgId })
    // 本地立即更新
    setMessages(prev => prev.map(m =>
      m.id === msgId
        ? { ...m, recalled: true, text: `${user.name} 撤回了一条消息` }
        : m
    ))
    addLog('info', `撤回消息: ${msgId}`)
  }, [roomCode, user, publish, addLog])

  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTyping = useCallback(() => {
    if (!roomCode || status !== 'ok') return
    if (typingDebounceRef.current) return
    publish(`chat/${roomCode}/typing`, {
      type: 'typing', senderId: user.id, senderName: user.name
    })
    typingDebounceRef.current = setTimeout(() => {
      typingDebounceRef.current = null
    }, CONFIG.TYPING_DEBOUNCE)
  }, [roomCode, user, status, publish])

  const sendFile = useCallback(async (file: File) => {
    if (!roomCode || status !== 'ok') return
    if (file.size > CONFIG.MAX_FILE_SIZE) { alert('文件超过 20MB 限制'); return }

    const mime = file.type || 'application/octet-stream'
    const isImage = /image\//i.test(mime) || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(file.name)
    const localUrl = URL.createObjectURL(file)
    objectUrlsRef.current.push(localUrl)  // 跟踪以便释放

    // 本地消息 ID 与 MQTT 发布 ID 保持一致，防止 broker echo 时产生重复消息
    const fileId = Math.random().toString(36).slice(2)
    receivedMsgIdsRef.current.add(fileId)  // 预注册，防止 broker echo 时重复展示

    setMessages(prev => [...prev, {
      id: fileId,
      type: isImage ? 'image' : 'file',
      senderId: user.id, senderName: user.name, senderColor: user.color,
      fileUrl: localUrl, fileName: file.name, fileSize: file.size, fileMime: mime,
      ts: Date.now(), isSelf: true
    }])

    try {
      const buffer = await file.arrayBuffer()
      const chunks: string[] = []
      const chunkSize = file.size > 1024 * 1024 ? 48 * 1024 : CONFIG.CHUNK_SIZE
      for (let i = 0; i < buffer.byteLength; i += chunkSize) {
        const slice = buffer.slice(i, i + chunkSize)
        chunks.push(safeBase64Encode(new Uint8Array(slice)))
      }
      publish(`chat/${roomCode}/file`, {
        type: 'file', senderId: user.id,
        senderName: user.name, senderColor: user.color,
        id: fileId,  // 与本地消息 ID 一致
        name: file.name, size: file.size, mime, chunks
      })
      addLog('info', `发送文件: ${file.name} (${(file.size / 1024).toFixed(1)}KB, ${chunks.length} 片)`)
    } catch (e) {
      addLog('error', `发送文件失败: ${(e as Error).message}`)
      alert('发送失败，请重试')
    }
  }, [roomCode, user, status, publish, addLog])

  const sendVoice = useCallback(async (blob: Blob, duration: number) => {
    if (!roomCode || status !== 'ok') return
    const localUrl = URL.createObjectURL(blob)
    objectUrlsRef.current.push(localUrl)  // 跟踪以便释放

    // 本地消息 ID 与 MQTT 发布 ID 保持一致，防止 broker echo 时产生重复消息
    const voiceId = Math.random().toString(36).slice(2)
    receivedMsgIdsRef.current.add(voiceId)  // 预注册，防止 broker echo 时重复展示

    setMessages(prev => [...prev, {
      id: voiceId,
      type: 'voice',
      senderId: user.id, senderName: user.name, senderColor: user.color,
      fileUrl: localUrl, duration,
      ts: Date.now(), isSelf: true
    }])
    try {
      const buffer = await blob.arrayBuffer()
      const chunks: string[] = []
      for (let i = 0; i < buffer.byteLength; i += CONFIG.CHUNK_SIZE) {
        const slice = buffer.slice(i, i + CONFIG.CHUNK_SIZE)
        chunks.push(safeBase64Encode(new Uint8Array(slice)))
      }
      publish(`chat/${roomCode}/voice`, {
        type: 'voice', senderId: user.id,
        senderName: user.name, senderColor: user.color,
        id: voiceId,  // 与本地消息 ID 一致
        chunks, duration
      })
      addLog('info', `发送语音: ${duration}s (${(blob.size / 1024).toFixed(1)}KB)`)
    } catch (e) {
      addLog('error', `发送语音失败: ${(e as Error).message}`)
    }
  }, [roomCode, user, status, publish, addLog])

  const manualReconnect = useCallback(() => {
    reconnectAttempts.current = 0
    brokerIndexRef.current = 0
    addLog('info', '手动触发重连，从主节点重试')
    if (clientRef.current) {
      clientRef.current.end(true)
      clientRef.current = null
    }
    setTimeout(() => connectToBroker(0), 500)
  }, [connectToBroker, addLog])

  // 同步 connectToBroker ref，使内部自引用始终指向最新版本
  useEffect(() => {
    connectToBrokerRef.current = connectToBroker
  }, [connectToBroker])

  // B7 修复：已删除重复的离线清理 useEffect
  // presenceCleanupTimer 在 connectToBroker 的 client.on('connect') 里统一管理，
  // 每次重连时先 clearInterval 旧的再创建新的，无需在此重复创建

  // ─── AI 本地消息注入 ─────────────────────────────────────────────────────
  /** 向本地消息列表追加一条消息（不发布到 MQTT，仅本地可见，用于 AI 回复） */
  const injectLocalMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
  }, [])

  /** 按 ID 更新本地消息（用于 AI 流式回复逐步更新文本） */
  const updateLocalMessage = useCallback((id: string, updater: (prev: ChatMessage) => ChatMessage) => {
    setMessages(prev => prev.map(m => m.id === id ? updater(m) : m))
  }, [])

  return {
    status, messages, onlineUsers, typingUsers, logs,
    activeBrokerIndex,
    connect, disconnect, sendText, sendTyping, sendFile, sendVoice, sendRead, sendRecall,
    manualReconnect, clearLogs,
    injectLocalMessage, updateLocalMessage
  }
}
