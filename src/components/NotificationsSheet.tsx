"use client";

import React from "react";
import {
  Bell,
  CheckCheck,
  Hand,
  MessageSquare,
  ShieldAlert,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import type { AppNotification } from "@/types/oboud";

interface NotificationsSheetProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkOneRead: (id: string) => void;
}

function getNotifIcon(type: string) {
  switch (type) {
    case "friend_request":
      return <UserPlus className="w-4 h-4 text-indigo-600" />;
    case "friend_accepted":
      return <UserCheck className="w-4 h-4 text-emerald-600" />;
    case "friend_rejected":
      return <UserX className="w-4 h-4 text-amber-600" />;
    case "welcome_wave":
      return <Hand className="w-4 h-4 text-teal-600" />;
    case "report_alert":
    case "block_notice":
      return <ShieldAlert className="w-4 h-4 text-rose-600" />;
    default:
      return <MessageSquare className="w-4 h-4 text-sky-600" />;
  }
}

export function NotificationsSheet({
  open,
  onClose,
  notifications,
  unreadCount,
  onMarkAllRead,
  onMarkOneRead,
}: NotificationsSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-[100dvh] shadow-2xl border-r border-slate-200 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900">
                مركز الإشعارات والتنبيهات
              </h3>
              <p className="text-[11px] text-slate-500">
                {unreadCount > 0
                  ? `لديك ${unreadCount} إشعارات غير مقروءة`
                  : "جميع الإشعارات مقروءة"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2.5 py-1.5 text-[11px] font-bold transition cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>تحديد الكل كمقروء</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Bell className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-600">
                لا توجد إشعارات حالياً
              </p>
              <p className="text-xs text-slate-400">
                ستصلك إشعارات فورية عند استلام رسائل أو طلبات صداقة أو بلاغات أمان.
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.isRead) onMarkOneRead(n.id);
                }}
                className={`p-4 flex items-start gap-3 transition cursor-pointer ${
                  n.isRead
                    ? "bg-white hover:bg-slate-50"
                    : "bg-emerald-50/45 hover:bg-emerald-50/75"
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  {getNotifIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                      {n.title}
                    </span>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {n.body}
                  </p>
                  <span className="text-[10px] font-mono text-slate-400 block pt-0.5">
                    {new Date(n.createdAt).toLocaleString("ar-EG", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
