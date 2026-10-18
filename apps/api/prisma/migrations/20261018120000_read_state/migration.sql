-- CreateTable
CREATE TABLE "channel_read_states" (
    "channel_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ(3) NOT NULL,
    "last_read_message_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "channel_read_states_pkey" PRIMARY KEY ("channel_id","user_id")
);

-- CreateTable
CREATE TABLE "conversation_read_states" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ(3) NOT NULL,
    "last_read_message_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversation_read_states_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateIndex
CREATE INDEX "channel_read_states_workspace_id_user_id_idx" ON "channel_read_states"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "channel_read_states_last_read_message_id_idx" ON "channel_read_states"("last_read_message_id");

-- CreateIndex
CREATE INDEX "conversation_read_states_last_read_message_id_idx" ON "conversation_read_states"("last_read_message_id");

-- AddForeignKey
ALTER TABLE "channel_read_states" ADD CONSTRAINT "channel_read_states_channel_id_workspace_id_fkey" FOREIGN KEY ("channel_id", "workspace_id") REFERENCES "channels"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_read_states" ADD CONSTRAINT "channel_read_states_workspace_id_user_id_fkey" FOREIGN KEY ("workspace_id", "user_id") REFERENCES "workspace_members"("workspace_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_read_states" ADD CONSTRAINT "channel_read_states_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_conversation_id_user_id_fkey" FOREIGN KEY ("conversation_id", "user_id") REFERENCES "conversation_participants"("conversation_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- =============================================================================
-- Hand-written invariants (not expressible in the Prisma schema).
-- Documented in docs/DATA_MODEL.md.
-- =============================================================================

-- A read cursor may only point at a message in its own channel / conversation.
-- (A composite FK cannot be used here: ON DELETE SET NULL would also null the destination
-- column, which is part of the primary key. The single-column FK handles deletion; this
-- trigger handles destination consistency. Message rows never change destination.)
CREATE FUNCTION "check_read_state_last_read_message"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  message_channel_id uuid;
  message_conversation_id uuid;
BEGIN
  IF NEW."last_read_message_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "channel_id", "conversation_id"
    INTO message_channel_id, message_conversation_id
    FROM "messages"
    WHERE "id" = NEW."last_read_message_id";

  -- A missing message is reported by the foreign key.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'channel_read_states' THEN
    IF message_channel_id IS DISTINCT FROM NEW."channel_id" THEN
      RAISE EXCEPTION 'read cursor for channel % must reference a message in that channel',
        NEW."channel_id"
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF message_conversation_id IS DISTINCT FROM NEW."conversation_id" THEN
      RAISE EXCEPTION 'read cursor for conversation % must reference a message in that conversation',
        NEW."conversation_id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "channel_read_states_last_read_message"
  BEFORE INSERT OR UPDATE OF "last_read_message_id", "channel_id" ON "channel_read_states"
  FOR EACH ROW EXECUTE FUNCTION "check_read_state_last_read_message"();

CREATE TRIGGER "conversation_read_states_last_read_message"
  BEFORE INSERT OR UPDATE OF "last_read_message_id", "conversation_id" ON "conversation_read_states"
  FOR EACH ROW EXECUTE FUNCTION "check_read_state_last_read_message"();
