-- SmackJack PostgreSQL schema
-- Run with: npm run db:init

CREATE TABLE IF NOT EXISTS accounts (
    username TEXT PRIMARY KEY,
    display_name TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    profile_picture TEXT NOT NULL DEFAULT '',
    selected_profile_picture_id TEXT NOT NULL DEFAULT 'rookie_1',
    unlocked_profile_pictures JSONB NOT NULL DEFAULT '[]'::jsonb,
    account_level INTEGER NOT NULL DEFAULT 1,
    account_xp INTEGER NOT NULL DEFAULT 0,
    account_xp_to_next INTEGER NOT NULL DEFAULT 50,
    account_total_xp INTEGER NOT NULL DEFAULT 0,
    remember_tokens JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
    display_name TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 1000,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    pushes INTEGER NOT NULL DEFAULT 0,
    games_played INTEGER NOT NULL DEFAULT 0,
    total_earnings INTEGER NOT NULL DEFAULT 0,
    runs_completed INTEGER NOT NULL DEFAULT 0,
    highest_chapter INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solo_runs (
    display_name TEXT PRIMARY KEY,
    updated_at BIGINT NOT NULL,
    game_state JSONB NOT NULL,
    player_run_state JSONB NOT NULL,
    updated_ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session_tokens (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_options (
    username TEXT PRIMARY KEY,
    theme TEXT NOT NULL DEFAULT 'light',
    remember_login BOOLEAN NOT NULL DEFAULT FALSE,
    ui_scale INTEGER NOT NULL DEFAULT 100,
    sfx_volume INTEGER NOT NULL DEFAULT 100,
    music_volume INTEGER NOT NULL DEFAULT 100,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_runs (
    id BIGSERIAL PRIMARY KEY,
    room_code TEXT,
    host_username TEXT,
    host_display_name TEXT,
    run_result TEXT,
    chapter INTEGER,
    total_rounds_played INTEGER,
    rounds_lost INTEGER,
    run_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_display_name ON accounts (display_name);
CREATE INDEX IF NOT EXISTS idx_profiles_runs_completed ON profiles (runs_completed DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_highest_chapter ON profiles (highest_chapter DESC);
CREATE INDEX IF NOT EXISTS idx_game_runs_created_at ON game_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_tokens_username ON session_tokens (username);
