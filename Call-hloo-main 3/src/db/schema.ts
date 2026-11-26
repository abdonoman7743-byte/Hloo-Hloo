import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const friendStatusEnum = pgEnum("friend_status", [
  "pending",
  "accepted",
  "blocked",
]);

export const messageTypeEnum = pgEnum("message_type", [
  "text",
  "image",
  "audio",
  "video",
]);

export const callStatusEnum = pgEnum("call_status", [
  "ringing",
  "answered",
  "ended",
  "missed",
]);

export const callTypeEnum = pgEnum("call_type", ["audio", "video"]);

export type PrivacyScope = "everyone" | "friends" | "nobody";
export type AvailabilityMode = "public" | "friends" | "private";
export type PresenceStatusValue =
  | "online"
  | "offline"
  | "in_call"
  | "unavailable"
  | "busy";

export interface PrivacySettings {
  searchVisibility: PrivacyScope;
  nameVisibility: PrivacyScope;
  avatarVisibility: PrivacyScope;
  presenceVisibility?: PrivacyScope;
  messagePermission: PrivacyScope;
  callPermission?: PrivacyScope;
  phoneVisibility: PrivacyScope;
  emailVisibility: PrivacyScope;
  allowedContactMethods: {
    internalMessage: boolean;
    email: boolean;
    phone: boolean;
  };
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  searchVisibility: "everyone",
  nameVisibility: "everyone",
  avatarVisibility: "everyone",
  presenceVisibility: "everyone",
  messagePermission: "everyone",
  callPermission: "everyone",
  phoneVisibility: "friends",
  emailVisibility: "friends",
  allowedContactMethods: {
    internalMessage: true,
    email: false,
    phone: false,
  },
};

export interface SignalingJsonLog {
  offer?: { type: string; sdp?: string; at: string };
  answer?: { type: string; sdp?: string; at: string };
  iceCandidates?: Array<{
    from: string;
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    at: string;
  }>;
  transportMode?:
    | "P2P Direct (STUN)"
    | "TURN Relay (TLS 5349)"
    | "Loopback P2P";
  iceConnectionState?: string;
  events?: Array<{ step: string; detail: string; at: string }>;
}

export interface MediaMeta {
  fileName?: string;
  mimeType?: string;
  durationSec?: number;
  sizeBytes?: number;
  caption?: string;
}

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull().unique(),
    firstName: text("first_name"),
    displayName: text("display_name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    city: text("city").default("الرياض"),
    groupTag: text("group_tag").default("مجتمع عبود التقني"),
    passwordHash: text("password_hash").notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio").default("متاح للمكالمات المرئية والصوتية عبر WebRTC P2P"),
    availabilityMode: text("availability_mode")
      .$type<AvailabilityMode>()
      .default("public")
      .notNull(),
    privacySettings: jsonb("privacy_settings")
      .$type<PrivacySettings>()
      .default(DEFAULT_PRIVACY_SETTINGS)
      .notNull(),
    deviceToken: text("device_token"),
    presenceStatus: text("presence_status").default("online").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_users_display_name").on(table.displayName),
    index("idx_users_first_name").on(table.firstName),
    index("idx_users_presence_last_seen").on(
      table.presenceStatus,
      table.lastSeenAt
    ),
    index("idx_users_phone").on(table.phone),
    index("idx_users_group_tag").on(table.groupTag),
    index("idx_users_city").on(table.city),
  ]
);

export const friends = pgTable(
  "friends",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: friendStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("uq_friends_user_friend").on(table.userId, table.friendId),
    index("idx_friends_user").on(table.userId),
    index("idx_friends_friend").on(table.friendId),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiverId: uuid("receiver_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    groupId: uuid("group_id"),
    type: messageTypeEnum("type").notNull(),
    content: text("content"),
    mediaMeta: jsonb("media_meta").$type<MediaMeta>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_messages_sender").on(table.senderId, table.createdAt),
    index("idx_messages_receiver").on(table.receiverId, table.createdAt),
  ]
);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    callerId: uuid("caller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calleeId: uuid("callee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: callStatusEnum("status").default("ringing").notNull(),
    type: callTypeEnum("type").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    signalingJson: jsonb("signaling_json").$type<SignalingJsonLog>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_calls_caller").on(table.callerId, table.status),
    index("idx_calls_callee").on(table.calleeId, table.status),
  ]
);

export const signalingEvents = pgTable(
  "signaling_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    callId: uuid("call_id").references(() => calls.id, {
      onDelete: "cascade",
    }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    delivered: boolean("delivered").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_signaling_to_user").on(
      table.toUserId,
      table.delivered,
      table.createdAt
    ),
  ]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_notifications_user_read").on(
      table.userId,
      table.isRead,
      table.createdAt
    ),
  ]
);

export const userReports = pgTable(
  "user_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportedUserId: uuid("reported_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    details: text("details"),
    status: text("status").default("open").notNull(),
    adminAlertTriggered: boolean("admin_alert_triggered")
      .default(false)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_reports_reported_user").on(
      table.reportedUserId,
      table.createdAt
    ),
    index("idx_reports_reporter").on(table.reporterId, table.createdAt),
  ]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipHint: text("ip_hint"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_audit_actor_created").on(table.actorId, table.createdAt),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Friend = typeof friends.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type CallRecord = typeof calls.$inferSelect;
export type SignalingEvent = typeof signalingEvents.$inferSelect;
export type NotificationItem = typeof notifications.$inferSelect;
export type UserReportItem = typeof userReports.$inferSelect;
export type AuditLogItem = typeof auditLogs.$inferSelect;
