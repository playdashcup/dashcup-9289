'use client'

const HILLTOP_AD_DOCUMENT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="referrer" content="no-referrer-when-downgrade">
    <style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}</style>
  </head>
  <body>
    <script>
      (function(yldqm){
        var d=document,
            s=d.createElement('script'),
            l=d.currentScript || d.scripts[d.scripts.length - 1];
        s.settings=yldqm || {};
        s.src="//peacefulbicycle.com/bPXyV/s_d.GFlF0sYkWhca/aeYmR9JubZhUylaktP/TucG0/OkDZY/3tM/D/kPtBNdzjQz4-NRjlcfx/MfwX";
        s.async=true;
        s.referrerPolicy='no-referrer-when-downgrade';
        l.parentNode.insertBefore(s,l);
      })({});
    </script>
  </body>
</html>`

/**
 * Keep the ad provider in an opaque-origin frame so its scripts and fixed
 * overlays cannot cover or intercept navigation elsewhere in DASHCUP.
 */
export function HilltopArcadeAd() {
  return (
    <section aria-label="Sponsored advertisement" className="overflow-hidden rounded-2xl border border-white/10 bg-[#171b3d]/70 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200">Sponsored</p>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-indigo-100/50">Advertisement</span>
      </div>
      <iframe
        title="Sponsored advertisement"
        className="block h-[250px] w-full overflow-hidden rounded-xl border-0 bg-transparent"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        srcDoc={HILLTOP_AD_DOCUMENT}
      />
    </section>
  )
}
