import { useRef, useCallback } from 'react'

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

  const getCtx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    return ctxRef.current
  }, [])

  const playSend = useCallback(() => {
    if (muted) return
    try {
      const ctx = getCtx()
      createBeep(ctx, 880, 0.08, 0.1)
    // eslint-disable-next-line no-empty
    } catch {}
  }, [muted, getCtx])

  const playReceive = useCallback(() => {
    if (muted) return
    try {
      const ctx = getCtx()
      createBeep(ctx, 660, 0.12, 0.12)
      setTimeout(() => createBeep(ctx, 880, 0.1, 0.1), 80)
    // eslint-disable-next-line no-empty
    } catch {}
  }, [muted, getCtx])

  return { playSend, playReceive }
}
