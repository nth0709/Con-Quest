import { apiFetch } from './client'

export function fetchNotifications() {
  return apiFetch('/api/v1/notifications')
}

export function generateNotifications() {
  return apiFetch('/api/v1/notifications/generate', { method: 'POST' })
}

export function markNotificationRead(notificationId) {
  return apiFetch(`/api/v1/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' })
}
