export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
  variant = 'confirm',
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="닫기" onClick={onCancel} />
      <div
        className="relative z-10 w-full max-w-[320px] rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <h2 id="confirm-modal-title" className="text-center text-base font-bold text-zinc-900">
            {title}
          </h2>
        ) : null}
        <p className={`text-center text-sm leading-relaxed text-zinc-700 ${title ? 'mt-3' : ''}`}>{message}</p>
        <div className={`mt-6 flex gap-2 ${variant === 'alert' ? 'justify-center' : ''}`}>
          {variant === 'confirm' && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 flex-1 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 active:bg-zinc-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-11 rounded-xl text-sm font-semibold text-white active:brightness-95 ${
              variant === 'alert' ? 'w-full max-w-[200px]' : 'flex-1'
            } bg-[var(--brand-blue)]`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
