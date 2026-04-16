import { useState } from 'react'

interface Jisei {
  lines: string[]
  author: string
  era: string
}

const JISEI_LIST: Jisei[] = [
  { lines: ['如露坠落，如露消逝，此即吾身', '浪花之事，不过梦中之梦'], author: '丰臣秀吉', era: '战国' },
  { lines: ['四十九年，一睡之梦', '一期荣华，一杯之酒'], author: '上杉谦信', era: '战国' },
  { lines: ['以无云遮之心中明月', '照亮浮世之黑暗而行'], author: '伊达政宗', era: '战国' },
  { lines: ['顺逆无二门，彻悟大道心源', '五十五年之梦，醒来时，归于一元'], author: '明智光秀', era: '战国' },
  { lines: ['夏夜之梦路，虚幻无常', '身后之名，寄予云端之杜鹃'], author: '柴田胜家', era: '战国' },
  { lines: ['筑摩江上，芦间点燃之行灯', '与我身一同，终将消逝'], author: '石田三成', era: '战国' },
  { lines: ['思绪万千，无言以表，终须离去', '不迷于道，任其自然而行'], author: '黑田如水', era: '战国' },
  { lines: ['先逝者，后残存者，皆同一事', '唯携不走之人，方有离别之思'], author: '德川家康', era: '战国' },
  { lines: ['春秋红叶，终难留住', '人亦空虚，此关路也'], author: '岛津义弘', era: '战国' },
  { lines: ['既有契约，待于六岔路口', '虽有先后之别，终无负约'], author: '大谷吉继', era: '战国' },
  { lines: ['月与花，随心尽情赏尽', '于浮世之中，又有何遗憾'], author: '丰臣秀次', era: '战国' },
  { lines: ['厌恶凋零，却先于世间众人', '率先散去，方是花朵，夜风劲吹'], author: '三岛由纪夫', era: '昭和' },
  { lines: ['为大君之御旗之影下而死', '方知生而为人之价值'], author: '神风特攻队·关行男', era: '昭和' },
  { lines: ['春风过，落花无踪迹', '唯留香，于青空之中'], author: '神风特攻队员·无名', era: '昭和' },
  { lines: ['此身纵使朽烂于武藏之野', '亦要留存大和魂于后世'], author: '吉田松阴', era: '幕末' },
  { lines: ['事到如今，又有何言', '白雪堆积之冬夜月'], author: '土方岁三', era: '幕末' },
]

function pickJisei(): Jisei {
  return JISEI_LIST[Math.floor(Math.random() * JISEI_LIST.length)]
}

interface LoginViewProps {
  darkMode: boolean
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>
  savedName: string
  savedRoom: string
  onEnterRoom: (code: string, name: string) => void
}

export function LoginView({ darkMode, setDarkMode, savedName, savedRoom, onEnterRoom }: LoginViewProps) {
  const [jisei] = useState<Jisei>(() => pickJisei())
  const [nameInput, setNameInput] = useState(savedName)
  const [roomInput, setRoomInput] = useState('')
  const [showJoin, setShowJoin] = useState(false)

  const handleCreateRoom = () => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    onEnterRoom(code, nameInput)
  }

  const handleJoinRoom = () => {
    if (!roomInput.trim()) { alert('请输入房间码'); return }
    onEnterRoom(roomInput, nameInput)
  }

  const isDark = darkMode
  const S = {
    root: {
      position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: isDark
        ? 'linear-gradient(160deg,#5C3D28 0%,#6A4A32 50%,#7A5840 100%)'
        : 'linear-gradient(160deg,#F3EDE2 0%,#E8DCC8 40%,#D9C9A8 100%)',
      padding: '24px 20px',
      overflowY: 'auto' as const,
    },
    card: {
      position: 'relative' as const,
      width: '100%', maxWidth: 360,
      background: isDark ? '#7A5840' : '#FBF7F0',
      borderRadius: 28,
      padding: '32px 28px 28px',
      boxShadow: isDark ? '0 8px 40px rgba(0,0,0,0.55)' : '0 8px 40px rgba(94,80,63,0.22)',
      border: isDark ? '1px solid rgba(200,180,138,0.18)' : '1px solid rgba(174,159,128,0.4)',
      flexShrink: 0,
    },
    themeBtn: {
      position: 'absolute' as const, top: 14, right: 14,
      width: 34, height: 34, borderRadius: '50%',
      background: isDark ? '#8A6850' : '#EDE4D2',
      border: isDark ? '1px solid rgba(200,180,138,0.22)' : '1px solid rgba(94,80,63,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 16, cursor: 'pointer',
    },
    center: { textAlign: 'center' as const, marginBottom: 20 },
    title: {
      fontSize: 22, fontWeight: 700, margin: '8px 0 6px',
      color: isDark ? '#F3EDE2' : '#231D17',
      fontFamily: 'Noto Serif SC, SimSun, serif',
      display: 'inline-block',
    },
    subtitle: {
      fontSize: 15, margin: 0,
      color: isDark ? '#C8B48A' : '#9A8A6A',
      fontFamily: 'ZCOOL XiaoWei, KaiTi, serif',
    },
    input: {
      width: '100%', padding: '12px 16px',
      fontSize: 15, textAlign: 'center' as const,
      background: isDark ? '#8A6850' : '#EDE4D2',
      border: isDark ? '1.5px solid rgba(200,180,138,0.22)' : '1.5px solid rgba(94,80,63,0.2)',
      borderRadius: 14, outline: 'none',
      color: isDark ? '#F3EDE2' : '#231D17',
      fontFamily: 'inherit', boxSizing: 'border-box' as const,
      marginBottom: 12,
      display: 'block',
    },
    btnRow: { display: 'flex', gap: 8, marginBottom: 12 },
    btnPrimary: {
      flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 600,
      background: '#AE9F80', color: '#fff',
      border: 'none', borderRadius: 14, cursor: 'pointer',
    },
    btnSecondary: {
      flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 600,
      background: isDark ? '#8A6850' : '#EDE4D2',
      color: isDark ? '#F3EDE2' : '#231D17',
      border: isDark ? '1px solid rgba(200,180,138,0.22)' : '1px solid rgba(94,80,63,0.2)',
      borderRadius: 14, cursor: 'pointer',
    },
    btnFull: {
      width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 600,
      background: '#AE9F80', color: '#fff',
      border: 'none', borderRadius: 14, cursor: 'pointer', marginTop: 8,
      display: 'block',
    },
    recentBtn: {
      width: '100%', padding: '10px 14px', fontSize: 13,
      background: 'var(--hz-100)', border: '1.5px dashed var(--hz-400)',
      borderRadius: 12, cursor: 'pointer',
      color: 'var(--hz-700)', marginTop: 4,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontWeight: 500,
    },
  }

  return (
    <div style={S.root}>
      <div style={S.card}>
        <button style={S.themeBtn} onClick={() => setDarkMode(d => !d)}>
          {isDark ? '☀️' : '🌙'}
        </button>
        <div style={S.center}>
          <div className="login-gif" style={{ display: 'flex', justifyContent: 'center' }}>
            <img src="/chatroom/avatar.gif" alt="avatar" style={{ width: 72, height: 72, objectFit: 'contain' }} />
          </div>
          <h1 className="login-title" style={S.title}>哈吉米德的聊天室</h1>
          <div className="login-jisei" style={S.subtitle}>
            {jisei.lines.map((line, i) => (
              <p key={i} style={{ margin: '2px 0', lineHeight: 1.7 }}>{line}</p>
            ))}
            <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.7, letterSpacing: 1 }}>
              —— {jisei.author}·{jisei.era}
            </p>
          </div>
        </div>
        <div className="login-input-1">
          <input
            style={S.input}
            placeholder="你的昵称"
            maxLength={12}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateRoom()}
          />
        </div>
        <div className="login-btn-row" style={S.btnRow}>
          <button style={S.btnPrimary} onClick={handleCreateRoom}>新建房间</button>
          <button style={S.btnSecondary} onClick={() => setShowJoin(j => !j)}>加入房间</button>
        </div>
        {showJoin && (
          <div className="login-join-row">
            <input
              style={{ ...S.input, letterSpacing: 4, textTransform: 'uppercase' as const }}
              placeholder="输入房间码"
              maxLength={8}
              value={roomInput}
              onChange={e => setRoomInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
            />
            <button style={S.btnFull} onClick={handleJoinRoom}>进入房间</button>
          </div>
        )}
        {savedRoom && (
          <button style={S.recentBtn} onClick={() => onEnterRoom(savedRoom, nameInput.trim() || (localStorage.getItem('chat_name') ?? '小客'))}>
            <span>⏱ 快速重连  <span style={{ letterSpacing: 3, fontFamily: 'monospace' }}>{savedRoom}</span></span>
            <span style={{ fontSize: 11, opacity: 0.65 }}>一键加入 →</span>
          </button>
        )}
      </div>
    </div>
  )
}
