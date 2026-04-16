import { useState, useEffect } from 'react'
import { JiseiDisplay } from './JiseiDisplay'

interface LoginViewProps {
  darkMode: boolean
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>
  savedName: string
  savedRoom: string
  onEnterRoom: (code: string, name: string) => void
}

export function LoginView({ darkMode, setDarkMode, savedName, savedRoom, onEnterRoom }: LoginViewProps) {
  const [nameInput, setNameInput] = useState(savedName)
  const [roomInput, setRoomInput] = useState('')
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [nameErr, setNameErr] = useState('')
  const [roomErr, setRoomErr] = useState('')

  // URL 参数直达：?room=XXXXXX 自动填入房间码并切换到加入 Tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const roomParam = params.get('room')
    if (roomParam) {
      setRoomInput(roomParam.toUpperCase())
      setTab('join')
    }
  }, [])

  const validateName = (name: string) => {
    if (!name.trim()) { setNameErr('请输入昵称'); return false }
    setNameErr('')
    return true
  }

  const handleCreateRoom = () => {
    if (!validateName(nameInput)) return
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    onEnterRoom(code, nameInput)
  }

  const handleJoinRoom = () => {
    const nameOk = validateName(nameInput)
    const roomOk = !!roomInput.trim()
    if (!roomOk) setRoomErr('请输入房间码')
    else setRoomErr('')
    if (!nameOk || !roomOk) return
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
      fontSize: 22, fontWeight: 700, margin: '8px 0 10px',
      color: isDark ? '#F3EDE2' : '#231D17',
      fontFamily: 'Noto Serif SC, SimSun, serif',
      display: 'inline-block',
    },
    tabRow: {
      display: 'flex', gap: 0, marginBottom: 14,
      background: isDark ? '#6A4A32' : '#EDE4D2',
      borderRadius: 12, padding: 3,
    },
    tabBtn: (active: boolean) => ({
      flex: 1, padding: '8px 0', fontSize: 13, fontWeight: active ? 700 : 500,
      background: active ? '#AE9F80' : 'transparent',
      color: active ? '#fff' : (isDark ? '#C8B48A' : '#9A8A6A'),
      border: 'none', borderRadius: 10, cursor: 'pointer',
      transition: 'all 0.18s',
    }),
    inputWrap: { marginBottom: 4 },
    input: (hasErr: boolean) => ({
      width: '100%', padding: '12px 16px',
      fontSize: 15, textAlign: 'center' as const,
      background: isDark ? '#8A6850' : '#EDE4D2',
      border: hasErr
        ? '1.5px solid #E57373'
        : (isDark ? '1.5px solid rgba(200,180,138,0.22)' : '1.5px solid rgba(94,80,63,0.2)'),
      borderRadius: 14, outline: 'none',
      color: isDark ? '#F3EDE2' : '#231D17',
      fontFamily: 'inherit', boxSizing: 'border-box' as const,
      display: 'block',
      transition: 'border-color 0.18s',
    }),
    errText: {
      fontSize: 12, color: '#E57373',
      marginBottom: 8, marginTop: 2,
      textAlign: 'center' as const,
      minHeight: 18,
    },
    btnFull: {
      width: '100%', padding: '12px 0', fontSize: 14, fontWeight: 600,
      background: '#AE9F80', color: '#fff',
      border: 'none', borderRadius: 14, cursor: 'pointer', marginTop: 4,
      display: 'block',
    },
    recentBtn: {
      width: '100%', padding: '10px 14px', fontSize: 13,
      background: 'var(--hz-100)', border: '1.5px dashed var(--hz-400)',
      borderRadius: 12, cursor: 'pointer',
      color: 'var(--hz-700)', marginTop: 10,
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
          {/* 辞世诗轮换展示 */}
          <JiseiDisplay isDark={isDark} />
        </div>

        {/* 昵称输入 */}
        <div style={S.inputWrap}>
          <input
            style={S.input(!!nameErr)}
            placeholder="你的昵称"
            maxLength={12}
            value={nameInput}
            onChange={e => { setNameInput(e.target.value); if (nameErr) setNameErr('') }}
            onKeyDown={e => e.key === 'Enter' && (tab === 'create' ? handleCreateRoom() : handleJoinRoom())}
          />
          {nameErr && <div style={S.errText}>{nameErr}</div>}
        </div>

        {/* Tab 切换：新建 / 加入 */}
        <div style={S.tabRow}>
          <button style={S.tabBtn(tab === 'create')} onClick={() => { setTab('create'); setRoomErr('') }}>新建房间</button>
          <button style={S.tabBtn(tab === 'join')} onClick={() => setTab('join')}>加入房间</button>
        </div>

        {tab === 'create' && (
          <button style={S.btnFull} onClick={handleCreateRoom}>创建并进入</button>
        )}

        {tab === 'join' && (
          <div>
            <div style={S.inputWrap}>
              <input
                style={{ ...S.input(!!roomErr), letterSpacing: 4, textTransform: 'uppercase' as const }}
                placeholder="输入房间码"
                maxLength={8}
                value={roomInput}
                autoFocus={tab === 'join'}
                onChange={e => { setRoomInput(e.target.value.toUpperCase()); if (roomErr) setRoomErr('') }}
                onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
              />
              {roomErr && <div style={S.errText}>{roomErr}</div>}
            </div>
            <button style={S.btnFull} onClick={handleJoinRoom}>进入房间</button>
          </div>
        )}

        {/* 快速重连 */}
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
