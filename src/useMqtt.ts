import { useRef, useState, useCallback, useEffect } from 'react'
import mqtt from 'mqtt'
import type { MqttClient } from 'mqtt'
import { CONFIG } from './config'
import type {
  ConnStatus, User, ChatMessage, OnlineUser,
  MqttTextMsg, MqttTypingMsg, MqttPresenceMsg, MqttFileMsg
} from './types'

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

export function useMqtt(user: User, roomCode: string | null) {
  const clientRef = useRef<MqttClient | null>(null)
  const [status, setStatus] = useState<ConnStatus>('disconnected')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const reconnectAttempts = useRef(0)
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const publish = useCallback((topic: string, payload: object) => {
    if (!clientRef.current?.connected) return
    clientRef.current.publish(topic, JSON.stringify(payload), { qos: 1 })
  }, [])

  const connect = useCallback(() => {
    if (!roomCode) return
    if (clientRef.current?.connected) return

    const clientId = `chat_${user.id}_${Date.now().toString(36)}`
    addLog('info', `正在连接 EMQX... clientId=${clientId}`)

    const client = mqtt.connect(CONFIG.MQTT_URL, {
      clientId,
      username: CONFIG.MQTT_USERNAME,
      password: CONFIG.MQTT_PASSWORD,
      clean: true,
      keepalive: 60,
      connectTimeout: 15000,
      reconnectPeriod: 0,
      protocolVersion: 5,
      properties: { sessionExpiryInterval: CONFIG.SESSION_EXPIRY }
    })
    clientRef.current = client
    setStatus('connecting')

    client.on('connect', () => {
      reconnectAttempts.current = 0
      addLog('info', `已连接到 EMQX，订阅房间 ${roomCode}`)
      const topics = [
        `chat/${roomCode}/msg`,
        `chat/${roomCode}/file`,
        `chat/${roomCode}/presence`,
        `chat/${roomCode}/typing`,
        `chat/${roomCode}/voice`,
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
        addSysMsg(`✅ 已进入房间 ${roomCode}`)
        heartbeatTimer.current = setInterval(() => {
          publish(`chat/${roomCode}/presence`, {
            type: 'heartbeat', senderId: user.id,
            senderName: user.name, senderColor: user.color
          })
        }, 20000)
      })
    })

    client.on('message', (topic, payload) => {
      try {
        const msg = JSON.parse(payload.toString())
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
          const m = msg as MqttTextMsg
          setMessages(prev => [...prev, {
            id: Math.random().toString(36).slice(2),
            type: 'text', senderId: m.senderId,
            senderName: m.senderName, senderColor: m.senderColor,
            text: m.text, ts: m.ts, isSelf: false
          }])
        } else if (topic.endsWith('/file')) {
          const m = msg as MqttFileMsg
          try {
            // 优化：使用 TextDecoder 替代 atob 提升性能
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
            const isImage = /image\//i.test(mime) || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(m.name)
            setMessages(prev => [...prev, {
              id: Math.random().toString(36).slice(2),
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
          // 语音消息
          try {
            const { senderId, senderName, senderColor, chunks, duration } = msg
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
            setMessages(prev => [...prev, {
              id: Math.random().toString(36).slice(2),
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
      setStatus(s => {
        if (s === 'disconnected') return s
        reconnectAttempts.current++
        if (reconnectAttempts.current > CONFIG.MAX_RECONNECT_ATTEMPTS) {
          addLog('error', `重连次数超限 (${reconnectAttempts.current})，停止重连`)
          return 'err'
        }
        const delay = Math.min(CONFIG.RECONNECT_BASE_DELAY * Math.pow(1.5, reconnectAttempts.current - 1), 30000)
        addLog('warn', `连接断开，${(delay / 1000).toFixed(1)}s 后重连 (第 ${reconnectAttempts.current} 次)`)
        setTimeout(() => { if (!client.connected) client.reconnect() }, delay)
        return 'connecting'
      })
    })

    client.on('error', (err) => {
      addLog('error', `MQTT 错误: ${err.message}`)
      setStatus('err')
    })
  }, [roomCode, user, publish, addSysMsg, addLog])

  const disconnect = useCallback(() => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
    // 先设置状态为 disconnected，这样 close 事件中的重连逻辑会被跳过
    setStatus('disconnected')
    if (clientRef.current && roomCode) {
      publish(`chat/${roomCode}/presence`, {
        type: 'leave', senderId: user.id,
        senderName: user.name, senderColor: user.color
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
  }, [roomCode, user, publish, addLog])

  const sendText = useCallback((text: string) => {
    if (!roomCode || !text.trim() || status !== 'ok') return
    publish(`chat/${roomCode}/msg`, {
      type: 'text', senderId: user.id,
      senderName: user.name, senderColor: user.color,
      text: text.trim(), ts: Date.now()
    })
    setMessages(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      type: 'text', senderId: user.id,
      senderName: user.name, senderColor: user.color,
      text: text.trim(), ts: Date.now(), isSelf: true
    }])
  }, [roomCode, user, status, publish])

  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTyping = useCallback(() => {
    if (!roomCode || status !== 'ok') return
    // 防抖：2s 内只发一次，避免每个按键都发送 MQTT 消息
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

    setMessages(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      type: isImage ? 'image' : 'file',
      senderId: user.id, senderName: user.name, senderColor: user.color,
      fileUrl: localUrl, fileName: file.name, fileSize: file.size, fileMime: mime,
      ts: Date.now(), isSelf: true
    }])

    try {
      const buffer = await file.arrayBuffer()
      const chunks: string[] = []
      // 动态分片：小文件用大片，大文件用小片，减少消息数
      const chunkSize = file.size > 1024 * 1024 ? 48 * 1024 : CONFIG.CHUNK_SIZE
      for (let i = 0; i < buffer.byteLength; i += chunkSize) {
        const slice = buffer.slice(i, i + chunkSize)
        chunks.push(safeBase64Encode(new Uint8Array(slice)))
      }
      publish(`chat/${roomCode}/file`, {
        type: 'file', senderId: user.id,
        senderName: user.name, senderColor: user.color,
        id: Math.random().toString(36).slice(2),
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
    setMessages(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
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
        chunks, duration
      })
      addLog('info', `发送语音: ${duration}s (${(blob.size / 1024).toFixed(1)}KB)`)
    } catch (e) {
      addLog('error', `发送语音失败: ${(e as Error).message}`)
    }
  }, [roomCode, user, status, publish, addLog])

  const manualReconnect = useCallback(() => {
    reconnectAttempts.current = 0
    addLog('info', '手动触发重连')
    if (clientRef.current) clientRef.current.reconnect()
    else connect()
  }, [connect, addLog])

  // 清理离线用户（超过 60s 无心跳）
  useEffect(() => {
    const timer = setInterval(() => {
      setOnlineUsers(prev => prev.filter(u => Date.now() - u.ts < 60000))
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  return {
    status, messages, onlineUsers, typingUsers, logs,
    connect, disconnect, sendText, sendTyping, sendFile, sendVoice, manualReconnect, clearLogs
  }
}
