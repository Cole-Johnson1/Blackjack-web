# SmackJack

Realtime multiplayer roguelike Blackjack built with Express + Socket.IO.

## Features

- Room-based multiplayer (1-4 players) with shareable invite links
- Co-op SmackJack run loop versus dealer with difficulty scaling by player count
- RPG stats: Health, Attack Damage, and Mana
- Ability system (Arcane Draw, Mend Wounds, Ember Strike, Mana Surge)
- XP leveling with stat upgrades (Health, Attack, Mana)
- Chapter progression: every 5 successful rounds grants a blessing
- Run fail condition: 3 lost rounds ends the run
- Account-based login with persistent profiles and leaderboard
- Main menu after login with Single Player, Multi Player, Account, Options, Logout, and Exit
- Remember Login support with secure server-issued remember tokens
- Optional Electron desktop shell support

## Project Structure

- server.js: server, room management, SmackJack game engine, sockets, REST API
- data/leaderboard.json: persisted player profiles and stats
- public/: client pages, scripts, and CSS
- electron/main.js: Electron desktop entrypoint

## Run Locally (Desktop App)

1. Install dependencies:

   npm install

2. Launch SmackJack desktop app:

   npm start

The Electron app boots the game server automatically.

## Run As Web Server (Optional)

If you still want browser mode for testing:

1. Start the web server:

   npm run start:web

2. Open:

   http://localhost:3000

## Run In Electron

1. Install dependencies:

   npm install

2. Start the web server in one terminal:

   npm start

3. Start desktop shell in another terminal:

   npm run electron

## Deploy To Internet (Render)

1. Push this project to a GitHub repository.
2. Create a new Web Service on Render and connect that repo.
3. Use these settings:
   - Build Command: npm install
   - Start Command: npm start
   - Environment: Node
4. Deploy.
5. Share your Render URL with friends.

The server already reads process.env.PORT, so it is deploy-ready.

## Database Tables (PostgreSQL)

SmackJack now includes a PostgreSQL schema for persistent account/game storage.

### Tables

- `accounts`: account credentials, admin flags, progression, and avatar state
- `profiles`: leaderboard/profile stats
- `solo_runs`: saved solo run state blobs
- `game_runs`: run history records
- `session_tokens`: session/remember-token records for migration and auditing
- `user_options`: persistent user preferences (theme, UI/audio defaults)

### Setup Commands

1. Set `DATABASE_URL` to your Postgres connection string.
2. Initialize tables:

   npm run db:init

3. Migrate existing JSON data into DB:

   npm run db:sync

When `DATABASE_URL` is set, runtime persistence is DB-only. The server hydrates from PostgreSQL on startup and all account/profile/session/options/solo-run writes go to DB instead of local JSON files.

### Render Notes

1. Add a Render Postgres database.
2. Add `DATABASE_URL` to your Web Service environment variables.
3. Run `npm run db:init` once against production.
4. Run `npm run db:sync` once to import current data files.
5. Confirm runtime mode after deploy: open `/api/status` and verify `persistenceMode` is `database`.

If `/api/status` reports `local-json`, your service is not using Postgres and account data will not survive redeploys.

These scripts are idempotent: you can rerun them safely.

## Options Persistence

- Theme preference is now persisted server-side through:
   - `POST /api/options`
   - `POST /api/options/update`
- The options page syncs the theme from the server after login and writes updates back.

## APIs

- GET /api/status: basic server/game status
- GET /api/leaderboard: leaderboard data
- GET /api/profile/:name: player profile by name

## Admin Accounts

- Built-in hardcoded admin account:
   - Username: `Admin`
   - Display Name: `Admin`
   - PIN: `0000`
- The `Admin` username and display name are reserved and cannot be registered by other players.
- Set `ADMIN_USERNAMES` (comma-separated usernames) in your environment to grant admin privileges.
- Example for Render: `ADMIN_USERNAMES=admin,cjgodd`
- Admin-only management endpoints:
   - POST /api/admin/accounts
   - POST /api/admin/account/set-role
   - POST /api/admin/account/set-disabled
   - POST /api/admin/account/delete

## SmackJack Flow

1. Launch app and sign in on the login screen (or create an account from the hidden register form).
2. Enter the main menu and choose Single Player (auto-start) or Multi Player (lobby).
3. Use Account to view leaderboard/profile progression.
4. Host starts run, then starts rounds in multiplayer.
5. Players use blackjack decisions and mana abilities during their turns.
6. Team survives as long as possible, leveling up and picking blessings every 5 wins.
