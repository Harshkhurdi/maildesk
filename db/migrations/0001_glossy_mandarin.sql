CREATE TABLE "office_files" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"extension" text NOT NULL,
	"data" text NOT NULL,
	"hash" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"source_file_id" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "office_versions" (
	"file_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"revision" integer NOT NULL,
	"data" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "office_files_owner" ON "office_files" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "office_source_copy" ON "office_files" USING btree ("owner_id","source_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "office_version" ON "office_versions" USING btree ("file_id","revision");--> statement-breakpoint
CREATE INDEX "office_versions_owner" ON "office_versions" USING btree ("owner_id","file_id");