'use client'

const HILLTOP_BANNER_ZONE = 'https://peacefulbicycle.com/b/X.VosHdPGBla0/YTWzcP/KeVm/9YuxZKUKlfkaPUTWcd0wOAD/QBwxOpTCMqtMNczRQK4eN/DTA/5-Nvwi'
const HILLTOP_CORNER_ZONE = 'https://peacefulbicycle.com/b/X/V.sTdDG-lO0RY/Wmcr/kepmK9FudZ/UklmkLPSTfc_0/OyD_MY5lMODfUstCNnzBQm4GMKzYkGwOOqQk'

function adDocument(scriptUrl: string) {
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

/** Keep each provider tag in a separate opaque-origin frame, clipped to its slot. */
export function HilltopArcadeAd() {
  return (
    <section aria-label="Hilltop banner advertisement" className="overflow-hidden rounded-2xl border border-white/10 bg-[#171b3d]/70 p-4 sm:p-5">
      <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200">Sponsored</p>
      <iframe
        title="Hilltop banner advertisement"
        className="mx-auto block h-[250px] w-full max-w-[970px] overflow-hidden rounded-xl border-0 bg-transparent"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-popups"
        srcDoc={adDocument(HILLTOP_BANNER_ZONE)}
      />
    </section>
  )
}

/** Keep the corner placement available regardless of which dashboard tab is selected. */
export function HilltopCornerAd() {
  return (
    <aside aria-label="Hilltop corner advertisement" className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-10 w-[min(320px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-white/15 bg-[#10142e] p-1.5 shadow-2xl">
      <p className="px-1 pb-1 font-mono text-[9px] font-bold uppercase tracking-widest text-indigo-100/55">Ad</p>
      <iframe
        title="Hilltop corner advertisement"
        className="block h-[250px] w-full overflow-hidden rounded-lg border-0 bg-transparent"
        loading="eager"
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-popups"
        srcDoc={adDocument(HILLTOP_CORNER_ZONE)}
      />
    </aside>
  )
}
