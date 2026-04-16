import { useState, useEffect, useRef } from 'react'
import type { OnlineUser, User } from '../types'
import { AI_NAME, AI_COLOR, AI_ID } from '../useAI'

// @ 候选项的统一类型
export interface MentionCandidate {
  id: string
  name: string
  color: string
  isAI?: boolean
}

interface AtMentionPanelProps {
  /** 当前 @ 后输入的查询字符串，用于过滤候选 */
  query: string
  /** 在线用户列表（不含自己） */
  onlineUsers: OnlineUser[]
  /** 自己 */
  self: User
  /** 选中某个候选后的回调 */
  onSelect: (candidate: MentionCandidate) => void
  /** 关闭面板 */
  onClose: () => void
}

/**
 * 内部实现组件：通过 key 重置 activeIndex，避免 effect 中 setState 的 lint 问题
 */
function AtMentionPanelInner({ query, onlineUsers, self, onSelect, onClose }: AtMentionPanelProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  // 构建候选列表：AI 排首位，然后是自己，然后是其他在线用户
  const allCandidates: MentionCandidate[] = [
    { id: AI_ID, name: AI_NAME, color: AI_COLOR, isAI: true },
    { id: self.id, name: self.name, color: self.color },
    ...onlineUsers.map(u => ({ id: u.id, name: u.name, color: u.color })),
  ]

  // 根据 query 过滤（不区分大小写）
  const filtered = query
    ? allCandidates.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : allCandidates

  // 键盘上下选择 + Enter 确认 + Escape 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (filtered.length === 0) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(i => (i + 1) % filtered.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(i => (i - 1 + filtered.length) % filtered.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        setActiveIndex(i => { onSelect(filtered[i]); return i })
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filtered, onSelect, onClose])

  // 点击面板外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  if (filtered.length === 0) return null

  return (
    <div ref={panelRef} className="at-panel menu-anim">
      <div className="at-panel-header">
        <span className="at-panel-title">@ 提及</span>
      </div>
      <div className="at-panel-list">
        {filtered.map((c, i) => (
          <button
            key={c.id}
            className={`at-panel-item${i === activeIndex ? ' at-panel-item-active' : ''}`}
            onMouseDown={e => { e.preventDefault(); onSelect(c) }}
            onMouseEnter={() => setActiveIndex(i)}
          >
            {c.isAI ? (
              <div className="at-avatar at-avatar-ai">
                <span style={{ fontSize: 14 }}>🤖</span>
              </div>
            ) : (
              <div className="at-avatar" style={{ background: c.color }}>
                {c.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="at-info">
              <span className="at-name">{c.name}</span>
              {c.isAI && <span className="at-badge">DeepSeek</span>}
              {c.id === self.id && !c.isAI && <span className="at-badge at-badge-self">我</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * 外层组件：每次 query 变化时通过 key 强制重新挂载内部组件，
 * 从而让 activeIndex 自动归零，无需在 effect 中 setState。
 */
export function AtMentionPanel(props: AtMentionPanelProps) {
  return <AtMentionPanelInner key={props.query} {...props} />
}
