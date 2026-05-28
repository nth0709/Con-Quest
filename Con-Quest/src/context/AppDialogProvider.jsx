import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import ConfirmModal from '../components/ConfirmModal'

const Ctx = createContext(null)

export function AppDialogProvider({ children }) {
  const [modal, setModal] = useState(null)

  const close = useCallback(() => setModal(null), [])

  const showAlert = useCallback(({ message, title = '' }) => {
    return new Promise((resolve) => {
      const done = () => {
        close()
        resolve(true)
      }
      setModal({
        variant: 'alert',
        title,
        message,
        confirmLabel: '확인',
        onConfirm: done,
        onCancel: done,
      })
    })
  }, [close])

  const showConfirm = useCallback(({ message, title = '', confirmLabel, cancelLabel }) => {
    return new Promise((resolve) => {
      setModal({
        variant: 'confirm',
        title,
        message,
        confirmLabel: confirmLabel ?? '확인',
        cancelLabel: cancelLabel ?? '취소',
        onConfirm: () => {
          close()
          resolve(true)
        },
        onCancel: () => {
          close()
          resolve(false)
        },
      })
    })
  }, [close])

  const value = useMemo(() => ({ showAlert, showConfirm }), [showAlert, showConfirm])

  return (
    <Ctx.Provider value={value}>
      {children}
      <ConfirmModal
        open={Boolean(modal)}
        variant={modal?.variant}
        title={modal?.title}
        message={modal?.message ?? ''}
        confirmLabel={modal?.confirmLabel}
        cancelLabel={modal?.cancelLabel}
        onConfirm={modal?.onConfirm}
        onCancel={modal?.onCancel ?? close}
      />
    </Ctx.Provider>
  )
}

export function useAppDialog() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppDialog outside AppDialogProvider')
  return v
}
