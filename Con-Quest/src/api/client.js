const API_BASE = String(import.meta.env?.VITE_API_BASE ?? '').replace(/\/$/, '')

export function hasApiBase() {
  return API_BASE.length > 0
}

export function getApiBase() {
  return API_BASE
}

export function getAccessToken() {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem('accessToken') ?? localStorage.getItem('authToken')
}

export function saveAccessToken(token) {
  if (typeof localStorage === 'undefined') return
  if (!token) return
  localStorage.setItem('accessToken', token)
  localStorage.setItem('authToken', token)
}

export function clearAccessToken() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem('accessToken')
  localStorage.removeItem('authToken')
}

export async function apiFetch(path, { method = 'GET', body, headers = {}, auth = true, signal } = {}) {
  if (!hasApiBase()) {
    throw new Error('API_BASE_MISSING')
  }

  const token = auth ? getAccessToken() : null
  const init = {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    signal,
  }

  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const res = await fetch(`${API_BASE}${path}`, init)
  const text = await res.text().catch(() => '')
  const data = text ? safeJsonParse(text) : null

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && data.detail) ||
      (data && typeof data === 'object' && data.message) ||
      text ||
      `HTTP ${res.status}`
    throw new Error(String(message))
  }

  return data
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

