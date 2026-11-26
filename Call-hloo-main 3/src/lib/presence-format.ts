export function formatArabicLastSeen(
  lastSeenAt?: string | Date | null
): string {
  if (!lastSeenAt) return "غير متاح";
  const ts = new Date(lastSeenAt).getTime();
  if (Number.isNaN(ts)) return "غير متصل";

  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) {
    return "آخر ظهور: منذ لحظات";
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return "آخر ظهور: منذ دقيقة";
  if (diffMin === 2) return "آخر ظهور: منذ دقيقتين";
  if (diffMin <= 10) return `آخر ظهور: منذ ${diffMin} دقائق`;
  if (diffMin < 60) return `آخر ظهور: منذ ${diffMin} دقيقة`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return "آخر ظهور: منذ ساعة";
  if (diffHours === 2) return "آخر ظهور: منذ ساعتين";
  if (diffHours <= 10) return `آخر ظهور: منذ ${diffHours} ساعات`;
  if (diffHours < 24) return `آخر ظهور: منذ ${diffHours} ساعة`;

  const dateObj = new Date(ts);
  return `آخر ظهور: ${dateObj.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function getPresenceBadgePresentation(params: {
  presenceStatus: string;
  lastSeenAt?: string | Date | null;
  presenceHiddenByPrivacy?: boolean;
}): {
  label: string;
  shortLabel: string;
  dotClass: string;
  pillClass: string;
} {
  const { presenceStatus, lastSeenAt, presenceHiddenByPrivacy } = params;

  if (presenceHiddenByPrivacy) {
    return {
      label: "غير متاح",
      shortLabel: "غير متاح",
      dotClass: "bg-slate-400",
      pillClass: "bg-slate-100 text-slate-600 border border-slate-200",
    };
  }

  if (presenceStatus === "online") {
    return {
      label: "متصل الآن",
      shortLabel: "متصل الآن",
      dotClass: "bg-emerald-500",
      pillClass:
        "bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold",
    };
  }

  if (presenceStatus === "in_call") {
    return {
      label: "مشغول بمكالمة",
      shortLabel: "مشغول بمكالمة",
      dotClass: "bg-violet-600 animate-pulse",
      pillClass:
        "bg-violet-50 text-violet-700 border border-violet-200 font-bold",
    };
  }

  if (presenceStatus === "unavailable" || presenceStatus === "busy") {
    return {
      label: "غير متاح",
      shortLabel: "غير متاح",
      dotClass: "bg-amber-500",
      pillClass:
        "bg-amber-50 text-amber-800 border border-amber-200 font-bold",
    };
  }

  return {
    label: formatArabicLastSeen(lastSeenAt),
    shortLabel: "غير متصل",
    dotClass: "bg-slate-300",
    pillClass: "bg-slate-100 text-slate-600 border border-slate-200",
  };
}
