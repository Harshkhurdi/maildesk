import { sql } from "drizzle-orm";
import { pgTable, text, integer, bigint, serial, index, uniqueIndex } from "drizzle-orm/pg-core";
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), email: text("email").notNull(),
  token: text("token").notNull(), historyId: text("history_id"), phase: text("phase").notNull().default("full"),
  pageToken: text("page_token"), queue: text("queue").notNull().default("[]"), nextHistoryId: text("next_history_id"),
  scanned: integer("scanned").notNull().default(0), total: integer("total").notNull().default(0),
  syncedAt: text("synced_at"), error: text("error"), leaseUntil: bigint("lease_until", {mode:"number"}).notNull().default(0),
  leaseId: text("lease_id"), createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("account_owner_email").on(t.ownerId, t.email)]);
export const mail = pgTable("mail", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), accountId: text("account_id").notNull(),
  gmailId: text("gmail_id").notNull(), threadId: text("thread_id").notNull(), subject: text("subject").notNull(),
  sender: text("sender").notNull(), recipients: text("recipients").notNull(), body: text("body").notNull(),
  snippet: text("snippet").notNull(), labels: text("labels").notNull(), receivedAt: text("received_at").notNull(),
  attachments: text("attachments").notNull().default("[]"),
}, t => [index("mail_owner_date").on(t.ownerId, t.receivedAt), index("mail_account_thread").on(t.accountId, t.threadId)]);
export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), title: text("title").notNull(),
  status: text("status").notNull().default("review"), priority: text("priority").notNull().default("normal"),
  due: text("due"), category: text("category").notNull().default("general"), notes: text("notes").notNull().default(""),
  accountId: text("account_id"), threadId: text("thread_id"), sourceId: text("source_id"),
  evidence: text("evidence").notNull().default(""), taskUrl: text("task_url"), reason: text("reason").notNull().default(""),
  snoozedUntil: text("snoozed_until"), sourceChanged: integer("source_changed").notNull().default(0),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("tasks_owner").on(t.ownerId), uniqueIndex("task_source").on(t.ownerId, t.accountId, t.threadId)]);
export const files = pgTable("files", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), kind: text("kind").notNull(),
  title: text("title").notNull(), content: text("content").notNull(), taskId: text("task_id"), mailId: text("mail_id"),
  revision: integer("revision").notNull().default(1), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("files_owner").on(t.ownerId)]);
export const oauthStates = pgTable("oauth_states", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), verifier: text("verifier").notNull(),
  expiresAt: bigint("expires_at", {mode:"number"}).notNull(),
});

export const conversations = pgTable("conversations", {
  id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),ownerName:text("owner_name").notNull(),ownerEmail:text("owner_email").notNull(),
  title:text("title").notNull(),participantEmail:text("participant_email").notNull(),participantName:text("participant_name").notNull(),
  ownerReadId:integer("owner_read_id").notNull().default(0),participantReadId:integer("participant_read_id").notNull().default(0),
  archivedAt:text("archived_at"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[index("conversations_owner").on(t.ownerId),index("conversations_invitee").on(t.participantEmail)]);
export const conversationMessages = pgTable("conversation_messages", {
  id:serial("id").primaryKey(),roomId:text("room_id").notNull(),senderId:text("sender_id").notNull(),senderName:text("sender_name").notNull(),
  nonce:text("nonce").notNull(),body:text("body").notNull(),resource:text("resource"),createdAt:text("created_at").notNull(),
},t=>[index("messages_room_sequence").on(t.roomId,t.id),uniqueIndex("message_nonce").on(t.roomId,t.senderId,t.nonce)]);
export const conversationCalls = pgTable("conversation_calls", {
  id:text("id").primaryKey(),roomId:text("room_id").notNull(),callerId:text("caller_id").notNull(),callerClientId:text("caller_client_id").notNull(),callerName:text("caller_name").notNull(),
  calleeId:text("callee_id"),calleeClientId:text("callee_client_id"),kind:text("kind").notNull(),status:text("status").notNull(),
  callerSeenAt:bigint("caller_seen_at", {mode:"number"}).notNull(),calleeSeenAt:bigint("callee_seen_at", {mode:"number"}).notNull().default(0),
  createdAt:text("created_at").notNull(),acceptedAt:text("accepted_at"),endedAt:text("ended_at"),endReason:text("end_reason"),
},t=>[index("calls_room").on(t.roomId,t.createdAt),uniqueIndex("one_live_call_per_room").on(t.roomId).where(sql`${t.status} IN ('ringing','active')`)]);
export const conversationSignals = pgTable("conversation_signals", {
  id:serial("id").primaryKey(),roomId:text("room_id").notNull(),callId:text("call_id").notNull(),
  fromClientId:text("from_client_id").notNull(),toClientId:text("to_client_id").notNull(),nonce:text("nonce").notNull(),payload:text("payload").notNull(),createdAt:bigint("created_at", {mode:"number"}).notNull(),
},t=>[index("signals_call_target").on(t.callId,t.toClientId,t.id),uniqueIndex("signal_nonce").on(t.callId,t.fromClientId,t.nonce)]);

export const utilities=pgTable("utilities",{id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),kind:text("kind").notNull(),title:text("title").notNull(),content:text("content").notNull(),revision:integer("revision").notNull().default(1),updatedAt:text("updated_at").notNull()},t=>[index("utilities_owner_kind").on(t.ownerId,t.kind)]);
export const xConnections=pgTable("x_connections",{ownerId:text("owner_id").primaryKey(),xId:text("x_id").notNull(),username:text("username").notNull(),name:text("name").notNull(),token:text("token").notNull(),feed:text("feed").notNull().default("{}"),fetchedAt:bigint("fetched_at",{mode:"number"}).notNull().default(0),updatedAt:text("updated_at").notNull()});
