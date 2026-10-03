function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function rewardEmailVerificationTemplate(verificationUrl: string) {
  const safeUrl = escapeHtml(verificationUrl)
  return {
    subject: 'DASHCUP — Verify your reward email',
    html: `<div style="margin:0;background:#080a0f;padding:36px 16px;font-family:Arial,sans-serif;color:#f4f7fb"><div style="max-width:520px;margin:auto;border:1px solid #24303a;border-radius:18px;background:#11161e;padding:28px"><p style="color:#8de8f1;font-size:12px;letter-spacing:2px;font-weight:bold">DASHCUP REWARD CENTER</p><h1 style="font-size:26px">Verify your email</h1><p>Confirm this address to receive a reward code when you redeem a reward.</p><p><a href="${safeUrl}" style="display:inline-block;padding:13px 18px;background:#73e7f5;color:#10162b;border-radius:10px;font-weight:bold;text-decoration:none">Verify reward email</a></p><p style="color:#a8b3c2;font-size:13px">This one-time link expires in 30 minutes. If you did not request it, you can ignore this message.</p></div></div>`,
    text: `Verify your DASHCUP reward email with this one-time link (expires in 30 minutes): ${verificationUrl}\nIf you did not request this, ignore this message.`,
  }
}

export function rewardEmailTemplate(code: string, category: string) {
  const safeCode = escapeHtml(code)
  const rewardNames: Record<string, string> = {
    robux: 'Robux',
    vbucks: 'V-Bucks',
    freefire: 'Free Fire Diamonds',
    pubg: 'PUBG UC',
    cod: 'Call of Duty Points',
  }
  const rewardName = rewardNames[category] ?? 'Reward'
  const safeCategory = escapeHtml(rewardName)
  return {
    subject: `DASHCUP Reward — Your ${rewardName} Code`,
    html: `<div style="margin:0;background:#080a0f;padding:36px 16px;font-family:Arial,sans-serif;color:#f4f7fb"><div style="max-width:520px;margin:auto;border:1px solid #24303a;border-radius:18px;background:#11161e;padding:28px"><p style="color:#8de8f1;font-size:12px;letter-spacing:2px;font-weight:bold">DASHCUP REWARD</p><h1 style="font-size:26px">Congratulations!</h1><p>Your selected ${safeCategory} reward code:</p><div style="padding:16px;border-radius:10px;background:#080a0f;color:#ffe08a;font-family:monospace;font-size:18px;word-break:break-all">${safeCode}</div><p style="color:#a8b3c2;font-size:13px">Redeem it through the official ${safeCategory} service. Keep this code private; DASHCUP support will never ask you to send it back.</p></div></div>`,
    text: `Congratulations! Your selected ${rewardName} reward code is: ${code}\nRedeem it through the official ${rewardName} service. Keep this code private.`,
  }
}
