export function notifyAuthChanged() {
  window.dispatchEvent(new CustomEvent('conquest-auth-changed'))
}
