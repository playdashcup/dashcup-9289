'use client'

import { useEffect, useRef, useState } from 'react'

const HILLTOP_VAST_TAG = 'https://second-director.com/dEm.F-z/dpG/NMvBZ/GyUm/Zezmj9QudZcUYluk/P/TKc/0SO/D_QgzHNcTwMJt/NNzBQQ4pN/DkML1INSwG'
const IMA_SDK_URL = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js'

type ImaEvent = { getAdsManager(video: HTMLVideoElement, settings: ImaSettings): ImaManager }
type ImaSettings = { restoreCustomPlaybackStateOnAdBreakComplete?: boolean }
type ImaRequest = {
  adTagUrl: string
  linearAdSlotWidth: number
  linearAdSlotHeight: number
  nonLinearAdSlotWidth: number
  nonLinearAdSlotHeight: number
  setAdWillAutoPlay?(value: boolean): void
  setAdWillPlayMuted?(value: boolean): void
}
type ImaManager = {
  addEventListener(type: string, listener: (event: ImaEvent) => void): void
  init(width: number, height: number, viewMode: string): void
  start(): void
  setVolume?(volume: number): void
  destroy(): void
}
type ImaDisplayContainer = { initialize(): void }
type ImaLoader = {
  addEventListener(type: string, listener: (event: ImaEvent) => void): void
  requestAds(request: ImaRequest): void
  contentComplete(): void
  destroy(): void
}
type ImaApi = {
  AdDisplayContainer: new (container: HTMLElement, video: HTMLVideoElement) => ImaDisplayContainer
  AdsLoader: new (container: ImaDisplayContainer) => ImaLoader
  AdsRequest: new () => ImaRequest
  AdsRenderingSettings: new () => ImaSettings
  AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } }
  AdErrorEvent: { Type: { AD_ERROR: string } }
  AdEvent: { Type: { CONTENT_PAUSE_REQUESTED: string; CONTENT_RESUME_REQUESTED: string; ALL_ADS_COMPLETED: string } }
  ViewMode: { NORMAL: string }
}

declare global {
  interface Window {
    google?: { ima?: ImaApi }
  }
}

let sdkPromise: Promise<ImaApi> | undefined

function loadImaSdk(): Promise<ImaApi> {
  if (window.google?.ima) return Promise.resolve(window.google.ima)
  if (!sdkPromise) {
    sdkPromise = new Promise<ImaApi>((resolve, reject) => {
      let script = document.querySelector<HTMLScriptElement>('script[data-dashcup-ima-sdk]')
      const onLoad = () => window.google?.ima ? resolve(window.google.ima) : reject(new Error('IMA SDK did not initialize'))
      const onError = () => reject(new Error('IMA SDK could not be loaded'))
      if (!script) {
        script = document.createElement('script')
        script.src = IMA_SDK_URL
        script.async = true
        script.dataset.dashcupImaSdk = 'true'
        script.referrerPolicy = 'no-referrer-when-downgrade'
        document.head.appendChild(script)
      }
      script.addEventListener('load', onLoad, { once: true })
      script.addEventListener('error', onError, { once: true })
    }).catch((error: unknown) => {
      sdkPromise = undefined
      throw error
    })
  }
  return sdkPromise ?? Promise.reject(new Error('IMA SDK initialization failed'))
}

/** Plays one Hilltop VAST break after the parent has accepted the 15th run. */
export function HilltopVastAd({ attempt, onClose }: { attempt: number; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const adContainerRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef<ImaDisplayContainer | null>(null)
  const displayInitializedRef = useRef(false)
  const managerRef = useRef<ImaManager | null>(null)
  const loaderRef = useRef<ImaLoader | null>(null)
  const managerInitializedRef = useRef(false)
  const [status, setStatus] = useState<'loading' | 'playing' | 'tap' | 'error'>('loading')
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    if (attempt < 1 || !videoRef.current || !adContainerRef.current) return
    let disposed = false
    displayInitializedRef.current = false
    managerInitializedRef.current = false
    const finish = () => {
      if (disposed) return
      managerRef.current?.destroy()
      managerRef.current = null
      loaderRef.current?.destroy()
      loaderRef.current = null
      onClose()
    }
    const reportAdError = () => {
      managerRef.current?.destroy()
      managerRef.current = null
      loaderRef.current?.destroy()
      loaderRef.current = null
      if (!disposed) setStatus('error')
    }

    void loadImaSdk().then((ima) => {
      if (disposed || !videoRef.current || !adContainerRef.current) return
      const display = new ima.AdDisplayContainer(adContainerRef.current, videoRef.current)
      const loader = new ima.AdsLoader(display)
      displayRef.current = display
      loaderRef.current = loader
      loader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, reportAdError)
      loader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (event) => {
        if (disposed || !videoRef.current) return
        const manager = event.getAdsManager(videoRef.current, new ima.AdsRenderingSettings())
        managerRef.current = manager
        manager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, reportAdError)
        manager.addEventListener(ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => {
          if (videoRef.current) videoRef.current.pause()
          if (!disposed) setStatus('playing')
        })
        manager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, finish)
        manager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, finish)
        try {
          if (!displayInitializedRef.current) {
            display.initialize()
            displayInitializedRef.current = true
          }
          manager.init(adContainerRef.current?.clientWidth || 640, adContainerRef.current?.clientHeight || 360, ima.ViewMode.NORMAL)
          managerInitializedRef.current = true
          manager.setVolume?.(muted ? 0 : 1)
          manager.start()
          if (!disposed) setStatus('playing')
        } catch {
          // Mobile browsers may require a fresh user gesture before ad playback.
          if (!disposed) setStatus('tap')
        }
      })
      const request = new ima.AdsRequest()
      request.adTagUrl = HILLTOP_VAST_TAG
      request.linearAdSlotWidth = adContainerRef.current.clientWidth || 640
      request.linearAdSlotHeight = adContainerRef.current.clientHeight || 360
      request.nonLinearAdSlotWidth = request.linearAdSlotWidth
      request.nonLinearAdSlotHeight = Math.round(request.linearAdSlotHeight / 3)
      request.setAdWillAutoPlay?.(true)
      request.setAdWillPlayMuted?.(muted)
      loader.requestAds(request)
    }).catch(() => { if (!disposed) setStatus('error') })

    return () => {
      disposed = true
      managerRef.current?.destroy()
      managerRef.current = null
      loaderRef.current?.destroy()
      loaderRef.current = null
      displayRef.current = null
      displayInitializedRef.current = false
      managerInitializedRef.current = false
    }
    // A new accepted 15-run interval mounts a new component instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])

  const startFromGesture = () => {
    const ima = window.google?.ima
    const manager = managerRef.current
    if (!ima || !manager || !displayRef.current) return
    try {
      if (!displayInitializedRef.current) {
        displayRef.current.initialize()
        displayInitializedRef.current = true
      }
      if (!managerInitializedRef.current) {
        manager.init(adContainerRef.current?.clientWidth || 640, adContainerRef.current?.clientHeight || 360, ima.ViewMode.NORMAL)
        managerInitializedRef.current = true
      }
      manager.setVolume?.(muted ? 0 : 1)
      manager.start()
      setStatus('playing')
    } catch { setStatus('error') }
  }

  const toggleSound = () => {
    const nextMuted = !muted
    setMuted(nextMuted)
    managerRef.current?.setVolume?.(nextMuted ? 0 : 1)
  }

  return (
    <div className="absolute inset-2 z-30 overflow-hidden rounded-2xl border-[3px] border-[#78eaff] bg-[#050609] sm:inset-3" role="dialog" aria-label="Hilltop video advertisement">
      <video ref={videoRef} className="absolute inset-0 size-full bg-black object-contain" playsInline muted />
      <div ref={adContainerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/75 to-transparent px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/80">
        <span>{status === 'loading' ? 'Loading sponsor ad…' : status === 'playing' ? 'Sponsor message' : status === 'tap' ? 'Tap to play sponsor ad' : 'Ad unavailable'}</span>
        {status === 'playing' && <button type="button" onClick={toggleSound} className="pointer-events-auto rounded-lg bg-black/60 px-2 py-1 normal-case tracking-normal text-white">{muted ? 'Enable sound' : 'Mute'}</button>}
      </div>
      {(status === 'loading' || status === 'tap' || status === 'error') && <div className="absolute inset-0 z-20 grid place-items-center bg-[#101633]/75 p-5 text-center backdrop-blur-sm">
        <div className="max-w-sm">
          <p className="mb-2 text-lg font-black text-white">{status === 'loading' ? 'A quick sponsor break' : status === 'tap' ? 'Ready when you are' : 'No video ad available'}</p>
          <p className="mb-4 text-sm text-indigo-100/80">{status === 'loading' ? 'Loading the Hilltop VAST video.' : status === 'tap' ? 'Your browser needs a tap to start video playback.' : 'You can keep playing DASHCUP.'}</p>
          <div className="flex justify-center gap-3">
            {status === 'tap' && <button type="button" onClick={startFromGesture} className="rounded-xl border-2 border-[#13213d] bg-gradient-to-b from-[#8af4ff] to-[#5ad8ef] px-5 py-2.5 font-black text-[#15203e] shadow-[0_4px_0_#328aa2]">Play ad</button>}
            {(status === 'error' || status === 'tap') && <button type="button" onClick={onClose} className="rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 font-bold text-white">Continue</button>}
          </div>
        </div>
      </div>}
    </div>
  )
}
