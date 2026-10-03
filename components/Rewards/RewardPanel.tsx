'use client'

import { useState } from 'react'
import type { EligibilityResponse, MeResponse } from '@/lib/types'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/types'
import { CheckCircle2, Gift, Mail, Send } from 'lucide-react'

const gifts = [
  ['robux', 'Robux'],
  ['vbucks', 'V-Bucks'],
  ['freefire', 'Free Fire (Diamonds)'],
  ['pubg', 'PUBG (UC)'],
  ['cod', 'Call of Duty Mobile (COD Points)'],
] as const

export function RewardPanel({
  eligibility,
  me,
  rewardStock,
  onDetailsSaved,
}: {
  eligibility: EligibilityResponse | null
  me: MeResponse | null
  rewardStock?: Record<string, number>
  onDetailsSaved: (rewardEmail: string, giftChoice: string, emailVerified: boolean) => void
}) {
  const [email, setEmail] = useState(me?.rewardEmail ?? '')
  const [gift, setGift] = useState(me?.giftChoice ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [localDeliveryStatus, setLocalDeliveryStatus] = useState<EligibilityResponse['deliveryStatus']>()
  const deliveryStatus = localDeliveryStatus ?? eligibility?.deliveryStatus ?? null

  const selectedStock = gift ? rewardStock?.[gift] : undefined
  const selectedUnavailable = selectedStock === 0
  const canRetry = deliveryStatus === 'rejected' && eligibility?.giftChoice === gift
  const alreadyProcessing = ['reserved', 'accepted', 'provider_unknown', 'sent'].includes(deliveryStatus ?? '')
  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.updateRewardEmail(email, gift)
      onDetailsSaved(result.rewardEmail, result.giftChoice, result.emailVerified)
      setMessage(result.emailVerified
        ? 'Reward details saved. This email is verified.'
        : result.verificationStatus === 'sent'
          ? 'Check your inbox and click the verification link before redeeming.'
          : result.verificationStatus === 'pending'
            ? 'Verification email status is pending. Check your inbox before trying again.'
            : 'Reward details saved. Email verification is unavailable until email delivery is configured.')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'We couldn\'t save your details.')
    } finally {
      setBusy(false)
    }
  }

  const redeem = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await api.redeemReward(gift)
      setLocalDeliveryStatus(result.status as EligibilityResponse['deliveryStatus'])
      setMessage(result.status === 'sent'
        ? 'Delivery confirmed. Check your inbox for the reward code.'
        : result.status === 'accepted'
          ? 'Your reward is processing. We’ll email the selected code when delivery is confirmed.'
          : 'Your reward is processing. You can check this page again for its delivery status.')
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'DELIVERY_REJECTED') setLocalDeliveryStatus('rejected')
      if (cause instanceof ApiError && cause.code === 'PROVIDER_UNKNOWN') setLocalDeliveryStatus('provider_unknown')
      setMessage(cause instanceof Error ? cause.message : 'We couldn\'t process the reward request.')
    } finally {
      setBusy(false)
    }
  }

  const deliveryMessage = deliveryStatus === 'sent'
    ? 'Your selected reward was sent. Check your inbox.'
    : deliveryStatus === 'accepted' || deliveryStatus === 'reserved'
      ? 'Reward processing — the selected code is reserved while email delivery completes.'
      : deliveryStatus === 'provider_unknown'
        ? 'Delivery status is being checked. Please do not submit another redemption.'
        : deliveryStatus === 'rejected'
          ? 'Email delivery failed. You can retry the same redemption and reward.'
          : null

  return (
    <section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-8">
      <div className="flex items-start justify-between">
        <div><p className="font-mono text-xs uppercase tracking-[.18em] text-cyan-300">Reward center</p><h2 className="mt-1 text-2xl font-black text-white">Your place in the run</h2></div>
        <div className="grid size-11 place-items-center rounded-xl bg-yellow-300/10 text-yellow-200"><Gift /></div>
      </div>
      <div className={`mt-6 rounded-2xl border p-5 ${eligibility?.eligible ? 'border-emerald-300/20 bg-emerald-300/[0.06]' : 'border-white/10 bg-white/[0.025]'}`}>
        <p className="text-lg font-black text-white">{eligibility?.eligible ? 'Congratulations!' : 'Not currently eligible'}</p>
        <p className="mt-1 text-sm text-zinc-400">Closed-cycle rank: <strong className="font-mono text-white">{eligibility?.rank ? `#${eligibility.rank}` : '—'}</strong></p>
        <p className="mt-2 text-xs text-zinc-500">{eligibility?.eligible ? 'You are eligible for a reward.' : 'Top 20 are eligible for this cycle.'}</p>
      </div>
      {deliveryMessage && <p className="mt-4 rounded-xl border border-cyan-200/15 bg-cyan-200/5 px-4 py-3 text-sm text-cyan-100" role="status">{deliveryMessage}</p>}
      <div className="mt-7 grid gap-5">
        <label className="grid gap-2 text-sm font-bold text-zinc-200">Reward email<div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3"><Mail className="size-4 text-zinc-500" /><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600" /></div><span className={`text-xs ${me?.rewardEmailVerified ? 'text-emerald-200' : 'text-amber-200'}`}>{me?.rewardEmailVerified ? 'Verified for reward delivery' : 'Email verification required before redemption'}</span></label>
        <fieldset><legend className="mb-2 text-sm font-bold text-zinc-200">Choose exactly one reward</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {gifts.map(([value, label]) => {
            const available = rewardStock?.[value]
            return <button type="button" key={value} onClick={() => setGift(value)} aria-pressed={gift === value} className={`rounded-xl border px-3 py-3 text-xs font-bold transition ${gift === value ? 'border-cyan-300 bg-cyan-300/10 text-cyan-200' : 'border-white/10 bg-black/20 text-zinc-400 hover:text-white'}`}>
              {label}<span className="mt-1 block text-[10px] font-medium opacity-75">{available === undefined ? 'Stock status loading' : available > 0 ? `${available} available` : 'Currently unavailable'}</span>
            </button>
          })}
        </div></fieldset>
      </div>
      {message && <p className="mt-4 text-sm text-cyan-200" role="status">{message}</p>}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button onClick={save} disabled={busy || !email || !gift} className="flex h-[3.25rem] flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-[15px] font-bold text-white hover:bg-white/10 disabled:opacity-40 sm:h-12 sm:px-3 sm:text-sm">Save Changes</button>
        <button onClick={redeem} disabled={busy || !me?.rewardEmailVerified || (!eligibility?.eligible && !canRetry) || !email || !gift || alreadyProcessing || (selectedUnavailable && !canRetry) || Boolean(eligibility?.redeemed && !canRetry)} className="flex h-[3.25rem] flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 text-[15px] font-black text-zinc-950 hover:bg-cyan-200 disabled:opacity-40 sm:h-12 sm:px-3 sm:text-sm"><Send className="size-4" />{busy ? 'Processing…' : canRetry ? 'Retry Email' : eligibility?.redeemed ? 'Already redeemed' : 'Redeem Reward'}</button>
      </div>
      {selectedUnavailable && <p className="mt-3 text-sm font-bold text-amber-200">Currently unavailable — choose another reward or try later.</p>}
      <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><CheckCircle2 className="size-3.5 text-emerald-300" /> Codes are encrypted at rest and never displayed here.</p>
    </section>
  )
}
