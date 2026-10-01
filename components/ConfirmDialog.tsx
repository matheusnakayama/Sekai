"use client";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-lg bg-discord-bg-secondary p-5 shadow-xl">
        <h3 className="mb-2 text-base font-bold text-discord-header-primary">{title}</h3>
        <p className="mb-5 text-sm text-discord-text-normal">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="text-sm text-discord-text-muted hover:underline">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={
              danger
                ? "rounded bg-discord-danger px-4 py-2 text-sm font-medium text-white hover:bg-discord-danger-hover"
                : "rounded bg-theme-gradient px-4 py-2 text-sm font-medium text-white hover:brightness-110"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
