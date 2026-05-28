import { apiFetch } from './client'

export function fetchPosts() {
  return apiFetch('/api/v1/posts', { auth: false })
}

export function createPost(payload) {
  return apiFetch('/api/v1/posts', {
    method: 'POST',
    body: payload,
  })
}

export function updatePostRequest(postId, payload) {
  return apiFetch(`/api/v1/posts/${postId}`, {
    method: 'PATCH',
    body: payload,
  })
}

export function deletePostRequest(postId) {
  return apiFetch(`/api/v1/posts/${postId}`, {
    method: 'DELETE',
  })
}

export function createCommentRequest(postId, payload) {
  return apiFetch(`/api/v1/posts/${postId}/comments`, {
    method: 'POST',
    body: payload,
  })
}

export function updateCommentRequest(postId, commentId, payload) {
  return apiFetch(`/api/v1/posts/${postId}/comments/${commentId}`, {
    method: 'PATCH',
    body: payload,
  })
}

export function deleteCommentRequest(postId, commentId) {
  return apiFetch(`/api/v1/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
  })
}
