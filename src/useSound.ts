import { useRef, useCallback, useEffect } from 'react'

function createBeep(ctx: AudioContext, freq: number, duration: number, vol = 0.15) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = freq
  osc.type = 'sine'
  gain.gain.setValueAtTime(vol, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration)
}

export function useSound(muted: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  // 追踪组件是否已卸载，防止卸载后的延时 beep 仍然执行
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // 组件卸载时关闭 AudioContext，避免浏览器"AudioContext 数量过多"警告
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => { /* ignore */ })
        ctxRef.current = null
      }
    }
  }, [])

  const getCtx = useCallback(async (): Promise<AudioContext | null> => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
    }
    // 移动端浏览器在用户手势前 AudioContext 处于 suspended 状态
    // 必须在用户手势回调中调用 resume() 才能播放音效
    if (ctxRef.current.state === 'suspended') {
      try {
        await ctxRef.current.resume()
      } catch {
        return null
      }
    }
    return ctxRef.current
  }, [])

  const playSend = useCallback(async () => {
    if (muted) return
    try {
      const ctx = await getCtx()
      if (!ctx || !mountedRef.current) return
      createBeep(ctx, 880, 0.08, 0.1)
    } catch { /* ignore */ }
  }, [muted, getCtx])

  const playReceive = useCallback(async () => {
    if (muted) return
    try {
      const ctx = await getCtx()
      if (!ctx || !mountedRef.current) return
      createBeep(ctx, 660, 0.12, 0.12)
      // 延迟 80ms 播放第二声，但要检查组件是否还在挂载
      setTimeout(() => {
        if (!mountedRef.current || !ctx) return
        try { createBeep(ctx, 880, 0.1, 0.1) } catch { /* ignore */ }
      }, 80)
    } catch { /* ignore */ }
  }, [muted, getCtx])

  return { playSend, playReceive }
}
