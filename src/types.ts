export type ConnStatus = 'disconnected' | 'connecting' | 'ok' | 'err'

export interface User {
  id: string
  name: string
  color: string
}

export interface ChatMessage {
  id: string
  type: 'text' | 'image' | 'file' | 'voice' | 'sys'
  senderId: string
  senderName: string
  senderColor: string
  text?: string
  fileUrl?: string
  fileName?: string
  fileSize?: number
  fileMime?: string
  duration?: number
  ts: number
  isSelf: boolean
  // 已读状态: 'sent' = 已发送, 'delivered' = 已送达, 'read' = 已读
  readStatus?: 'sent' | 'delivered' | 'read'
  // 引用回复
  replyTo?: { id: string; senderName: string; text?: string; type: string }
  // 是否已撤回
  recalled?: boolean
  // 被 @ 的用户昵称列表（用于接收方判断自己是否被提及）
  mentions?: string[]
  // 思考过程（Kimi K2.5 等推理模型专用）
  reasoning?: string
}

export interface OnlineUser {
  id: string
  name: string
  color: string
  ts: number
}

export interface MqttTextMsg {
  type: 'text'
  senderId: string
  senderName: string
  senderColor: string
  text: string
  ts: number
  mentions?: string[]  // 被 @ 的用户昵称列表
}

export interface MqttTypingMsg {
  type: 'typing'
  senderId: string
  senderName: string
}

export interface MqttPresenceMsg {
  type: 'join' | 'leave' | 'heartbeat'
  senderId: string
  senderName: string
  senderColor: string
}

export interface MqttFileMsg {
  type: 'file'
  senderId: string
  senderName: string
  senderColor: string
  id: string
  name: string
  size: number
  mime: string
  chunks: string[]
}
