const HILLTOP_RUN_AD_TAG = 'https://peacefulbicycle.com/bqXhV.sTdXG/lQ0YYZWpcK/RepmD9_uFZCUOlEkZPJTgce0xOsDMYN3OMaDRkRtLNnzWQx4/NgjCc/x_MPwt'

/** Load the configured Hilltop placement after each tenth completed run. */
export function loadHilltopRunAd(completedRunCount: number) {
  if (typeof document === 'undefined' || !Number.isSafeInteger(completedRunCount) || completedRunCount < 10 || completedRunCount % 10 !== 0) return
  if (document.querySelector(`[data-dashcup-hilltop-run="${completedRunCount}"]`)) return

  const script = document.createElement('script')
  script.dataset.dashcupHilltopRun = String(completedRunCount)
  script.src = HILLTOP_RUN_AD_TAG
  script.async = true
  script.referrerPolicy = 'no-referrer-when-downgrade'
  ;(document.head || document.body).appendChild(script)
}
