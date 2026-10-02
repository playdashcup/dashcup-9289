function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

export function rewardEmailTemplate(code: string, category: string) {
  const safeCode = escapeHtml(code)
  const safeCategory = escapeHtml(category)
  return {
    subject: `Your ChickenDash ${safeCategory} reward`,
    html: `<div style="margin:0;background:#080a0f;padding:36px 16px;font-family:Arial,sans-serif;color:#f4f7fb"><div style="max-width:520px;margin:auto;border:1px solid #24303a;border-radius:18px;background:#11161e;padding:28px"><p style="color:#8de8f1;font-size:12px;letter-spacing:2px;font-weight:bold">CHICKENDASH REWARD</p><h1 style="font-size:26px">Your reward is ready</h1><p>Your ${safeCategory} reward code:</p><div style="padding:16px;border-radius:10px;background:#080a0f;color:#ffe08a;font-family:monospace;font-size:18px;word-break:break-all">${safeCode}</div><p style="color:#a8b3c2;font-size:13px">Keep this code private. DASHCUP support will never ask you to send it back.</p></div></div>`,
    text: `Your ChickenDash ${category} reward code is: ${code}\nKeep this code private.`,
  }
}
