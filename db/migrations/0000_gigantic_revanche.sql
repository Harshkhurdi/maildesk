CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"history_id" text,
	"phase" text DEFAULT 'full' NOT NULL,
	"page_token" text,
	"queue" text DEFAULT '[]' NOT NULL,
	"next_history_id" text,
	"scanned" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"synced_at" text,
	"error" text,
	"lease_until" bigint DEFAULT 0 NOT NULL,
	"lease_id" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"caller_id" text NOT NULL,
	"caller_client_id" text NOT NULL,
	"caller_name" text NOT NULL,
	"callee_id" text,
	"callee_client_id" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"caller_seen_at" bigint NOT NULL,
	"callee_seen_at" bigint DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"accepted_at" text,
	"ended_at" text,
	"end_reason" text
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"sender_name" text NOT NULL,
	"nonce" text NOT NULL,
	"body" text NOT NULL,
	"resource" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"call_id" text NOT NULL,
	"from_client_id" text NOT NULL,
	"to_client_id" text NOT NULL,
	"nonce" text NOT NULL,
	"payload" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"owner_name" text NOT NULL,
	"owner_email" text NOT NULL,
	"title" text NOT NULL,
	"participant_email" text NOT NULL,
	"participant_name" text NOT NULL,
	"owner_read_id" integer DEFAULT 0 NOT NULL,
	"participant_read_id" integer DEFAULT 0 NOT NULL,
	"archived_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"task_id" text,
	"mail_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"account_id" text NOT NULL,
	"gmail_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"subject" text NOT NULL,
	"sender" text NOT NULL,
	"recipients" text NOT NULL,
	"body" text NOT NULL,
	"snippet" text NOT NULL,
	"labels" text NOT NULL,
	"received_at" text NOT NULL,
	"attachments" text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"verifier" text NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'review' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due" text,
	"category" text DEFAULT 'general' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"account_id" text,
	"thread_id" text,
	"source_id" text,
	"evidence" text DEFAULT '' NOT NULL,
	"task_url" text,
	"reason" text DEFAULT '' NOT NULL,
	"snoozed_until" text,
	"source_changed" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utilities" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "x_connections" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"x_id" text NOT NULL,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"token" text NOT NULL,
	"feed" text DEFAULT '{}' NOT NULL,
	"fetched_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_owner_email" ON "accounts" USING btree ("owner_id","email");--> statement-breakpoint
CREATE INDEX "calls_room" ON "conversation_calls" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_live_call_per_room" ON "conversation_calls" USING btree ("room_id") WHERE "conversation_calls"."status" IN ('ringing','active');--> statement-breakpoint
CREATE INDEX "messages_room_sequence" ON "conversation_messages" USING btree ("room_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_nonce" ON "conversation_messages" USING btree ("room_id","sender_id","nonce");--> statement-breakpoint
CREATE INDEX "signals_call_target" ON "conversation_signals" USING btree ("call_id","to_client_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "signal_nonce" ON "conversation_signals" USING btree ("call_id","from_client_id","nonce");--> statement-breakpoint
CREATE INDEX "conversations_owner" ON "conversations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "conversations_invitee" ON "conversations" USING btree ("participant_email");--> statement-breakpoint
CREATE INDEX "files_owner" ON "files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "mail_owner_date" ON "mail" USING btree ("owner_id","received_at");--> statement-breakpoint
CREATE INDEX "mail_account_thread" ON "mail" USING btree ("account_id","thread_id");--> statement-breakpoint
CREATE INDEX "tasks_owner" ON "tasks" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_source" ON "tasks" USING btree ("owner_id","account_id","thread_id");--> statement-breakpoint
CREATE INDEX "utilities_owner_kind" ON "utilities" USING btree ("owner_id","kind");