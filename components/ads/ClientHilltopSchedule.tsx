'use client'

import { useEffect, useState } from 'react'

const HILLTOP_VIDEO_ZONE = 'https://peacefulbicycle.com/byXMVys.d/GOl/0GYDWHcZ/uedm-9FugZqU/lakHPuTEca0hOzDPYe3EMBDmkBtUN/zRQo4/Nrj/cuxWMIwh'
const HILLTOP_IN_PAGE_ZONE = 'https://peacefulbicycle.com/bqXhV.sTdXG/lQ0YYZWpcK/RepmD9_uFZCUOlEkZPJTgce0xOsDMYN3OMaDRkRtLNnzWQx4/NgjCc/x_MPwt'

function createAdDocument(scriptUrl: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="referrer" content="no-referrer-when-downgrade">
    <style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}</style>
  </head>
  <body>
    <script>
      (function(settings){
        var d=document,s=d.createElement('script'),l=d.currentScript||d.scripts[d.scripts.length-1];
        s.settings=settings||{};
        s.src=${JSON.stringify(scriptUrl)};
        s.async=true;
        s.referrerPolicy='no-referrer-when-downgrade';
        l.parentNode.insertBefore(s,l);
      })({});
    </script>
  </body>
</html>`
}

function DelayedAd({
  title,
  scriptUrl,
  intervalMs,
  placement,
  height,
}: {
  title: string
  scriptUrl: string
  intervalMs: number
  placement: 'video' | 'in-page'
  height: number
}) {
  const [ready, setReady] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let elapsed = false
    const makeReadyWhenVisible = () => {
      if (elapsed && document.visibilityState === 'visible') setReady(true)
    }
    const timer = window.setTimeout(() => {
      elapsed = true
      makeReadyWhenVisible()
    }, intervalMs)
    document.addEventListener('visibilitychange', makeReadyWhenVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', makeReadyWhenVisible)
    }
  }, [intervalMs])

  if (!ready || dismissed) return null

  const placementClass = placement === 'video'
    ? 'bottom-[calc(env(safe-area-inset-bottom)+6rem)] left-3 md:bottom-4 md:left-4'
    : 'right-3 top-20 md:bottom-4 md:right-4 md:top-auto'

  return (
    <div className={`pointer-events-none fixed z-40 w-[min(320px,calc(100vw-1.5rem))] ${placementClass}`}>
      <iframe
        title={title}
        className="pointer-events-auto block w-full overflow-hidden border-0 bg-transparent"
        style={{ height }}
        loading="eager"
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-popups"
        allow="autoplay"
        srcDoc={createAdDocument(scriptUrl)}
      />
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={() => setDismissed(true)}
        className="pointer-events-auto absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-[#11142f]/95 text-sm font-black text-white shadow-lg ring-1 ring-white/30"
      >
        ×
      </button>
    </div>
  )
}

/** Client-only delayed ad tags; provider frequency caps control repeat displays. */
export function ClientHilltopSchedule() {
  return (
    <>
      <DelayedAd
        title="Hilltop video placement"
        scriptUrl={HILLTOP_VIDEO_ZONE}
        // Let the provider initialize the zone once instead of refreshing impressions.
        intervalMs={60_000}
        placement="video"
        height={180}
      />
      <DelayedAd
        title="Hilltop in-page placement"
        scriptUrl={HILLTOP_IN_PAGE_ZONE}
        intervalMs={35_000}
        placement="in-page"
        height={250}
      />
    </>
  )
}
