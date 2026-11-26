import { db } from "@/db";
import { sql } from "drizzle-orm";

let infraPromise: Promise<void> | null = null;

async function ensureDatabaseInfrastructure() {
  // 1. Ensure PostgreSQL Enums exist safely
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE friend_status AS ENUM ('pending', 'accepted', 'blocked');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE message_type AS ENUM ('text', 'image', 'audio', 'video');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE call_status AS ENUM ('ringing', 'answered', 'ended', 'missed');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE call_type AS ENUM ('audio', 'video');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // 2. Ensure first_name column exists & backfill missing values from display_name without modifying existing data
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
  `);

  await db.execute(sql`
    UPDATE users
    SET first_name = split_part(trim(display_name), ' ', 1)
    WHERE first_name IS NULL OR trim(first_name) = '';
  `);

  // 3. Enable pg_trgm and create fast global search indexes
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
      ON users (LOWER(username));
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_users_username_trgm
      ON users USING gin (username gin_trgm_ops);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_users_display_name_trgm
      ON users USING gin (display_name gin_trgm_ops);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_users_first_name_trgm
      ON users USING gin (first_name gin_trgm_ops);
  `);

  // 4. Create security-barrier public profile view (strictly excludes password_hash, email, phone, device_token)
  await db.execute(sql`
    CREATE OR REPLACE VIEW public_user_profiles WITH (security_barrier = true) AS
    SELECT
      id,
      username,
      first_name,
      display_name,
      avatar_url,
      bio,
      city,
      group_tag,
      presence_status,
      last_seen_at,
      availability_mode,
      privacy_settings,
      created_at
    FROM users
    WHERE availability_mode <> 'private';
  `);

  // 5. Enable RLS on sensitive tables and repair the users-table policy predicates.
  // The application currently uses a trusted server-side DATABASE_URL connection;
  // do not expose this credential or connect to PostgreSQL directly from the browser.
  await db.execute(sql`ALTER TABLE users ENABLE ROW LEVEL SECURITY;`);
  await db.execute(sql`ALTER TABLE friends ENABLE ROW LEVEL SECURITY;`);
  await db.execute(sql`ALTER TABLE messages ENABLE ROW LEVEL SECURITY;`);
  await db.execute(sql`ALTER TABLE calls ENABLE ROW LEVEL SECURITY;`);
  await db.execute(sql`ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;`);
  await db.execute(sql`ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;`);

  await db.execute(sql`DROP POLICY IF EXISTS users_select_public_or_self ON users;`);
  await db.execute(sql`
    CREATE POLICY users_select_public_or_self ON users
      FOR SELECT
      USING (
        availability_mode <> 'private'
        OR id::text = NULLIF(current_setting('app.current_user_id', true), '')
      );
  `);

  await db.execute(sql`DROP POLICY IF EXISTS users_insert_self ON users;`);
  await db.execute(sql`
    CREATE POLICY users_insert_self ON users
      FOR INSERT
      WITH CHECK (id::text = NULLIF(current_setting('app.current_user_id', true), ''));
  `);

  await db.execute(sql`DROP POLICY IF EXISTS users_update_own ON users;`);
  await db.execute(sql`
    CREATE POLICY users_update_own ON users
      FOR UPDATE
      USING (id::text = NULLIF(current_setting('app.current_user_id', true), ''))
      WITH CHECK (id::text = NULLIF(current_setting('app.current_user_id', true), ''));
  `);
}

export async function ensureSeeded(): Promise<void> {
  if (!infraPromise) {
    infraPromise = ensureDatabaseInfrastructure().catch((err) => {
      infraPromise = null;
      throw err;
    });
  }
  return infraPromise;
}
