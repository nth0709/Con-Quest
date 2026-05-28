import { apiFetch } from './client'

export function signupRequest(payload) {
  return apiFetch('/api/v1/auth/signup', {
    method: 'POST',
    body: payload,
    auth: false,
  })
}

export function loginRequest(payload) {
  return apiFetch('/api/v1/auth/login', {
    method: 'POST',
    body: payload,
    auth: false,
  })
}

export function fetchMe() {
  return apiFetch('/api/v1/users/me')
}

export function patchMe(payload) {
  return apiFetch('/api/v1/users/me', {
    method: 'PATCH',
    body: payload,
  })
}

