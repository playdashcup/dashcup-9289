'use client'

import { useEffect, useRef } from 'react'

const BANNER_SCRIPT = 'https://peacefulbicycle.com/b/X.VosHdPGBla0/YTWzcP/KeVm/9YuxZKUKlfkaPUTWcd0wOAD/QBwxOpTCMqtMNczRQK4eN/DTA/5-Nvwi'

export function HilltopBanner() {
  return <AdPlacement label="Advertisement" scriptUrl={BANNER_SCRIPT} className="min-h-28" />
}

function AdPlacement({ label, scriptUrl, className }: { label: string; scriptUrl: string; className: string }) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const slot = container.current
    if (!slot) return

    // Keep third-party ad code isolated to its visible placement and load it only
    // while the Arcade view is mounted.
    const loader = document.createElement('script')
    loader.async = true
    loader.referrerPolicy = 'no-referrer-when-downgrade'
    loader.textContent = `(function(settings){var d=document,s=d.createElement('script'),l=d.currentScript||d.scripts[d.scripts.length-1];s.settings=settings||{};s.src=${JSON.stringify(scriptUrl)};s.async=true;s.referrerPolicy='no-referrer-when-downgrade';l.parentNode.insertBefore(s,l);})({})`
    slot.appendChild(loader)

    return () => { slot.replaceChildren() }
  }, [scriptUrl])

  return (
    <section aria-label={label} className={`overflow-hidden rounded-2xl border border-white/10 bg-[#171b3d]/70 p-3 ${className}`}>
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-indigo-100/45">{label}</p>
      <div ref={container} className="grid min-h-20 place-items-center overflow-hidden rounded-xl" />
    </section>
  )
}
