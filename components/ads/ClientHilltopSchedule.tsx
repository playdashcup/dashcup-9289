'use client'

import { useEffect } from 'react'

// Hilltop MultiTag Video Slider zone 7483905. Hilltop's tag owns the slider
// display and its one-minute popup delay; don't defer or sandbox the tag here.
const HILLTOP_VIDEO_SLIDER = 'https://peacefulbicycle.com/b/X/V.sTdDG-lO0RY/Wmcr/kepmK9FudZ/UklmkLPSTfc_0/OyD_MY5lMODfUstCNnzBQm4GMKzYkGwOOqQk'

// Hilltop MultiTag In-Page Push zone 7486709. Provider frequency caps control
// repeat displays, so load once rather than forcing refreshes every 35 seconds.
const HILLTOP_IN_PAGE_PUSH = 'https://peacefulbicycle.com/bqXhV.sTdXG/lQ0YYZWpcK/RepmD9_uFZCUOlEkZPJTgce0xOsDMYN3OMaDRkRtLNnzWQx4/NgjCc/x_MPwt'

function loadHilltopTag(placement: string, src: string) {
  if (document.querySelector(`script[data-dashcup-ad="${placement}"]`)) return

  const script = document.createElement('script')
  script.dataset.dashcupAd = placement
  Object.assign(script, { settings: {} })
  script.async = true
  script.referrerPolicy = 'no-referrer-when-downgrade'
  script.src = src
  document.body.appendChild(script)
}

/** Load the provider's client tags directly so their widgets can render in-page. */
export function ClientHilltopSchedule() {
  useEffect(() => {
    loadHilltopTag('video-slider', HILLTOP_VIDEO_SLIDER)
    loadHilltopTag('in-page-push', HILLTOP_IN_PAGE_PUSH)
  }, [])

  return null
}
