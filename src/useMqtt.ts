import { useRef, useState, useCallback, useEffect } from 'react'
import mqtt from 'mqtt'
import type { MqttClient } from 'mqtt'
import { CONFIG } from './config'
import type {
  ConnStatus, User, ChatMessage, OnlineUser,
  MqttTextMsg, MqttTypingMsg, MqttPresenceMsg, MqttFileMsg
} from './types'

const COLORS = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F']
function pickColor(id: string) {
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
  const reconnectAttempts = useRef(0)
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const addSysMsg = useCallback((text: string) => {
    setMessages(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      type: 'sys', senderId: '', senderName: '', senderColor: '',
      text, ts: Date.now(), isSelf: false
    }])
  }, [])

  const publish = useCallback((topic: string, payload: object) => {
    clientRef.current?.publish(topic, JSON.stringify(payload), { qos: 1 })
  }, [])

  const connect = useCallback(() => {
    if (!roomCode) return
    if (clientRef.current?.connected) return

    const clientId = `chat_${user.id}_${Date.now().toString(36)}`
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
      const topics = [
        `chat/${roomCode}/msg`,
        `chat/${roomCode}/file`,
        `chat/${roomCode}/presence`,
        `chat/${roomCode}/typing`,
      ]
      client.subscribe(topics, { qos: 1 }, (err) => {
        if (err) { setStatus('err'); return }
        setStatus('ok')
        // 广播加入
        publish(`chat/${roomCode}/presence`, {
          type: 'join', senderId: user.id,
          senderName: user.name, senderColor: user.color
        })
        addSysMsg(`🔒 已连接到房间 ${roomCode}，点击顶部房间码可复制分享`)
        // 心跳
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
            if (m.type === 'join') addSysMsg(`👋 ${m.senderName} 加入了房间`)
          } else if (m.type === 'leave') {
            setOnlineUsers(prev => prev.filter(u => u.id !== m.senderId))
            addSysMsg(`👋 ${m.senderName} 离开了房间`)
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
            const binaryChunks = m.chunks.map(c => {
              const bin = atob(c)
              const bytes = new Uint8Array(bin.length)
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
              return bytes
            })
            const total = binaryChunks.reduce((a, c) => a + c.length, 0)
            const combined = new Uint8Array(total)
            let offset = 0
            binaryChunks.forEach(c => { combined.set(c, offset); offset += c.length })
            const blob = new Blob([combined], { type: m.mime })
            const url = URL.createObjectURL(blob)
            setMessages(prev => [...prev, {
              id: Math.random().toString(36).slice(2),
              type: /\.(png|jpg|jpeg|gif|webp)$/i.test(m.name) ? 'image' : 'file',
              senderId: m.senderId, senderName: m.senderName, senderColor: m.senderColor,
              fileUrl: url, fileName: m.name, fileSize: m.size, fileMime: m.mime,
              ts: Date.now(), isSelf: false
            }])
          } catch (e) {
            console.error('文件接收失败', e)
          }
        }
      } catch (e) {
        console.error('消息解析错误', e)
      }
    })

    client.on('close', () => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
      setStatus(s => {
        if (s === 'disconnected') return s
        // 自动重连
        reconnectAttempts.current++
        if (reconnectAttempts.current > CONFIG.MAX_RECONNECT_ATTEMPTS) return 'err'
        const delay = Math.min(CONFIG.RECONNECT_BASE_DELAY * Math.pow(1.5, reconnectAttempts.current - 1), 30000)
        setTimeout(() => { if (!client.connected) client.reconnect() }, delay)
        return 'connecting'
      })
    })

    client.on('error', () => setStatus('err'))
  }, [roomCode, user, publish, addSysMsg])

  const disconnect = useCallback(() => {
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
    if (clientRef.current && roomCode) {
      publish(`chat/${roomCode}/presence`, {
        type: 'leave', senderId: user.id,
        senderName: user.name, senderColor: user.color
      })
      setTimeout(() => clientRef.current?.end(true), 300)
    }
    setStatus('disconnected')
    setMessages([])
    setOnlineUsers([])
    setTypingUsers([])
  }, [roomCode, user, publish])

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

  const sendTyping = useCallback(() => {
    if (!roomCode || status !== 'ok') return
    publish(`chat/${roomCode}/typing`, {
      type: 'typing', senderId: user.id, senderName: user.name
    })
  }, [roomCode, user, status, publish])

  const sendFile = useCallback(async (file: File) => {
    if (!roomCode || status !== 'ok') return
    if (file.size > CONFIG.MAX_FILE_SIZE) { alert('文件超过 20MB 限制'); return }

    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name)
    const localUrl = URL.createObjectURL(file)

    // 先在本地显示
    setMessages(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      type: isImage ? 'image' : 'file',
      senderId: user.id, senderName: user.name, senderColor: user.color,
      fileUrl: localUrl, fileName: file.name, fileSize: file.size, fileMime: file.type,
      ts: Date.now(), isSelf: true
    }])

    try {
      const buffer = await file.arrayBuffer()
      const chunks: string[] = []
      for (let i = 0; i < buffer.byteLength; i += CONFIG.CHUNK_SIZE) {
        const slice = buffer.slice(i, i + CONFIG.CHUNK_SIZE)
        chunks.push(btoa(String.fromCharCode(...new Uint8Array(slice))))
      }
      publish(`chat/${roomCode}/file`, {
        type: 'file', senderId: user.id,
        senderName: user.name, senderColor: user.color,
        id: Math.random().toString(36).slice(2),
        name: file.name, size: file.size,
        mime: file.type || 'application/octet-stream', chunks
      })
    } catch (e) {
      console.error('发送文件失败', e)
      alert('发送失败')
    }
  }, [roomCode, user, status, publish])

  const manualReconnect = useCallback(() => {
    reconnectAttempts.current = 0
    if (clientRef.current) clientRef.current.reconnect()
    else connect()
  }, [connect])

  // 清理离线用户（超过 60s 无心跳）
  useEffect(() => {
    const timer = setInterval(() => {
      setOnlineUsers(prev => prev.filter(u => Date.now() - u.ts < 60000))
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  return {
    status, messages, onlineUsers, typingUsers,
    connect, disconnect, sendText, sendTyping, sendFile, manualReconnect,
    pickColor
  }
}

export { pickColor }
