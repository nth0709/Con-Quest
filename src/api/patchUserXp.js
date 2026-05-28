/** @param {{ deltaXp: number, reason?: string }} p */
export async function patchUserXp({ deltaXp, reason }) {
  const base = import.meta.env?.VITE_API_BASE
  const token =
    typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') ?? localStorage.getItem('accessToken') : null

  if (!base || !token) {
    await new Promise((r) => setTimeout(r, 140))
    return { ok: true, totalXpDelta: deltaXp, fallback: true }
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

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json().catch(() => ({ ok: true, totalXpDelta: deltaXp }))
  } catch {
    // XP rewards must still feel responsive while the backend is stopped or out of date.
    await new Promise((r) => setTimeout(r, 140))
    return { ok: true, totalXpDelta: deltaXp, fallback: true }
  }
}

