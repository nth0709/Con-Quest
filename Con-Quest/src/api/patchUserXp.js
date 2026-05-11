/** @param {{ deltaXp: number, reason?: string }} p */
export async function patchUserXp({ deltaXp, reason }) {
  const base = import.meta.env?.VITE_API_BASE
  const token =
    typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') ?? localStorage.getItem('accessToken') : null

  if (!base || !token) {
    await new Promise((r) => setTimeout(r, 140))
    return { ok: true, totalXpDelta: deltaXp }
  }

  try {
    const res = await fetch(`${String(base).replace(/\/$/, '')}/api/v1/user/xp`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ deltaXp, reason: reason ?? 'quest_claim' }),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(txt || `HTTP ${res.status}`)
    }

    return res.json().catch(() => ({ ok: true, totalXpDelta: deltaXp }))
  } catch (error) {
    const message = String(error?.message ?? '')
    if (
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('Load failed') ||
      message.includes('401')
    ) {
      await new Promise((r) => setTimeout(r, 140))
      return { ok: true, totalXpDelta: deltaXp }
    }
    throw error
  }
}
