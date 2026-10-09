'use client';

export default function ErrorBanner({
  title,
  message,
  onRetry,
  actionLabel = "Tentar novamente",
  tone = "danger",
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  actionLabel?: string;
  tone?: "danger" | "neutral";
}) {
  const danger = tone === "danger";
  return (
    <div
      role="alert"
      className={`w-full max-w-md rounded-xl border px-4 py-3.5 text-sm animate-fadeIn ${danger ? "border-danger/40 bg-danger/10" : "border-white/10 bg-black/45"}`}
    >
      <p className={`font-semibold ${danger ? "text-danger" : "text-white"}`}>{title}</p>
      <p className="mt-1 text-white/75 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg bg-white/10 hover:bg-white/15 transition-colors px-3 py-1.5 text-sm font-medium text-white"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
