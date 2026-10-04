'use client'

/**
 * Keep a clearly marked slot for the Arcade banner, but do not execute the
 * supplied provider tag: in the live browser it rendered repeated fake
 * browser-security warnings instead of a normal banner.
 */
export function HilltopArcadeAd() {
  return (
    <section aria-label="Sponsored banner placement" className="overflow-hidden rounded-2xl border border-white/10 bg-[#171b3d]/70 p-4 sm:p-5">
      <div className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-gradient-to-br from-[#20274f] to-[#141831] px-5 text-center">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200">Sponsored placement</p>
        <p className="mt-2 text-sm font-bold text-white">Banner ads are paused</p>
        <p className="mt-1 max-w-md text-xs leading-5 text-indigo-100/60">This sponsor placement is temporarily paused while we review ad quality.</p>
      </div>
    </section>
  )
}
