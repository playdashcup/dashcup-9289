'use client'

import { useEffect, useRef, useState } from 'react'

const HILLTOP_VAST_TAG = 'https://second-director.com/dnm.FZzsdrG/NMvuZjG/UA/Xegmm9Yu/ZbU/lTkMPWTYc/0UO_DhQMz/NGTDMRteN-zvQC4lNQDTMu1/NjwD'
const IMA_SDK_URL = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js'

type ImaEvent = { getAdsManager(video: HTMLVideoElement, settings: ImaSettings): ImaManager }
type ImaSettings = Record<string, never>
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
  return sdkPromise
}

/** Minimal IMA video surface; no custom ad card, frame, or no-fill message. */
export function HilltopVastBreak({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const adContainerRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef<ImaDisplayContainer | null>(null)
  const managerRef = useRef<ImaManager | null>(null)
  const displayInitializedRef = useRef(false)
  const managerInitializedRef = useRef(false)
  const contentPausedRef = useRef(false)
  const timeoutRef = useRef<number | undefined>(undefined)
  const [playing, setPlaying] = useState(false)
  const [adsReady, setAdsReady] = useState(false)
  const [playError, setPlayError] = useState(false)

  useEffect(() => {
    if (!videoRef.current || !adContainerRef.current) return
    let disposed = false
    let finished = false
    let manager: ImaManager | undefined
    let loader: ImaLoader | undefined
    displayInitializedRef.current = false
    managerInitializedRef.current = false
    contentPausedRef.current = false
    const finish = () => {
      if (finished) return
      finished = true
      if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current)
      manager?.destroy()
      loader?.destroy()
      managerRef.current = null
      displayRef.current = null
      if (!disposed) {
        setAdsReady(false)
        onClose()
      }
    }

    // Fail open so a blocked SDK or empty ad response cannot trap the player.
    timeoutRef.current = window.setTimeout(finish, 30_000)
    void loadImaSdk().then((ima) => {
      const video = videoRef.current
      const adContainer = adContainerRef.current
      if (disposed || !video || !adContainer) return
      const display = new ima.AdDisplayContainer(adContainer, video)
      displayRef.current = display
      const adsLoader = new ima.AdsLoader(display)
      loader = adsLoader
      adsLoader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, finish)
      adsLoader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (event) => {
        if (disposed || !videoRef.current || !adContainerRef.current) return
        const adsManager = event.getAdsManager(video, new ima.AdsRenderingSettings())
        manager = adsManager
        managerRef.current = adsManager
        adsManager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => {
          if (!contentPausedRef.current && !disposed) setPlayError(true)
          else finish()
        })
        adsManager.addEventListener(ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => {
          contentPausedRef.current = true
          if (!disposed) setAdsReady(false)
          if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current)
          // The supplied VAST currently returns a 95-second creative.
          timeoutRef.current = window.setTimeout(finish, 120_000)
          if (!disposed) setPlaying(true)
        })
        adsManager.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, finish)
        adsManager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, finish)
        // IMA's display container and manager are started by the visible button
        // below, directly in the player's user-gesture handler.
        if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current)
        timeoutRef.current = window.setTimeout(finish, 60_000)
        if (!disposed) setAdsReady(true)
      })
      const request = new ima.AdsRequest()
      request.adTagUrl = HILLTOP_VAST_TAG
      request.linearAdSlotWidth = adContainer.clientWidth || 640
      request.linearAdSlotHeight = adContainer.clientHeight || 360
      request.nonLinearAdSlotWidth = request.linearAdSlotWidth
      request.nonLinearAdSlotHeight = Math.round(request.linearAdSlotHeight / 3)
      request.setAdWillAutoPlay?.(false)
      request.setAdWillPlayMuted?.(true)
      adsLoader.requestAds(request)
    }).catch(finish)

    return () => {
      disposed = true
      if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current)
      manager?.destroy()
      loader?.destroy()
      managerRef.current = null
      displayRef.current = null
      displayInitializedRef.current = false
      managerInitializedRef.current = false
    }
  }, [onClose])

  const startFromGesture = () => {
    const ima = window.google?.ima
    const display = displayRef.current
    const manager = managerRef.current
    const container = adContainerRef.current
    if (!ima || !display || !manager || !container || !adsReady) return
    try {
      if (!displayInitializedRef.current) {
        display.initialize()
        displayInitializedRef.current = true
      }
      if (!managerInitializedRef.current) {
        manager.init(container.clientWidth || 640, container.clientHeight || 360, ima.ViewMode.NORMAL)
        managerInitializedRef.current = true
      }
      manager.setVolume?.(0)
      setAdsReady(false)
      setPlayError(false)
      if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => onClose(), 120_000)
      manager.start()
    } catch {
      setPlayError(true)
      setAdsReady(true)
    }
  }

  return (
    <div className="pointer-events-none absolute inset-2 z-30 overflow-hidden data-[playing=true]:pointer-events-auto data-[playing=true]:bg-black sm:inset-3" data-playing={playing} aria-label="Video advertisement">
      <video ref={videoRef} className="absolute inset-0 size-full bg-transparent object-contain" playsInline muted />
      <div ref={adContainerRef} className="absolute inset-0" />
      {adsReady && !playing && <button type="button" onClick={startFromGesture} className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-[#13213d] bg-gradient-to-b from-[#b9ff70] to-[#81e849] px-5 py-3 text-sm font-black uppercase tracking-wide text-[#18233a] shadow-[0_4px_0_#397e39]">Play video ad</button>}
      {playError && !playing && <p role="status" className="pointer-events-none absolute inset-x-3 bottom-3 text-center text-xs font-semibold text-white drop-shadow">This ad could not start. You can keep playing.</p>}
    </div>
  )
}
