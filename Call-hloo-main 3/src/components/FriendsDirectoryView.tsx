"use client";

import React, { useState } from "react";
import {
  Check,
  MessageSquare,
  Phone,
  ShieldBan,
  UserCheck,
  UserPlus,
  UserX,
  Video,
} from "lucide-react";
import type {
  FriendContact,
  PendingFriendRequest,
  PublicUser,
} from "@/types/oboud";

interface FriendsDirectoryViewProps {
  friends: FriendContact[];
  incomingRequests: PendingFriendRequest[];
  outgoingRequests: PendingFriendRequest[];
  discoverUsers: PublicUser[];
  onSendRequest: (usernameOrId: {
    username?: string;
    targetUserId?: string;
  }) => Promise<string | null>;
  onUpdateFriend: (
    peerUserId: string,
    action: "accept" | "block" | "remove"
  ) => Promise<void>;
  onOpenChat: (friend: FriendContact) => void;
  onStartCall: (peer: PublicUser, type: "video" | "audio") => void;
}

export function FriendsDirectoryView({
  friends,
  incomingRequests,
  outgoingRequests,
  discoverUsers,
  onSendRequest,
  onUpdateFriend,
  onOpenChat,
  onStartCall,
}: FriendsDirectoryViewProps) {
  const [usernameInput, setUsernameInput] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAddByUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    setBusyId("form");
    setFeedback(null);
    const err = await onSendRequest({ username: usernameInput.trim() });
    setBusyId(null);
    if (err) {
      setFeedback({ type: "err", text: err });
    } else {
      setFeedback({
        type: "ok",
        text: `تم إرسال طلب الصداقة إلى @${usernameInput.trim()} بنجاح!`,
      });
      setUsernameInput("");
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F8FAFC] p-4 sm:p-8 pb-24 md:pb-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Add Friend Card */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                إضافة صديق جديد
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                أدخل اسم المستخدم لإرسال طلب صداقة فوري أو اختر من المقترحين أدناه
              </p>
            </div>
          </div>

          <form
            onSubmit={handleAddByUsername}
            className="flex flex-col sm:flex-row gap-2.5"
          >
            <input
              type="text"
              dir="ltr"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="مثال: tariq"
              className="flex-1 h-12 rounded-xl border border-slate-200 px-4 text-base font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={busyId === "form" || !usernameInput.trim()}
              className="h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-5 text-xs sm:text-sm transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>إرسال طلب صداقة</span>
            </button>
          </form>

          {feedback && (
            <div
              className={`rounded-xl px-4 py-2.5 text-xs font-bold border ${
                feedback.type === "ok"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-700"
              }`}
            >
              {feedback.text}
            </div>
          )}
        </div>

        {/* Incoming Pending Requests */}
        {incomingRequests.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              <span>طلبات صداقة واردة ({incomingRequests.length})</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {incomingRequests.map((req) => (
                <div
                  key={req.requestId}
                  className="rounded-2xl bg-white border border-amber-200 p-4 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={req.user.avatarUrl || "/images/oboud-avatar.jpg"}
                      alt={req.user.displayName}
                      className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        {req.user.displayName}
                      </div>
                      <div
                        className="text-xs font-mono text-slate-500 truncate"
                        dir="ltr"
                      >
                        @{req.user.username}
                      </div>
                      {req.user.bio && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {req.user.bio}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onUpdateFriend(req.user.id, "accept")}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-bold transition cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>قبول</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateFriend(req.user.id, "block")}
                      className="inline-flex items-center gap-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-2 text-xs font-bold transition cursor-pointer"
                    >
                      <ShieldBan className="w-3.5 h-3.5" />
                      <span>حظر</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accepted Friends */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>قائمة الأصدقاء ({friends.length})</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {friends.map((f) => (
              <div
                key={f.id}
                className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col justify-between gap-4 shadow-2xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <img
                        src={f.avatarUrl || "/images/oboud-avatar.jpg"}
                        alt={f.displayName}
                        className="w-13 h-13 rounded-full object-cover border border-slate-200"
                      />
                      <span
                        className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
                          f.presenceStatus === "online"
                            ? "bg-emerald-500"
                            : "bg-slate-300"
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-base text-slate-900 truncate">
                        {f.displayName}
                      </div>
                      <div
                        className="text-xs font-mono text-slate-500"
                        dir="ltr"
                      >
                        @{f.username}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-1">
                        {f.bio || "متاح للمراسلة والمكالمات"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold shrink-0 ${
                      f.presenceStatus === "online"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {f.presenceStatus === "online" ? "متصل الآن" : "غير متصل"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onOpenChat(f)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 py-2 px-3 text-xs font-bold transition cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>محادثة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartCall(f, "audio")}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2 px-3 text-xs font-bold transition cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>صوتية</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartCall(f, "video")}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-3 text-xs font-bold transition cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>فيديو P2P</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateFriend(f.id, "remove")}
                    title="إلغاء الصداقة"
                    className="rounded-xl p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Outgoing Requests + Discoverable Users */}
        {(discoverUsers.length > 0 || outgoingRequests.length > 0) && (
          <div className="space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900">
              أشخاص يمكنك إضافتهم على المنصة
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {discoverUsers.map((u) => (
                <div
                  key={u.id}
                  className="rounded-2xl bg-white border border-slate-200 p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={u.avatarUrl || "/images/oboud-avatar.jpg"}
                      alt={u.displayName}
                      className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        {u.displayName}
                      </div>
                      <div
                        className="text-xs font-mono text-slate-500"
                        dir="ltr"
                      >
                        @{u.username}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === u.id}
                    onClick={async () => {
                      setBusyId(u.id);
                      await onSendRequest({ targetUserId: u.id });
                      setBusyId(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 text-xs font-bold transition cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>إضافة صديق</span>
                  </button>
                </div>
              ))}

              {outgoingRequests.map((req) => (
                <div
                  key={req.requestId}
                  className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={req.user.avatarUrl || "/images/oboud-avatar.jpg"}
                      alt={req.user.displayName}
                      className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">
                        {req.user.displayName}
                      </div>
                      <span className="text-xs text-amber-700 font-semibold">
                        بانتظار قبول الطلب...
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateFriend(req.user.id, "remove")}
                    className="text-xs font-bold text-slate-500 hover:text-rose-600 px-3 py-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                  >
                    إلغاء الطلب
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
