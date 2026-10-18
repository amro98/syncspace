-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MESSAGE', 'MENTION', 'TASK_ASSIGNED', 'TASK_UPDATED', 'INVITE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('WORKSPACE', 'CHANNEL', 'CONVERSATION', 'MESSAGE', 'BOARD', 'TASK', 'INVITE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "password_hash" TEXT,
    "last_seen_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_invites" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" "ChannelType" NOT NULL DEFAULT 'PUBLIC',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_members" (
    "channel_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_members_pkey" PRIMARY KEY ("channel_id","user_id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL,
    "name" TEXT,
    "direct_key" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "channel_id" UUID,
    "conversation_id" UUID,
    "parent_message_id" UUID,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "edited_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reactions" (
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("message_id","user_id","emoji")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "message_id" UUID,
    "task_id" UUID,
    "uploaded_by_id" UUID,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "storage_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_columns" (
    "id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "board_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "column_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "position" DOUBLE PRECISION NOT NULL,
    "due_date" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id","user_id")
);

-- CreateTable
CREATE TABLE "task_labels" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_label_assignments" (
    "task_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,

    CONSTRAINT "task_label_assignments_pkey" PRIMARY KEY ("task_id","label_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID,
    "actor_id" UUID,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entity_type" "NotificationEntityType",
    "entity_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspaces_owner_id_idx" ON "workspaces"("owner_id");

-- CreateIndex
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invites_token_hash_key" ON "workspace_invites"("token_hash");

-- CreateIndex
CREATE INDEX "workspace_invites_workspace_id_created_at_idx" ON "workspace_invites"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "workspace_invites_email_idx" ON "workspace_invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "channels_workspace_id_slug_key" ON "channels"("workspace_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "channels_id_workspace_id_key" ON "channels"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "channel_members_workspace_id_user_id_idx" ON "channel_members"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_idx" ON "conversations"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_workspace_id_direct_key_key" ON "conversations"("workspace_id", "direct_key");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_id_workspace_id_key" ON "conversations"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "conversation_participants_workspace_id_user_id_idx" ON "conversation_participants"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_channel_id_created_at_id_idx" ON "messages"("channel_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_id_idx" ON "messages"("conversation_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "messages_parent_message_id_created_at_idx" ON "messages"("parent_message_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_author_id_idx" ON "messages"("author_id");

-- CreateIndex
CREATE INDEX "message_reactions_user_id_idx" ON "message_reactions"("user_id");

-- CreateIndex
CREATE INDEX "attachments_message_id_idx" ON "attachments"("message_id");

-- CreateIndex
CREATE INDEX "attachments_task_id_idx" ON "attachments"("task_id");

-- CreateIndex
CREATE INDEX "attachments_workspace_id_idx" ON "attachments"("workspace_id");

-- CreateIndex
CREATE INDEX "boards_workspace_id_idx" ON "boards"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "boards_id_workspace_id_key" ON "boards"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "board_columns_board_id_position_idx" ON "board_columns"("board_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "board_columns_id_board_id_key" ON "board_columns"("id", "board_id");

-- CreateIndex
CREATE INDEX "tasks_board_id_column_id_position_idx" ON "tasks"("board_id", "column_id", "position");

-- CreateIndex
CREATE INDEX "tasks_column_id_idx" ON "tasks"("column_id");

-- CreateIndex
CREATE INDEX "tasks_workspace_id_due_date_idx" ON "tasks"("workspace_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_workspace_id_key" ON "tasks"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "task_assignees_workspace_id_user_id_idx" ON "task_assignees"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_labels_workspace_id_name_key" ON "task_labels"("workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "task_labels_id_workspace_id_key" ON "task_labels"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "task_label_assignments_label_id_workspace_id_idx" ON "task_label_assignments"("label_id", "workspace_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_workspace_id_idx" ON "notifications"("workspace_id");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_workspace_id_fkey" FOREIGN KEY ("channel_id", "workspace_id") REFERENCES "channels"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_workspace_id_user_id_fkey" FOREIGN KEY ("workspace_id", "user_id") REFERENCES "workspace_members"("workspace_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_workspace_id_fkey" FOREIGN KEY ("conversation_id", "workspace_id") REFERENCES "conversations"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_workspace_id_user_id_fkey" FOREIGN KEY ("workspace_id", "user_id") REFERENCES "workspace_members"("workspace_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_workspace_id_fkey" FOREIGN KEY ("channel_id", "workspace_id") REFERENCES "channels"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_workspace_id_fkey" FOREIGN KEY ("conversation_id", "workspace_id") REFERENCES "conversations"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_workspace_id_fkey" FOREIGN KEY ("board_id", "workspace_id") REFERENCES "boards"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_id_board_id_fkey" FOREIGN KEY ("column_id", "board_id") REFERENCES "board_columns"("id", "board_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_workspace_id_fkey" FOREIGN KEY ("task_id", "workspace_id") REFERENCES "tasks"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_workspace_id_user_id_fkey" FOREIGN KEY ("workspace_id", "user_id") REFERENCES "workspace_members"("workspace_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_label_assignments" ADD CONSTRAINT "task_label_assignments_task_id_workspace_id_fkey" FOREIGN KEY ("task_id", "workspace_id") REFERENCES "tasks"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_label_assignments" ADD CONSTRAINT "task_label_assignments_label_id_workspace_id_fkey" FOREIGN KEY ("label_id", "workspace_id") REFERENCES "task_labels"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- =============================================================================
-- Hand-written invariants (not expressible in the Prisma schema).
-- Every item is documented in docs/DATA_MODEL.md.
-- =============================================================================

-- Normalised emails (trimmed + lower-cased by the application).
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_check"
  CHECK ("email" <> '' AND "email" = lower(btrim("email")));

-- URL-safe slugs: lower-case alphanumerics separated by single hyphens.
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_slug_format_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "channels" ADD CONSTRAINT "channels_slug_format_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Invitations: never for OWNER, normalised email, accepted XOR revoked (or neither = pending).
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_role_check"
  CHECK ("role" <> 'OWNER');
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_email_normalized_check"
  CHECK ("email" <> '' AND "email" = lower(btrim("email")));
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_single_outcome_check"
  CHECK ("accepted_at" IS NULL OR "revoked_at" IS NULL);
-- At most one pending invite per (workspace, email). Re-inviting refreshes the pending row.
CREATE UNIQUE INDEX "workspace_invites_pending_email_key"
  ON "workspace_invites" ("workspace_id", "email")
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

-- Conversations: DIRECT rows carry the dedupe key, GROUP rows never do; only GROUPs are named.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_direct_key_check"
  CHECK (("type" = 'DIRECT') = ("direct_key" IS NOT NULL));
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_name_check"
  CHECK ("type" = 'GROUP' OR "name" IS NULL);

-- Messages belong to exactly one destination and never reply to themselves.
ALTER TABLE "messages" ADD CONSTRAINT "messages_destination_xor_check"
  CHECK (num_nonnulls("channel_id", "conversation_id") = 1);
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_not_self_check"
  CHECK ("parent_message_id" IS NULL OR "parent_message_id" <> "id");

ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_emoji_length_check"
  CHECK (char_length("emoji") BETWEEN 1 AND 64);

-- Attachments belong to exactly one owner (message XOR task).
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_xor_check"
  CHECK (num_nonnulls("message_id", "task_id") = 1);
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_size_check"
  CHECK ("size" >= 0);

-- Ordering keys must be finite (in PostgreSQL NaN sorts above Infinity, so this excludes it too).
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_position_finite_check"
  CHECK ("position" > '-Infinity'::float8 AND "position" < 'Infinity'::float8);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_position_finite_check"
  CHECK ("position" > '-Infinity'::float8 AND "position" < 'Infinity'::float8);

ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_color_check"
  CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');

-- Notification entity pointer is all-or-nothing.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_entity_pointer_check"
  CHECK (("entity_type" IS NULL) = ("entity_id" IS NULL));

-- -----------------------------------------------------------------------------
-- Workspace ownership: every workspace has exactly one OWNER member, and it is
-- workspaces.owner_id.
--   * The partial unique index allows at most one OWNER row per workspace (checked immediately).
--   * The deferred constraint triggers verify at COMMIT that the OWNER row exists and matches
--     owner_id. Creating a workspace with its owner membership, or transferring ownership
--     (demote old owner -> promote new owner -> update owner_id), must happen in one transaction.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX "workspace_members_single_owner_key"
  ON "workspace_members" ("workspace_id")
  WHERE "role" = 'OWNER';

CREATE FUNCTION "check_workspace_owner_invariant"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_workspace_id uuid;
  expected_owner_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'workspaces' THEN
    target_workspace_id := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    target_workspace_id := OLD."workspace_id";
  ELSE
    target_workspace_id := NEW."workspace_id";
  END IF;

  SELECT "owner_id" INTO expected_owner_id FROM "workspaces" WHERE "id" = target_workspace_id;
  IF NOT FOUND THEN
    -- The workspace itself was deleted in this transaction (cascade): nothing to check.
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "workspace_members"
    WHERE "workspace_id" = target_workspace_id
      AND "user_id" = expected_owner_id
      AND "role" = 'OWNER'
  ) THEN
    RAISE EXCEPTION 'workspace % must have its owner % as an OWNER member',
      target_workspace_id, expected_owner_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "workspaces_owner_invariant"
  AFTER INSERT OR UPDATE OF "owner_id" ON "workspaces"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_workspace_owner_invariant"();

CREATE CONSTRAINT TRIGGER "workspace_members_owner_invariant"
  AFTER UPDATE OF "role", "user_id", "workspace_id" OR DELETE ON "workspace_members"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "check_workspace_owner_invariant"();

-- -----------------------------------------------------------------------------
-- Threads: a reply lives in the same destination as its parent, and threads are one level
-- deep (a reply cannot itself be replied to).
-- -----------------------------------------------------------------------------
CREATE FUNCTION "check_message_thread_parent"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent RECORD;
BEGIN
  IF NEW."parent_message_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "channel_id", "conversation_id", "parent_message_id"
    INTO parent
    FROM "messages"
    WHERE "id" = NEW."parent_message_id";

  -- A missing parent is reported by the foreign key.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF parent."parent_message_id" IS NOT NULL THEN
    RAISE EXCEPTION 'message % cannot reply to a reply (threads are one level deep)', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF parent."channel_id" IS DISTINCT FROM NEW."channel_id"
     OR parent."conversation_id" IS DISTINCT FROM NEW."conversation_id" THEN
    RAISE EXCEPTION 'reply % must be in the same channel or conversation as its parent', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "messages_thread_parent"
  BEFORE INSERT OR UPDATE OF "parent_message_id", "channel_id", "conversation_id" ON "messages"
  FOR EACH ROW EXECUTE FUNCTION "check_message_thread_parent"();
