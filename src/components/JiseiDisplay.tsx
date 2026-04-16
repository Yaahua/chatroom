import { useState, useEffect, useRef } from 'react'
import { DEATH_POEMS } from '../data/deathPoems'

interface JiseiDisplayProps {
  isDark: boolean
}

export function JiseiDisplay({ isDark }: JiseiDisplayProps) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * DEATH_POEMS.length))
  const [visible, setVisible] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      // 淡出
      setVisible(false)
      setTimeout(() => {
        // 切换到下一首
        setIndex(i => (i + 1) % DEATH_POEMS.length)
        // 淡入
        setVisible(true)
      }, 500)
    }, 8000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const poem = DEATH_POEMS[index]

  return (
    <div
      style={{
        transition: 'opacity 0.5s ease',
        opacity: visible ? 1 : 0,
        textAlign: 'center',
        fontFamily: 'ZCOOL XiaoWei, KaiTi, Noto Serif SC, serif',
      }}
    >
      {poem.lines.map((line, i) => (
        <p
          key={i}
          style={{
            margin: '2px 0',
            lineHeight: 1.8,
            fontSize: 14,
            color: isDark ? '#C8B48A' : '#9A8A6A',
          }}
        >
          {line}
        </p>
      ))}
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 11,
          opacity: 0.6,
          letterSpacing: 1,
          color: isDark ? '#C8B48A' : '#9A8A6A',
        }}
      >
        —— {poem.author}（{poem.authorJa}）· {poem.year}
      </p>
    </div>
  )
}
