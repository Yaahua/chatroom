import { useState, useEffect, useRef } from 'react'
import { DEATH_POEMS } from '../data/deathPoems'

interface JiseiDisplayProps {
  isDark: boolean
}

export function JiseiDisplay({ isDark }: JiseiDisplayProps) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * DEATH_POEMS.length))
  const [visible, setVisible] = useState(true)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      // 淡出
      setVisible(false)
      // 500ms 后切换内容并淡入
      fadeTimerRef.current = setTimeout(() => {
        setIndex(i => (i + 1) % DEATH_POEMS.length)
        setVisible(true)
      }, 500)
    }, 8000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    }
  }, [])

  const poem = DEATH_POEMS[index]
  // 将诗句两两分组，形成 2 列网格
  const rows: [string, string | null][] = []
  for (let i = 0; i < poem.lines.length; i += 2) {
    rows.push([poem.lines[i], poem.lines[i + 1] ?? null])
  }

  const textColor = isDark ? '#C8B48A' : '#9A8A6A'

  return (
    <div
      style={{
        transition: 'opacity 0.5s ease',
        opacity: visible ? 1 : 0,
        fontFamily: 'ZCOOL XiaoWei, KaiTi, Noto Serif SC, serif',
        margin: '0 auto',
        maxWidth: 280,
      }}
    >
      {/* 2 列网格：每行两句 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2px 12px',
          textAlign: 'center',
        }}
      >
        {rows.map(([left, right], i) => (
          <>
            <p
              key={`l-${i}`}
              style={{
                margin: 0,
                lineHeight: 1.9,
                fontSize: 13,
                color: textColor,
                textAlign: right ? 'right' : 'center',
                gridColumn: right ? undefined : '1 / -1',
              }}
            >
              {left}
            </p>
            {right && (
              <p
                key={`r-${i}`}
                style={{
                  margin: 0,
                  lineHeight: 1.9,
                  fontSize: 13,
                  color: textColor,
                  textAlign: 'left',
                }}
              >
                {right}
              </p>
            )}
          </>
        ))}
      </div>

      {/* 作者署名 */}
      <p
        style={{
          margin: '8px 0 0',
          fontSize: 11,
          opacity: 0.6,
          letterSpacing: 1,
          color: textColor,
          textAlign: 'center',
        }}
      >
        —— {poem.author}（{poem.authorJa}）· {poem.year}
      </p>
    </div>
  )
}
