import { useState, useEffect, useRef, useMemo } from 'react'
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
  /** 在线用户列表 */
  onlineUsers: OnlineUser[]
  /** 自己 */
  self: User
  /** 选中某个候选后的回调 */
  onSelect: (candidate: MentionCandidate) => void
  /** 关闭面板 */
  onClose: () => void
}

// 内部实现：通过外层 key={query} 重置，避免 effect 中 setState
function AtMentionPanelInner({ query, onlineUsers, self, onSelect, onClose }: AtMentionPanelProps) {
  // key 重置时 activeIndex 自动归零
  const [activeIndex, setActiveIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  // 构建候选列表：AI 排首位，然后是自己，然后是其他在线用户（去重）
  const allCandidates = useMemo((): MentionCandidate[] => {
    const seen = new Set<string>()
    const list: MentionCandidate[] = []

    // AI 固定排第一
    list.push({ id: AI_ID, name: AI_NAME, color: AI_COLOR, isAI: true })
    seen.add(AI_ID)

    // 自己排第二
    if (self.id && !seen.has(self.id)) {
      list.push({ id: self.id, name: self.name, color: self.color })
      seen.add(self.id)
    }

    // 其他在线用户
    for (const u of onlineUsers) {
      if (!seen.has(u.id)) {
        list.push({ id: u.id, name: u.name, color: u.color })
        seen.add(u.id)
      }
    }

    return list
  }, [onlineUsers, self])

  // 根据 query 过滤（不区分大小写）
  const filtered = useMemo(() => {
    if (!query) return allCandidates
    const q = query.toLowerCase()
    return allCandidates.filter(c => c.name.toLowerCase().includes(q))
  }, [allCandidates, query])

  // activeIndex 越界保护
  const safeIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0))

  // 键盘上下选择 + Enter 确认 + Escape 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(i => (i + 1) % Math.max(filtered.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(i => (i - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered.length > 0) {
          e.preventDefault()
          e.stopPropagation()
          onSelect(filtered[safeIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)  // 使用捕获阶段，优先于 textarea 的 keydown
    return () => window.removeEventListener('keydown', handler, true)
  }, [filtered, safeIndex, onSelect, onClose])

  // 点击面板外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // 延迟绑定，避免打开时立即被关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  return (
    <div ref={panelRef} className="at-panel menu-anim">
      <div className="at-panel-header">
        <span className="at-panel-title">
          {query ? `@ 搜索 "${query}"` : '@ 提及'}
        </span>
      </div>
      <div className="at-panel-list">
        {filtered.length === 0 ? (
          // 无匹配时显示空状态
          <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            无匹配用户
          </div>
        ) : (
          filtered.map((c, i) => (
            <button
              key={c.id}
              className={`at-panel-item${i === safeIndex ? ' at-panel-item-active' : ''}`}
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
          ))
        )}
      </div>
    </div>
  )
}

/**
 * 外层导出组件：每次 query 变化时通过 key 强制重新挂载内部组件，
 * 从而让 activeIndex 自动归零，无需在 effect 中 setState。
 */
export function AtMentionPanel(props: AtMentionPanelProps) {
  return <AtMentionPanelInner key={props.query} {...props} />
}
