import type {
  AvailabilityMode,
  MediaMeta,
  PresenceStatusValue,
  PrivacyScope,
  PrivacySettings,
  SignalingJsonLog,
} from "@/db/schema";

export type {
  AvailabilityMode,
  PresenceStatusValue,
  PrivacyScope,
  PrivacySettings,
};

export const PUBLIC_TEAM_GROUP_ID = "00000000-0000-0000-0000-000000000b0d";

export interface PublicUser {
  id: string;
  role?: "OWNER" | "SUBSCRIBER";
  username: string;
  firstName?: string | null;
  displayName: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  groupTag?: string | null;
  availabilityMode?: AvailabilityMode;
  privacySettings?: PrivacySettings;
  avatarUrl: string | null;
  bio: string | null;
  presenceStatus: PresenceStatusValue | string;
  effectivePresence?: "online" | "offline" | "in_call" | "unavailable";
  lastSeenAt?: string | Date | null;
}

export interface SafeSearchResultUser {
  id: string;
  username: string;
  firstName: string | null;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string | null;
  groupTag: string | null;
  presenceStatus: "online" | "offline" | "in_call" | "unavailable";
  lastSeenAt: string | null;
  presenceHiddenByPrivacy: boolean;
  availabilityMode: AvailabilityMode;
  isHiddenPrivate: boolean;
  hiddenMessage?: string;
  relationship:
    | "self"
    | "friend"
    | "incoming_pending"
    | "outgoing_pending"
    | "blocked"
    | "none";
  canMessageInternally: boolean;
  canCall: boolean;
  visibleEmail: string | null;
  visiblePhone: string | null;
  matchScore: number;
  matchReasons: string[];
  createdAt?: string | Date;
}

export interface DiscoverySummaryStats {
  totalUsers: number;
  onlineNow: number;
  friendsCount: number;
  incomingRequestsCount: number;
  outgoingRequestsCount: number;
}

export interface FriendContact extends PublicUser {
  isGroup?: boolean;
  memberCount?: number;
  canMessageInternally?: boolean;
  canCall?: boolean;
  lastMessage?: {
    id: string;
    type: "text" | "image" | "audio" | "video";
    content: string | null;
    senderId: string;
    createdAt: string | Date;
  } | null;
}

export interface PendingFriendRequest {
  requestId: string;
  createdAt: string | Date;
  user: PublicUser;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string | null;
  groupId?: string | null;
  type: "text" | "image" | "audio" | "video";
  content: string | null;
  mediaMeta?: MediaMeta | null;
  createdAt: string | Date;
  sender?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
}

export interface CallLogItem {
  id: string;
  callerId: string;
  calleeId: string;
  status: "ringing" | "answered" | "ended" | "missed";
  type: "audio" | "video";
  startAt: string | Date | null;
  endAt: string | Date | null;
  createdAt: string | Date;
  durationSec: number | null;
  direction: "outgoing" | "incoming";
  signalingJson: SignalingJsonLog | null;
  caller: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  callee: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
}

export interface IncomingCallInvite {
  callId: string;
  callType: "audio" | "video";
  offer?: RTCSessionDescriptionInit;
  caller: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface AppNotification {
  id: string;
  userId: string;
  actorId: string | null;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  meta: Record<string, unknown> | null;
  createdAt: string | Date;
}

export interface UserReportSummary {
  id: string;
  reportedUserId: string;
  reportedDisplayName: string;
  reportedUsername: string;
  reason: string;
  details: string | null;
  status: string;
  adminAlertTriggered: boolean;
  createdAt: string | Date;
}

export interface AuditLogSummary {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  ipHint: string | null;
  createdAt: string | Date;
}
