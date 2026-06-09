const express = require("express");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "leaderboard.json");
const ACCOUNTS_FILE = path.join(__dirname, "data", "accounts.json");
const SOLO_RUNS_FILE = path.join(__dirname, "data", "solo-runs.json");

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const DB_ENABLED = !!DATABASE_URL;
const DB_SSL_ENABLED = String(process.env.PGSSLMODE || "require").toLowerCase() !== "disable";
const BUILT_IN_ADMIN_USERNAME = "admin";
const BUILT_IN_ADMIN_DISPLAY_NAME = "Admin";
const BUILT_IN_ADMIN_PIN = "0000";
const ADMIN_USERNAMES = new Set(
    String(process.env.ADMIN_USERNAMES || "admin")
        .split(",")
        .map(name => String(name || "").trim().toLowerCase())
        .filter(Boolean)
);
    ADMIN_USERNAMES.add(BUILT_IN_ADMIN_USERNAME);

const RUN_LOSS_LIMIT = 3;
const ROUNDS_PER_CHAPTER = 5;
const MAX_PLAYERS_PER_ROOM = 4;

const BASE_PLAYER = {
    health: 30,
    attackDamage: 5,
    maxMana: 6
};

const BLESSING_OPTION_COUNT = 3;
const SHOP_OPTION_COUNT = 3;

const ACCOUNT_LEVEL_UNLOCK_STEP = 5;

const PROFILE_PICTURES = [
    { id: "rookie_1", name: "Rookie Red", path: "assets/avatars/rookie-1.svg", unlockLevel: 1 },
    { id: "rookie_2", name: "Rookie Blue", path: "assets/avatars/rookie-2.svg", unlockLevel: 1 },
    { id: "rookie_3", name: "Rookie Green", path: "assets/avatars/rookie-3.svg", unlockLevel: 1 },
    { id: "rookie_4", name: "Rookie Gold", path: "assets/avatars/rookie-4.svg", unlockLevel: 1 },
    { id: "rookie_5", name: "Rookie Violet", path: "assets/avatars/rookie-5.svg", unlockLevel: 1 },
    { id: "veteran_1", name: "Veteran Ember", path: "assets/avatars/veteran-1.svg", unlockLevel: 5 },
    { id: "veteran_2", name: "Veteran Tidal", path: "assets/avatars/veteran-2.svg", unlockLevel: 10 },
    { id: "veteran_3", name: "Veteran Verdant", path: "assets/avatars/veteran-3.svg", unlockLevel: 15 },
    { id: "veteran_4", name: "Veteran Obsidian", path: "assets/avatars/veteran-4.svg", unlockLevel: 20 },
    { id: "veteran_5", name: "Veteran Nova", path: "assets/avatars/veteran-5.svg", unlockLevel: 25 }
];

const DEFAULT_PROFILE_PICTURE_ID = PROFILE_PICTURES[0].id;

const DEALER_ARCHETYPES = [
    { id: "crusher", name: "Crusher", healthMult: 1.2, attackMult: 0.95 },
    { id: "duelist", name: "Duelist", healthMult: 0.9, attackMult: 1.2 },
    { id: "bulwark", name: "Bulwark", healthMult: 1.35, attackMult: 0.85 },
    { id: "warlock", name: "Warlock", healthMult: 1.05, attackMult: 1.05 }
];

const SHOP_ITEMS = {
    ironBand: {
        id: "ironBand",
        type: "relic",
        name: "Iron Band",
        description: "+2 Attack permanently for this run.",
        repeatable: true
    },
    moonwellVial: {
        id: "moonwellVial",
        type: "relic",
        name: "Moonwell Vial",
        description: "+10 Max HP and heal 10.",
        repeatable: true
    },
    prismCore: {
        id: "prismCore",
        type: "relic",
        name: "Prism Core",
        description: "+2 Max Mana and +2 Mana now.",
        repeatable: true
    },
    aceForge: {
        id: "aceForge",
        type: "card",
        name: "Ace Forge",
        description: "Each round, your lowest opening card is transmuted into A of Diamonds.",
        repeatable: false
    },
    kingEtcher: {
        id: "kingEtcher",
        type: "card",
        name: "King Etcher",
        description: "Gain 2 card upgrade charges. Each charge upgrades a low card into K of Hearts.",
        repeatable: true
    }
};

const ABILITIES = {
    arcaneDraw: {
        id: "arcaneDraw",
        name: "Arcane Draw",
        type: "active",
        manaCost: 3,
        description: "Turn your lowest non-Ace card into an Ace (first action only)."
    },
    mendWounds: {
        id: "mendWounds",
        name: "Mend Wounds",
        type: "active",
        manaCost: 4,
        description: "Heal 10 HP."
    },
    emberStrike: {
        id: "emberStrike",
        name: "Ember Strike",
        type: "active",
        manaCost: 5,
        description: "Deal 2× your Attack to the dealer if you win this hand."
    },
    manaSurge: {
        id: "manaSurge",
        name: "Mana Surge",
        type: "active",
        manaCost: 0,
        description: "Gain 2 Mana instantly."
    },
    siphonStrike: {
        id: "siphonStrike",
        name: "Siphon Strike",
        type: "active",
        manaCost: 3,
        description: "Gain +6 Shield now. If you win, heal 6 and deal bonus damage."
    },
    focusSigil: {
        id: "focusSigil",
        name: "Focus Sigil",
        type: "active",
        manaCost: 2,
        description: "Empower this hand with extra combo damage if you win."
    },
    battleTrance: {
        id: "battleTrance",
        name: "Battle Trance",
        type: "passive",
        manaCost: 0,
        description: "Passive: using active abilities builds Trance stacks (+20% win damage each)."
    },
    overcharge: {
        id: "overcharge",
        name: "Overcharge",
        type: "passive",
        manaCost: 0,
        description: "Passive: +2 damage per mana spent this hand; Mana Surge adds extra burst."
    },
    executionerInstinct: {
        id: "executionerInstinct",
        name: "Executioner Instinct",
        type: "passive",
        manaCost: 0,
        description: "Passive: winning hands of 19+ deal heavy bonus damage."
    },
    splitTorrent: {
        id: "splitTorrent",
        name: "Split Torrent",
        type: "passive",
        manaCost: 0,
        description: "Passive: split-hand wins unleash extra combo strikes."
    }
};

const BLESSINGS = {};

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

let profiles = loadProfiles();
let accounts = loadAccounts();
let soloRuns = loadSoloRuns();

const sessions = new Map();
const loginAttempts = new Map();
const players = {};
const rooms = new Map();

let dbPool = null;
const persistenceState = {
    initialized: false,
    flushTimer: null,
    flushInProgress: false,
    dirtyAccounts: false,
    dirtyProfiles: false,
    dirtySoloRuns: false,
    dirtySessions: false,
    dirtyOptions: false
};

function loadProfiles() {
    try {
        if (DB_ENABLED) {
            return {};
        }

        if (!fs.existsSync(DATA_FILE)) {
            return {};
        }

        const raw = fs.readFileSync(DATA_FILE, "utf8").trim();
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch (error) {
        console.error("Failed to read leaderboard data:", error);
        return {};
    }
}

function saveProfiles() {
    try {
        if (DB_ENABLED) {
            markDirty("profiles");
            return;
        }

        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(profiles, null, 2), "utf8");
    }
    catch (error) {
        console.error("Failed to save leaderboard data:", error);
    }
}

function loadAccounts() {
    try {
        if (DB_ENABLED) {
            return {};
        }

        if (!fs.existsSync(ACCOUNTS_FILE)) {
            return {};
        }

        const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8").trim();
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch (error) {
        console.error("Failed to read accounts data:", error);
        return {};
    }
}

function saveAccounts() {
    try {
        if (DB_ENABLED) {
            markDirty("accounts");
            markDirty("options");
            return;
        }

        fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf8");
    }
    catch (error) {
        console.error("Failed to save accounts data:", error);
    }
}

function getDbPool() {
    if (!DB_ENABLED) {
        return null;
    }

    if (!dbPool) {
        dbPool = new Pool({
            connectionString: DATABASE_URL,
            ssl: DB_SSL_ENABLED ? { rejectUnauthorized: false } : false
        });
    }

    return dbPool;
}

function markDirty(kind) {
    if (!DB_ENABLED) {
        return;
    }

    if (kind === "accounts") persistenceState.dirtyAccounts = true;
    if (kind === "profiles") persistenceState.dirtyProfiles = true;
    if (kind === "soloRuns") persistenceState.dirtySoloRuns = true;
    if (kind === "sessions") persistenceState.dirtySessions = true;
    if (kind === "options") persistenceState.dirtyOptions = true;

    if (persistenceState.flushTimer || !persistenceState.initialized) {
        return;
    }

    persistenceState.flushTimer = setTimeout(() => {
        persistenceState.flushTimer = null;
        flushPersistence().catch(error => {
            console.error("Persistence flush failed:", error);
        });
    }, 120);
}

async function flushAccountsToDb(client) {
    await client.query("DELETE FROM accounts");

    for (const account of Object.values(accounts)) {
        ensureAccountDefaults(account);
        await client.query(
            `
            INSERT INTO accounts (
                username,
                display_name,
                pin_hash,
                profile_picture,
                selected_profile_picture_id,
                unlocked_profile_pictures,
                account_level,
                account_xp,
                account_xp_to_next,
                account_total_xp,
                remember_tokens,
                is_admin,
                is_disabled,
                created_at,
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, NOW()
            )
            `,
            [
                account.username,
                account.displayName,
                account.pinHash,
                account.profilePicture || "",
                account.selectedProfilePictureId || DEFAULT_PROFILE_PICTURE_ID,
                JSON.stringify(Array.isArray(account.unlockedProfilePictures) ? account.unlockedProfilePictures : []),
                Number(account.accountLevel || 1),
                Number(account.accountXp || 0),
                Number(account.accountXpToNext || 50),
                Number(account.accountTotalXp || 0),
                JSON.stringify(Array.isArray(account.rememberTokens) ? account.rememberTokens : []),
                !!account.isAdmin,
                !!account.isDisabled,
                Number(account.createdAt || Date.now())
            ]
        );
    }
}

async function flushProfilesToDb(client) {
    await client.query("DELETE FROM profiles");

    for (const profile of Object.values(profiles)) {
        await client.query(
            `
            INSERT INTO profiles (
                display_name,
                balance,
                wins,
                losses,
                pushes,
                games_played,
                total_earnings,
                runs_completed,
                highest_chapter,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            `,
            [
                profile.name,
                Number(profile.balance || 1000),
                Number(profile.wins || 0),
                Number(profile.losses || 0),
                Number(profile.pushes || 0),
                Number(profile.gamesPlayed || 0),
                Number(profile.totalEarnings || 0),
                Number(profile.runsCompleted || 0),
                Number(profile.highestChapter || 1)
            ]
        );
    }
}

async function flushSoloRunsToDb(client) {
    await client.query("DELETE FROM solo_runs");

    for (const [displayName, run] of Object.entries(soloRuns)) {
        await client.query(
            `
            INSERT INTO solo_runs (
                display_name,
                updated_at,
                game_state,
                player_run_state,
                updated_ts
            ) VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
            `,
            [
                displayName,
                Number(run.updatedAt || Date.now()),
                JSON.stringify(run.game || {}),
                JSON.stringify(run.playerRun || {})
            ]
        );
    }
}

async function flushSessionsToDb(client) {
    await client.query("DELETE FROM session_tokens");

    for (const [token, session] of sessions.entries()) {
        await client.query(
            `
            INSERT INTO session_tokens (
                token,
                username,
                display_name,
                created_at,
                expires_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
            `,
            [
                token,
                session.username,
                session.displayName,
                Number(session.createdAt || Date.now()),
                Number(session.expiresAt || Date.now())
            ]
        );
    }
}

async function flushOptionsToDb(client) {
    await client.query("DELETE FROM user_options");

    for (const account of Object.values(accounts)) {
        ensureAccountDefaults(account);
        const options = account.options || {};

        await client.query(
            `
            INSERT INTO user_options (
                username,
                theme,
                remember_login,
                ui_scale,
                sfx_volume,
                music_volume,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `,
            [
                account.username,
                options.theme === "dark" ? "dark" : "light",
                Array.isArray(account.rememberTokens) && account.rememberTokens.length > 0,
                100,
                100,
                100
            ]
        );
    }
}

async function flushPersistence() {
    if (!DB_ENABLED || persistenceState.flushInProgress || !persistenceState.initialized) {
        return;
    }

    persistenceState.flushInProgress = true;
    const pool = getDbPool();

    try {
        while (
            persistenceState.dirtyAccounts
            || persistenceState.dirtyProfiles
            || persistenceState.dirtySoloRuns
            || persistenceState.dirtySessions
            || persistenceState.dirtyOptions
        ) {
            const flushAccounts = persistenceState.dirtyAccounts;
            const flushProfiles = persistenceState.dirtyProfiles;
            const flushSoloRuns = persistenceState.dirtySoloRuns;
            const flushSessions = persistenceState.dirtySessions;
            const flushOptions = persistenceState.dirtyOptions;

            persistenceState.dirtyAccounts = false;
            persistenceState.dirtyProfiles = false;
            persistenceState.dirtySoloRuns = false;
            persistenceState.dirtySessions = false;
            persistenceState.dirtyOptions = false;

            const client = await pool.connect();

            try {
                await client.query("BEGIN");

                if (flushAccounts) {
                    await flushAccountsToDb(client);
                }

                if (flushProfiles) {
                    await flushProfilesToDb(client);
                }

                if (flushSoloRuns) {
                    await flushSoloRunsToDb(client);
                }

                if (flushSessions) {
                    await flushSessionsToDb(client);
                }

                if (flushOptions) {
                    await flushOptionsToDb(client);
                }

                await client.query("COMMIT");
            }
            catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
            finally {
                client.release();
            }
        }
    }
    finally {
        persistenceState.flushInProgress = false;
    }
}

function isReservedAdminUsername(username) {
    return String(username || "").trim().toLowerCase() === BUILT_IN_ADMIN_USERNAME;
}

function isReservedAdminDisplayName(displayName) {
    return String(displayName || "").trim().toLowerCase() === BUILT_IN_ADMIN_DISPLAY_NAME.toLowerCase();
}

function ensureBuiltInAdminAccount() {
    const existing = accounts[BUILT_IN_ADMIN_USERNAME] || {};
    const now = Date.now();

    accounts[BUILT_IN_ADMIN_USERNAME] = {
        ...existing,
        username: BUILT_IN_ADMIN_USERNAME,
        displayName: BUILT_IN_ADMIN_DISPLAY_NAME,
        pinHash: bcrypt.hashSync(BUILT_IN_ADMIN_PIN, BCRYPT_ROUNDS),
        profilePicture: resolveProfilePicturePath(DEFAULT_PROFILE_PICTURE_ID),
        selectedProfilePictureId: DEFAULT_PROFILE_PICTURE_ID,
        unlockedProfilePictures: PROFILE_PICTURES.filter(pic => pic.unlockLevel <= 1).map(pic => pic.id),
        accountLevel: Math.max(1, Number(existing.accountLevel) || 1),
        accountXp: Math.max(0, Number(existing.accountXp) || 0),
        accountXpToNext: Math.max(1, Number(existing.accountXpToNext) || calculateAccountXpToNext(Math.max(1, Number(existing.accountLevel) || 1))),
        accountTotalXp: Math.max(0, Number(existing.accountTotalXp) || 0),
        isAdmin: true,
        isDisabled: false,
        createdAt: existing.createdAt || now,
        rememberTokens: Array.isArray(existing.rememberTokens) ? existing.rememberTokens : []
    };
}

function getProfilePictureById(id) {
    return PROFILE_PICTURES.find(pic => pic.id === id) || null;
}

function resolveProfilePicturePath(profilePictureId) {
    const picture = getProfilePictureById(profilePictureId) || getProfilePictureById(DEFAULT_PROFILE_PICTURE_ID);
    return picture ? picture.path : "assets/cards/back.svg";
}

function calculateAccountXpToNext(level) {
    return 50 + (Math.max(1, level) - 1) * 30;
}

function normalizeUnlockedPictures(unlockedIds) {
    if (!Array.isArray(unlockedIds)) {
        return [];
    }

    const known = new Set(PROFILE_PICTURES.map(pic => pic.id));
    return Array.from(new Set(unlockedIds.filter(id => known.has(id))));
}

function refreshAccountPictureUnlocks(account) {
    const unlocked = new Set(normalizeUnlockedPictures(account.unlockedProfilePictures));
    const level = Math.max(1, Number(account.accountLevel) || 1);

    PROFILE_PICTURES.forEach(pic => {
        if (level >= pic.unlockLevel) {
            unlocked.add(pic.id);
        }
    });

    account.unlockedProfilePictures = Array.from(unlocked);

    if (!account.unlockedProfilePictures.includes(account.selectedProfilePictureId)) {
        account.selectedProfilePictureId = account.unlockedProfilePictures.includes(DEFAULT_PROFILE_PICTURE_ID)
            ? DEFAULT_PROFILE_PICTURE_ID
            : account.unlockedProfilePictures[0] || DEFAULT_PROFILE_PICTURE_ID;
    }

    account.profilePicture = resolveProfilePicturePath(account.selectedProfilePictureId);
}

function grantAccountXp(account, amount) {
    if (!account) {
        return { gainedLevels: 0 };
    }

    const xpGain = Math.max(0, Math.round(Number(amount) || 0));
    if (xpGain <= 0) {
        return { gainedLevels: 0 };
    }

    account.accountXp += xpGain;
    account.accountTotalXp += xpGain;

    let gainedLevels = 0;

    while (account.accountXp >= account.accountXpToNext) {
        account.accountXp -= account.accountXpToNext;
        account.accountLevel += 1;
        account.accountXpToNext = calculateAccountXpToNext(account.accountLevel);
        gainedLevels += 1;
    }

    if (gainedLevels > 0 || account.accountLevel % ACCOUNT_LEVEL_UNLOCK_STEP === 0) {
        refreshAccountPictureUnlocks(account);
    }

    return { gainedLevels };
}

function getAccountForPlayer(player) {
    if (!player) {
        return null;
    }

    if (player.username && accounts[player.username]) {
        return accounts[player.username];
    }

    const displayName = String(player.name || "").trim().toLowerCase();
    if (!displayName) {
        return null;
    }

    const key = Object.keys(accounts).find(username => {
        const account = accounts[username];
        return account && String(account.displayName || "").trim().toLowerCase() === displayName;
    });

    return key ? accounts[key] : null;
}

function getPublicProfilePicturesForAccount(account) {
    const unlockedSet = new Set(normalizeUnlockedPictures(account ? account.unlockedProfilePictures : []));
    const level = Math.max(1, Number(account && account.accountLevel) || 1);

    return PROFILE_PICTURES.map(pic => ({
        id: pic.id,
        name: pic.name,
        path: pic.path,
        unlockLevel: pic.unlockLevel,
        unlocked: unlockedSet.has(pic.id) || level >= pic.unlockLevel
    }));
}

function ensureAccountDefaults(account) {
    if (!account) {
        return;
    }

    if (!Array.isArray(account.rememberTokens)) {
        account.rememberTokens = [];
    }

    if (typeof account.isAdmin !== "boolean") {
        account.isAdmin = false;
    }

    if (typeof account.isDisabled !== "boolean") {
        account.isDisabled = false;
    }

    if (!account.options || typeof account.options !== "object") {
        account.options = {};
    }

    if (account.options.theme !== "dark" && account.options.theme !== "light") {
        account.options.theme = "light";
    }

    if (ADMIN_USERNAMES.has(String(account.username || "").toLowerCase())) {
        account.isAdmin = true;
    }

    if (typeof account.profilePicture !== "string") {
        account.profilePicture = "";
    }

    if (!Number.isFinite(account.accountLevel) || account.accountLevel < 1) {
        account.accountLevel = 1;
    }

    if (!Number.isFinite(account.accountXp) || account.accountXp < 0) {
        account.accountXp = 0;
    }

    if (!Number.isFinite(account.accountTotalXp) || account.accountTotalXp < 0) {
        account.accountTotalXp = 0;
    }

    if (!Number.isFinite(account.accountXpToNext) || account.accountXpToNext < 1) {
        account.accountXpToNext = calculateAccountXpToNext(account.accountLevel);
    }

    if (typeof account.selectedProfilePictureId !== "string" || !getProfilePictureById(account.selectedProfilePictureId)) {
        const fromLegacyPath = PROFILE_PICTURES.find(pic => pic.path === account.profilePicture);
        account.selectedProfilePictureId = fromLegacyPath ? fromLegacyPath.id : DEFAULT_PROFILE_PICTURE_ID;
    }

    account.unlockedProfilePictures = normalizeUnlockedPictures(account.unlockedProfilePictures);
    refreshAccountPictureUnlocks(account);
}

function syncProfilesWithAccounts() {
    let changed = false;

    Object.values(accounts).forEach(account => {
        ensureAccountDefaults(account);

        const displayName = normalizeName(account.displayName);
        if (!displayName) {
            return;
        }

        if (!profiles[displayName]) {
            profiles[displayName] = makeProfile(displayName);
            changed = true;
            return;
        }

        if (profiles[displayName].runsCompleted === undefined) {
            profiles[displayName].runsCompleted = 0;
            changed = true;
        }

        if (profiles[displayName].highestChapter === undefined) {
            profiles[displayName].highestChapter = 1;
            changed = true;
        }
    });

    if (changed) {
        saveProfiles();
    }
}

function loadSoloRuns() {
    try {
        if (DB_ENABLED) {
            return {};
        }

        if (!fs.existsSync(SOLO_RUNS_FILE)) {
            return {};
        }

        const raw = fs.readFileSync(SOLO_RUNS_FILE, "utf8").trim();

        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch (error) {
        console.error("Failed to read solo run data:", error);
        return {};
    }
}

function saveSoloRuns() {
    try {
        if (DB_ENABLED) {
            markDirty("soloRuns");
            return;
        }

        fs.mkdirSync(path.dirname(SOLO_RUNS_FILE), { recursive: true });
        fs.writeFileSync(SOLO_RUNS_FILE, JSON.stringify(soloRuns, null, 2), "utf8");
    }
    catch (error) {
        console.error("Failed to save solo run data:", error);
    }
}

async function initializeDatabasePersistence() {
    if (!DB_ENABLED || persistenceState.initialized) {
        return;
    }

    const pool = getDbPool();
    const schemaSql = fs.readFileSync(path.join(__dirname, "db", "schema.sql"), "utf8");
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        await client.query(schemaSql);

        const accountsResult = await client.query("SELECT * FROM accounts");
        const profilesResult = await client.query("SELECT * FROM profiles");
        const soloRunsResult = await client.query("SELECT * FROM solo_runs");
        const sessionsResult = await client.query("SELECT * FROM session_tokens");
        const optionsResult = await client.query("SELECT * FROM user_options");

        const loadedAccounts = {};
        for (const row of accountsResult.rows) {
            loadedAccounts[row.username] = {
                username: row.username,
                displayName: row.display_name,
                pinHash: row.pin_hash,
                profilePicture: row.profile_picture,
                selectedProfilePictureId: row.selected_profile_picture_id,
                unlockedProfilePictures: Array.isArray(row.unlocked_profile_pictures) ? row.unlocked_profile_pictures : [],
                accountLevel: Number(row.account_level || 1),
                accountXp: Number(row.account_xp || 0),
                accountXpToNext: Number(row.account_xp_to_next || 50),
                accountTotalXp: Number(row.account_total_xp || 0),
                rememberTokens: Array.isArray(row.remember_tokens) ? row.remember_tokens : [],
                isAdmin: !!row.is_admin,
                isDisabled: !!row.is_disabled,
                createdAt: Number(row.created_at || Date.now())
            };
        }

        const loadedOptions = {};
        for (const row of optionsResult.rows) {
            loadedOptions[row.username] = {
                theme: row.theme === "dark" ? "dark" : "light"
            };
        }

        for (const account of Object.values(loadedAccounts)) {
            account.options = loadedOptions[account.username] || { theme: "light" };
            ensureAccountDefaults(account);
        }

        const loadedProfiles = {};
        for (const row of profilesResult.rows) {
            loadedProfiles[row.display_name] = {
                name: row.display_name,
                balance: Number(row.balance || 1000),
                wins: Number(row.wins || 0),
                losses: Number(row.losses || 0),
                pushes: Number(row.pushes || 0),
                gamesPlayed: Number(row.games_played || 0),
                totalEarnings: Number(row.total_earnings || 0),
                runsCompleted: Number(row.runs_completed || 0),
                highestChapter: Number(row.highest_chapter || 1)
            };
        }

        const loadedSoloRuns = {};
        for (const row of soloRunsResult.rows) {
            loadedSoloRuns[row.display_name] = {
                updatedAt: Number(row.updated_at || Date.now()),
                game: row.game_state || {},
                playerRun: row.player_run_state || {}
            };
        }

        const loadedSessions = new Map();
        for (const row of sessionsResult.rows) {
            loadedSessions.set(row.token, {
                username: row.username,
                displayName: row.display_name,
                createdAt: Number(row.created_at || Date.now()),
                expiresAt: Number(row.expires_at || Date.now())
            });
        }

        accounts = loadedAccounts;
        profiles = loadedProfiles;
        soloRuns = loadedSoloRuns;

        sessions.clear();
        for (const [token, session] of loadedSessions.entries()) {
            sessions.set(token, session);
        }

        ensureBuiltInAdminAccount();
        Object.values(accounts).forEach(ensureAccountDefaults);
        syncProfilesWithAccounts();

        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }

    persistenceState.initialized = true;
    markDirty("accounts");
    markDirty("profiles");
    markDirty("options");
    markDirty("sessions");
}

function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}

function hashRememberToken(token) {
    return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function cleanRememberTokens(account) {
    if (!account) {
        return;
    }

    const now = Date.now();
    const list = Array.isArray(account.rememberTokens) ? account.rememberTokens : [];
    account.rememberTokens = list.filter(item => item && item.expiresAt > now);
}

function issueRememberToken(account) {
    cleanRememberTokens(account);

    const raw = generateToken();
    const tokenHash = hashRememberToken(raw);
    const now = Date.now();

    account.rememberTokens.push({
        tokenHash,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: now + REMEMBER_TTL_MS
    });

    // Keep only the newest 5 remember sessions per account.
    if (account.rememberTokens.length > 5) {
        account.rememberTokens = account.rememberTokens
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 5);
    }

    return raw;
}

function findAccountByRememberToken(rawToken) {
    const tokenHash = hashRememberToken(rawToken);
    const now = Date.now();

    for (const key of Object.keys(accounts)) {
        const account = accounts[key];
        cleanRememberTokens(account);

        const match = account.rememberTokens.find(item => item.tokenHash === tokenHash && item.expiresAt > now);

        if (match) {
            match.lastUsedAt = now;
            return account;
        }
    }

    return null;
}

function setSessionRecord(token, session) {
    sessions.set(token, session);
    markDirty("sessions");
}

function deleteSessionRecord(token) {
    const removed = sessions.delete(token);
    if (removed) {
        markDirty("sessions");
    }
}

function deleteSessionsForUsername(username) {
    let removed = false;

    for (const [sessionToken, session] of sessions.entries()) {
        if (session && session.username === username) {
            sessions.delete(sessionToken);
            removed = true;
        }
    }

    if (removed) {
        markDirty("sessions");
    }
}

function getSession(token) {
    if (!token) {
        return null;
    }

    const session = sessions.get(token);

    if (!session) {
        return null;
    }

    if (session.expiresAt < Date.now()) {
        deleteSessionRecord(token);
        return null;
    }

    return session;
}

function getAccountFromToken(token) {
    const session = getSession(String(token || ""));

    if (!session) {
        return { session: null, account: null };
    }

    const account = accounts[session.username] || null;
    if (account) {
        ensureAccountDefaults(account);

        if (account.isDisabled) {
            deleteSessionRecord(String(token || ""));
            return { session: null, account: null };
        }
    }

    return { session, account };
}

function migrateDisplayName(oldName, newName) {
    if (!oldName || !newName || oldName === newName) {
        return;
    }

    if (profiles[oldName]) {
        if (profiles[newName]) {
            return;
        }

        profiles[newName] = profiles[oldName];
        profiles[newName].name = newName;
        delete profiles[oldName];
        saveProfiles();
    }

    if (soloRuns[oldName]) {
        soloRuns[newName] = soloRuns[oldName];
        delete soloRuns[oldName];
        saveSoloRuns();
    }
}

function updateConnectedPlayerName(username, nextDisplayName) {
    Object.values(players).forEach(player => {
        if (!player) {
            return;
        }

        const socket = io.sockets.sockets.get(player.id);
        const playerUsername = socket && socket.data ? socket.data.username : "";

        if (playerUsername === username) {
            player.name = nextDisplayName;
        }
    });
}

if (!DB_ENABLED) {
    ensureBuiltInAdminAccount();
    Object.values(accounts).forEach(ensureAccountDefaults);
    syncProfilesWithAccounts();
    saveAccounts();
}

function recordLoginAttempt(ip) {
    const now = Date.now();
    const entry = loginAttempts.get(ip);

    if (!entry || entry.resetAt < now) {
        loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
        return;
    }

    entry.count += 1;
}

function isRateLimited(ip) {
    const entry = loginAttempts.get(ip);

    if (!entry || entry.resetAt < Date.now()) {
        return false;
    }

    return entry.count >= 5;
}

function clearLoginAttempts(ip) {
    loginAttempts.delete(ip);
}

function normalizeName(name) {
    return String(name || "").trim().replace(/\s+/g, " ").slice(0, 20);
}

function makeProfile(name) {
    return {
        name,
        balance: 1000,
        wins: 0,
        losses: 0,
        pushes: 0,
        gamesPlayed: 0,
        totalEarnings: 0,
        runsCompleted: 0,
        highestChapter: 1
    };
}

function getOrCreateProfile(name) {
    if (!profiles[name]) {
        profiles[name] = makeProfile(name);
        saveProfiles();
    }

    if (profiles[name].runsCompleted === undefined) {
        profiles[name].runsCompleted = 0;
    }

    if (profiles[name].highestChapter === undefined) {
        profiles[name].highestChapter = 1;
    }

    return profiles[name];
}

function createDeck() {
    const suits = ["S", "H", "D", "C"];
    const values = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const deck = [];

    for (const suit of suits) {
        for (const value of values) {
            deck.push({ suit, value });
        }
    }

    return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function getCardValue(card) {
    if (!card) {
        return 0;
    }

    if (["J", "Q", "K"].includes(card.value)) {
        return 10;
    }

    if (card.value === "A") {
        return 11;
    }

    return Number(card.value);
}

function getHandValue(hand) {
    let total = hand.reduce((sum, card) => sum + getCardValue(card), 0);
    let aceCount = hand.filter(card => card.value === "A").length;

    while (total > 21 && aceCount > 0) {
        total -= 10;
        aceCount -= 1;
    }

    return total;
}

function isBlackjack(hand) {
    return hand.length === 2 && getHandValue(hand) === 21;
}

function getSortedLeaderboard(limit = null) {
    syncProfilesWithAccounts();

    const rows = Object.values(profiles)
        .sort((a, b) => {
            if (b.runsCompleted !== a.runsCompleted) {
                return b.runsCompleted - a.runsCompleted;
            }

            if (b.highestChapter !== a.highestChapter) {
                return b.highestChapter - a.highestChapter;
            }

            return a.name.localeCompare(b.name);
        })
        .map((entry, index) => ({
            rank: index + 1,
            name: entry.name,
            balance: entry.balance,
            wins: entry.wins,
            losses: entry.losses,
            pushes: entry.pushes,
            gamesPlayed: entry.gamesPlayed,
            totalEarnings: entry.totalEarnings,
            runsCompleted: entry.runsCompleted,
            highestChapter: entry.highestChapter
        }));

    if (!Number.isFinite(limit) || limit <= 0) {
        return rows;
    }

    return rows.slice(0, Math.floor(limit));
}

function createRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    for (let i = 0; i < 50; i += 1) {
        let code = "";

        for (let j = 0; j < 6; j += 1) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }

        if (!rooms.has(code)) {
            return code;
        }
    }

    return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function createRunState() {
    return {
        runActive: false,
        phase: "lobby",
        chapter: 1,
        roundInChapter: 0,
        totalRoundsPlayed: 0,
        roundsLost: 0,
        dealerTier: 1,
        deck: [],
        dealer: {
            hand: [],
            busted: false,
            maxHealth: 0,
            health: 0,
            attackDamage: 0,
            isBoss: false,
            archetypeId: "",
            name: "Dealer"
        },
        roundBanner: null,
        autoNextTimeout: null,
        blackjackTimeout: null,
        turnTimeout: null,
        turnOrder: [],
        currentTurnIndex: 0,
        lastRoundSummary: null,
        runResult: null,
        shopSeed: 0
    };
}

function makePlayerRunState() {
    return {
        hand: [],
        standing: false,
        busted: false,
        handMultiplier: 1,
        handActionCount: 0,
        resolvedHands: [],
        pendingSplitHands: [],
        splitActive: false,
        tempShield: 0,
        usedManaSurge: false,
        usedAbilityThisHand: false,
        usedArcaneDrawThisHand: false,
        manaSpentThisHand: 0,
        emberStrikeActive: false,
        siphonStrikeActive: false,
        focusSigilActive: false,
        tranceStacks: 0,
        unlockedAbilities: [],
        pendingBlessingOptions: [],
        pendingShopChoices: 0,
        pendingShopOptions: [],
        relics: [],
        relicEffects: {
            openingAceForge: false,
            cardUpgradeCharges: 0
        },
        health: BASE_PLAYER.health,
        maxHealth: BASE_PLAYER.health,
        attackDamage: BASE_PLAYER.attackDamage,
        mana: BASE_PLAYER.maxMana,
        maxMana: BASE_PLAYER.maxMana,
        xp: 0,
        level: 1,
        xpToNext: calculateXpToNext(1),
        pendingStatChoices: 0,
        pendingBlessingChoices: 0,
        alive: true
    };
}

function sanitizeSavedPlayerRun(rawRun) {
    const defaults = makePlayerRunState();
    const candidate = rawRun && typeof rawRun === "object" ? rawRun : {};

    return {
        ...defaults,
        ...candidate,
        hand: Array.isArray(candidate.hand) ? candidate.hand : [],
        resolvedHands: Array.isArray(candidate.resolvedHands) ? candidate.resolvedHands : [],
        pendingSplitHands: Array.isArray(candidate.pendingSplitHands) ? candidate.pendingSplitHands : [],
        unlockedAbilities: Array.isArray(candidate.unlockedAbilities)
            ? candidate.unlockedAbilities.filter(id => ABILITIES[id])
            : [],
        pendingBlessingOptions: Array.isArray(candidate.pendingBlessingOptions)
            ? candidate.pendingBlessingOptions.filter(option => option && ABILITIES[option.id])
            : [],
        pendingShopChoices: Number.isFinite(candidate.pendingShopChoices) ? Math.max(0, Math.floor(candidate.pendingShopChoices)) : 0,
        pendingShopOptions: Array.isArray(candidate.pendingShopOptions)
            ? candidate.pendingShopOptions.filter(option => option && SHOP_ITEMS[option.id])
            : [],
        relics: Array.isArray(candidate.relics)
            ? candidate.relics.filter(id => SHOP_ITEMS[id])
            : [],
        relicEffects: {
            openingAceForge: !!(candidate.relicEffects && candidate.relicEffects.openingAceForge),
            cardUpgradeCharges: Math.max(0, Number(candidate.relicEffects && candidate.relicEffects.cardUpgradeCharges) || 0)
        },
        levelChoiceTimeout: null
    };
}

function runHasAbility(run, abilityId) {
    return Array.isArray(run.unlockedAbilities) && run.unlockedAbilities.includes(abilityId);
}

function pickRandom(array, count) {
    const clone = [...array];

    for (let i = clone.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [clone[i], clone[j]] = [clone[j], clone[i]];
    }

    return clone.slice(0, Math.max(0, Math.min(count, clone.length)));
}

function buildBlessingOptionsForRun(run) {
    const allAbilities = Object.values(ABILITIES);
    const lockedAbilities = allAbilities.filter(ability => !runHasAbility(run, ability.id));
    const pool = lockedAbilities.length > 0 ? lockedAbilities : allAbilities;

    return pickRandom(pool, BLESSING_OPTION_COUNT).map(ability => ({
        id: ability.id,
        name: ability.name,
        description: lockedAbilities.length > 0
            ? `Unlock ${ability.type}: ${ability.description}`
            : `Mastery for ${ability.name}: +2 Attack and +2 Max Mana.`
    }));
}

function ensureBlessingOptions(run) {
    if (run.pendingBlessingChoices <= 0) {
        run.pendingBlessingOptions = [];
        return;
    }

    if (!Array.isArray(run.pendingBlessingOptions) || run.pendingBlessingOptions.length === 0) {
        run.pendingBlessingOptions = buildBlessingOptionsForRun(run);
    }
}

function applyBlessingChoice(run, abilityId) {
    if (!runHasAbility(run, abilityId)) {
        run.unlockedAbilities.push(abilityId);
        return;
    }

    // If everything is unlocked, repeated picks become mastery bonuses.
    run.attackDamage += 2;
    run.maxMana += 2;
    run.mana = Math.min(run.maxMana, run.mana + 2);
}

function isBossTier(tier) {
    return Math.max(1, Number(tier) || 1) % ROUNDS_PER_CHAPTER === 0;
}

function getDealerArchetypeForTier(tier) {
    const index = (Math.max(1, Number(tier) || 1) - 1) % DEALER_ARCHETYPES.length;
    return DEALER_ARCHETYPES[index];
}

function buildShopOptionsForRun(run) {
    const allItems = Object.values(SHOP_ITEMS);
    const owned = new Set(Array.isArray(run.relics) ? run.relics : []);
    const pool = allItems.filter(item => item.repeatable || !owned.has(item.id));
    const selectionPool = pool.length >= SHOP_OPTION_COUNT ? pool : allItems;

    return pickRandom(selectionPool, SHOP_OPTION_COUNT).map(item => ({
        id: item.id,
        type: item.type,
        name: item.name,
        description: item.description
    }));
}

function ensureShopOptions(run) {
    if (run.pendingShopChoices <= 0) {
        run.pendingShopOptions = [];
        return;
    }

    if (!Array.isArray(run.pendingShopOptions) || run.pendingShopOptions.length === 0) {
        run.pendingShopOptions = buildShopOptionsForRun(run);
    }
}

function transmuteLowestCard(hand, replacementCard) {
    if (!Array.isArray(hand) || hand.length === 0 || !replacementCard) {
        return false;
    }

    let index = 0;
    let lowestValue = Infinity;

    hand.forEach((card, cardIndex) => {
        const value = getCardValue(card);
        if (value < lowestValue) {
            lowestValue = value;
            index = cardIndex;
        }
    });

    hand[index] = { ...replacementCard };
    return true;
}

function applyShopChoice(run, itemId) {
    const item = SHOP_ITEMS[itemId];
    if (!item) {
        return false;
    }

    if (!Array.isArray(run.relics)) {
        run.relics = [];
    }

    if (!run.relicEffects || typeof run.relicEffects !== "object") {
        run.relicEffects = { openingAceForge: false, cardUpgradeCharges: 0 };
    }

    if (!item.repeatable && run.relics.includes(item.id)) {
        return false;
    }

    if (item.id === "ironBand") {
        run.attackDamage += 2;
    }
    else if (item.id === "moonwellVial") {
        run.maxHealth += 10;
        run.health = Math.min(run.maxHealth, run.health + 10);
    }
    else if (item.id === "prismCore") {
        run.maxMana += 2;
        run.mana = Math.min(run.maxMana, run.mana + 2);
    }
    else if (item.id === "aceForge") {
        run.relicEffects.openingAceForge = true;
    }
    else if (item.id === "kingEtcher") {
        run.relicEffects.cardUpgradeCharges = Math.max(0, Number(run.relicEffects.cardUpgradeCharges) || 0) + 2;
    }

    run.relics.push(item.id);
    return true;
}

function applyRoundStartRelics(player) {
    const run = player && player.run;
    if (!run || !Array.isArray(run.hand) || run.hand.length === 0) {
        return;
    }

    if (run.relicEffects && run.relicEffects.openingAceForge) {
        transmuteLowestCard(run.hand, { value: "A", suit: "D" });
    }

    if (run.relicEffects && Number(run.relicEffects.cardUpgradeCharges) > 0) {
        const changed = transmuteLowestCard(run.hand, { value: "K", suit: "H" });
        if (changed) {
            run.relicEffects.cardUpgradeCharges -= 1;
        }
    }
}

function sanitizeSavedGame(rawGame) {
    const defaults = createRunState();
    const candidate = rawGame && typeof rawGame === "object" ? rawGame : {};
    const dealerCandidate = candidate.dealer && typeof candidate.dealer === "object"
        ? candidate.dealer
        : {};

    return {
        ...defaults,
        ...candidate,
        autoNextTimeout: null,
        turnTimeout: null,
        turnOrder: Array.isArray(candidate.turnOrder) ? candidate.turnOrder : [],
        currentTurnIndex: Number.isInteger(candidate.currentTurnIndex) ? candidate.currentTurnIndex : 0,
        dealer: {
            ...defaults.dealer,
            ...dealerCandidate,
            hand: Array.isArray(dealerCandidate.hand) ? dealerCandidate.hand : []
        },
        shopSeed: Number.isFinite(candidate.shopSeed) ? candidate.shopSeed : 0
    };
}

function saveSoloRunForPlayer(player, room) {
    if (!player || !room || !room.game || room.playerIds.length !== 1) {
        return;
    }

    soloRuns[player.name] = {
        updatedAt: Date.now(),
        game: sanitizeSavedGame(room.game),
        playerRun: sanitizeSavedPlayerRun(player.run)
    };

    saveSoloRuns();
}

function clearSoloRunForPlayer(playerName) {
    const key = String(playerName || "").trim();

    if (!key || !soloRuns[key]) {
        return;
    }

    delete soloRuns[key];
    saveSoloRuns();
}

function restoreSoloRunForPlayer(player, room) {
    if (!player || !room || room.playerIds.length !== 1) {
        return false;
    }

    const saved = soloRuns[player.name];

    if (!saved || !saved.game || !saved.playerRun) {
        return false;
    }

    room.game = sanitizeSavedGame(saved.game);
    player.run = sanitizeSavedPlayerRun(saved.playerRun);

    room.game.turnOrder = room.game.phase === "in-round" ? [player.id] : [];
    room.game.currentTurnIndex = 0;

    clearLevelChoiceTimer(player);

    return true;
}

function resetPlayerRunState(player) {
    player.run = makePlayerRunState();
}

function createRoom(hostId) {
    const code = createRoomCode();
    const room = {
        code,
        createdAt: Date.now(),
        hostId,
        playerIds: [],
        game: createRunState()
    };

    rooms.set(code, room);
    return room;
}

function getRoomBySocketId(socketId) {
    const player = players[socketId];

    if (!player || !player.roomCode) {
        return null;
    }

    return rooms.get(player.roomCode) || null;
}

function ensureRoomHost(room) {
    if (!room) {
        return;
    }

    room.playerIds = room.playerIds.filter(id => players[id]);

    if (room.playerIds.length === 0) {
        rooms.delete(room.code);
        return;
    }

    if (!room.playerIds.includes(room.hostId)) {
        room.hostId = room.playerIds[0];
    }

    room.playerIds.forEach(id => {
        if (players[id]) {
            players[id].isHost = id === room.hostId;
        }
    });
}

function getPublicPlayer(player) {
    const run = player.run;
    const activeValue = getHandValue(run.hand);
    const canDouble = run.alive
        && !run.standing
        && !run.busted
        && run.hand.length === 2
        && run.handActionCount === 0;
    // Split is allowed even after an ability (e.g. Arcane Draw producing two Aces),
    // as long as the hand still has exactly 2 cards of matching value.
    const canSplit = run.alive
        && !run.standing
        && !run.busted
        && run.pendingSplitHands.length === 0
        && run.hand.length === 2
        && run.hand[0]
        && run.hand[1]
        && getCardValue(run.hand[0]) === getCardValue(run.hand[1]);

    return {
        id: player.id,
        name: player.name,
        isHost: player.isHost,
        connectedAt: player.connectedAt,
        stats: player.stats,
        run: {
            hand: run.hand,
            handValue: activeValue,
            standing: run.standing,
            busted: run.busted,
            handMultiplier: run.handMultiplier,
            handActionCount: run.handActionCount,
            resolvedHands: run.resolvedHands.map(hand => ({
                cards: Array.isArray(hand.cards) ? [...hand.cards] : [],
                busted: !!hand.busted,
                multiplier: hand.multiplier || 1
            })),
            pendingSplitHands: run.pendingSplitHands.map(hand => Array.isArray(hand) ? [...hand] : []),
            splitActive: !!run.splitActive,
            splitHandsRemaining: run.pendingSplitHands.length,
            resolvedHandCount: run.resolvedHands.length,
            canDouble,
            canSplit,
            health: run.health,
            maxHealth: run.maxHealth,
            attackDamage: run.attackDamage,
            mana: run.mana,
            maxMana: run.maxMana,
            xp: run.xp,
            level: run.level,
            xpToNext: run.xpToNext,
            pendingStatChoices: run.pendingStatChoices,
            pendingBlessingChoices: run.pendingBlessingChoices,
            pendingBlessingOptions: Array.isArray(run.pendingBlessingOptions)
                ? run.pendingBlessingOptions.map(option => ({ ...option }))
                : [],
            pendingShopChoices: run.pendingShopChoices,
            pendingShopOptions: Array.isArray(run.pendingShopOptions)
                ? run.pendingShopOptions.map(option => ({ ...option }))
                : [],
            relics: Array.isArray(run.relics) ? [...run.relics] : [],
            unlockedAbilities: Array.isArray(run.unlockedAbilities) ? [...run.unlockedAbilities] : [],
            alive: run.alive,
            emberStrikeActive: run.emberStrikeActive || false
        }
    };
}

function getCurrentPlayerId(room) {
    return room.game.turnOrder[room.game.currentTurnIndex] || null;
}

function getPublicGameState(room, revealDealer = false) {
    const now = Date.now();
    const roundBanner = room.game.roundBanner && room.game.roundBanner.until > now
        ? room.game.roundBanner
        : null;

    const dealerHand = revealDealer || room.game.phase !== "in-round"
        ? room.game.dealer.hand
        : [room.game.dealer.hand[0], { hidden: true }];

    return {
        roomCode: room.code,
        invitePath: `/lobby.html?room=${room.code}`,
        playerCount: room.playerIds.length,
        hostId: room.hostId,
        phase: room.game.phase,
        runActive: room.game.runActive,
        chapter: room.game.chapter,
        roundInChapter: room.game.roundInChapter,
        roundsPerChapter: ROUNDS_PER_CHAPTER,
        totalRoundsPlayed: room.game.totalRoundsPlayed,
        roundsLost: room.game.roundsLost,
        roundsLostLimit: RUN_LOSS_LIMIT,
        dealerTier: room.game.dealerTier || 1,
        currentTurnId: room.game.phase === "in-round" ? getCurrentPlayerId(room) : null,
        dealer: {
            hand: dealerHand,
            handValue: revealDealer || room.game.phase !== "in-round"
                ? getHandValue(room.game.dealer.hand)
                : (room.game.dealer.hand[0] ? getCardValue(room.game.dealer.hand[0]) : 0),
            busted: room.game.dealer.busted,
            health: room.game.dealer.health,
            maxHealth: room.game.dealer.maxHealth,
            attackDamage: room.game.dealer.attackDamage,
            isBoss: !!room.game.dealer.isBoss,
            archetypeId: room.game.dealer.archetypeId || "",
            name: room.game.dealer.name || "Dealer"
        },
        roundBanner,
        players: Object.fromEntries(room.playerIds.map(id => [id, getPublicPlayer(players[id])])),
        lastRoundSummary: room.game.lastRoundSummary,
        runResult: room.game.runResult,
        abilities: Object.values(ABILITIES),
        blessings: []
    };
}

function getPublicRoomList() {
    return Array.from(rooms.values())
        .map(room => ({
            code: room.code,
            playerCount: room.playerIds.length,
            runActive: room.game.runActive,
            phase: room.game.phase,
            hostName: players[room.hostId] ? players[room.hostId].name : "Unknown"
        }))
        .filter(room => room.playerCount > 0)
        .sort((a, b) => a.code.localeCompare(b.code));
}

function emitRoomList(targetSocket = null) {
    const payload = getPublicRoomList();

    if (targetSocket) {
        targetSocket.emit("roomsList", payload);
        return;
    }

    io.emit("roomsList", payload);
}

function emitRoomState(room, targetSocket = null) {
    const payload = {
        roomCode: room.code,
        invitePath: `/lobby.html?room=${room.code}`,
        playerCount: room.playerIds.length,
        hostId: room.hostId,
        players: Object.fromEntries(room.playerIds.map(id => [id, getPublicPlayer(players[id])])),
        runActive: room.game.runActive,
        phase: room.game.phase
    };

    if (targetSocket) {
        targetSocket.emit("roomState", payload);
        return;
    }

    io.to(room.code).emit("roomState", payload);
}

function emitGameState(room, revealDealer = false) {
    io.to(room.code).emit("gameState", getPublicGameState(room, revealDealer));
}

function leaveCurrentRoom(socketId, socket = null) {
    const player = players[socketId];

    if (!player || !player.roomCode) {
        return;
    }

    const room = rooms.get(player.roomCode);

    if (!room) {
        player.roomCode = null;
        return;
    }

    room.playerIds = room.playerIds.filter(id => id !== socketId);

    if (socket) {
        socket.leave(room.code);
    }

    if (room.game.turnOrder.includes(socketId)) {
        const removedIndex = room.game.turnOrder.indexOf(socketId);
        room.game.turnOrder = room.game.turnOrder.filter(id => id !== socketId);

        if (removedIndex < room.game.currentTurnIndex) {
            room.game.currentTurnIndex -= 1;
        }

        if (room.game.currentTurnIndex >= room.game.turnOrder.length) {
            room.game.currentTurnIndex = Math.max(0, room.game.turnOrder.length - 1);
        }

        // If the leaving player was the current turn holder, reschedule the timer
        // for whoever is now active (or settle if everyone is done).
        clearTurnTimeout(room);
        if (room.game.phase === "in-round" && room.game.turnOrder.length > 0) {
            if (room.game.currentTurnIndex < room.game.turnOrder.length) {
                scheduleTurnTimeout(room);
            } else {
                settleRound(room);
            }
        }
    }

    player.roomCode = null;

    if (room.playerIds.length === 0) {
        rooms.delete(room.code);
    }
    else {
        ensureRoomHost(room);
        emitRoomState(room);
        emitGameState(room);
    }

    emitRoomList();
}

function joinRoom(socket, roomCode) {
    const player = players[socket.id];

    if (!player) {
        return { ok: false, error: "Join the game first." };
    }

    const code = String(roomCode || "").trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
        return { ok: false, error: "Room not found." };
    }

    if (room.playerIds.length >= MAX_PLAYERS_PER_ROOM) {
        return { ok: false, error: "Room is full." };
    }

    if (player.roomCode === room.code) {
        return { ok: true, room };
    }

    leaveCurrentRoom(socket.id, socket);

    room.playerIds.push(socket.id);
    player.roomCode = room.code;
    player.isHost = false;

    socket.join(room.code);

    ensureRoomHost(room);
    emitRoomState(room);
    emitGameState(room);
    emitRoomList();

    return { ok: true, room };
}

function requireJoined(socket) {
    if (!players[socket.id]) {
        socket.emit("errorMessage", "Join first.");
        return false;
    }

    return true;
}

function requireRoom(socket) {
    const room = getRoomBySocketId(socket.id);

    if (!room) {
        socket.emit("errorMessage", "Join a room first.");
        return null;
    }

    return room;
}

function requireHost(socket, room) {
    if (room.hostId !== socket.id) {
        socket.emit("errorMessage", "Only host can do that.");
        return false;
    }

    return true;
}

function anyPendingChoices(room) {
    return room.playerIds.some(id => {
        const player = players[id];
        return player && (
            player.run.pendingStatChoices > 0
            || player.run.pendingBlessingChoices > 0
            || player.run.pendingShopChoices > 0
        );
    });
}

function calculateXpToNext(level) {
    return 10 + (level - 1) * 5;
}

function grantXp(player, amount) {
    player.run.xp += amount;

    let levelsGained = 0;

    while (player.run.xp >= player.run.xpToNext) {
        player.run.xp -= player.run.xpToNext;
        player.run.level += 1;
        player.run.xpToNext = calculateXpToNext(player.run.level);
        levelsGained += 1;
    }

    if (levelsGained > 0) {
        player.run.pendingStatChoices += levelsGained;
    }
}

function clearLevelChoiceTimer(player) {
    if (!player || !player.run.levelChoiceTimeout) {
        return;
    }

    clearTimeout(player.run.levelChoiceTimeout);
    player.run.levelChoiceTimeout = null;
}

function scheduleLevelChoiceTimeout(room, player, timeoutMs = 30000) {
    if (!room || !player || player.run.pendingStatChoices <= 0 || !player.run.alive) {
        return;
    }

    clearLevelChoiceTimer(player);

    player.run.levelChoiceTimeout = setTimeout(() => {
        player.run.levelChoiceTimeout = null;

        if (!player.run.alive || player.run.pendingStatChoices <= 0) {
            return;
        }

        const options = ["health", "attack", "mana"];
        const base = options[Math.floor(Math.random() * options.length)];
        applyLevelUpStat(player, base);
        player.run.pendingStatChoices -= 1;

        resolvePostRoundState(room);
        emitRoomState(room);
        emitGameState(room);
        maybeAutoStartNextRound(room);
    }, timeoutMs);
}

function applyLevelUpStat(player, stat) {
    const base = String(stat || "");

    if (base === "health") {
        const gain = 6;
        player.run.maxHealth += gain;
        player.run.health = Math.min(player.run.maxHealth, player.run.health + gain);
        return;
    }

    if (base === "attack") {
        player.run.attackDamage += 2;
        return;
    }

    if (base === "mana") {
        const gain = 2;
        player.run.maxMana += gain;
        player.run.mana = Math.min(player.run.maxMana, player.run.mana + gain);
    }
}

function finalizeCurrentHand(player) {
    player.run.resolvedHands.push({
        cards: [...player.run.hand],
        busted: player.run.busted,
        multiplier: player.run.handMultiplier
    });
}

function continueSplitOrEndTurn(player, room) {
    finalizeCurrentHand(player);

    if (player.run.pendingSplitHands.length > 0) {
        const nextHand = player.run.pendingSplitHands.shift();
        player.run.hand = nextHand;
        player.run.standing = false;
        player.run.busted = getHandValue(nextHand) > 21;
        player.run.handMultiplier = 1;
        player.run.handActionCount = 0;

        if (player.run.busted) {
            return continueSplitOrEndTurn(player, room);
        }

        return false;
    }

    return true;
}

function getSettledHands(player) {
    if (player.run.resolvedHands.length > 0) {
        return player.run.resolvedHands;
    }

    return [{
        cards: [...player.run.hand],
        busted: player.run.busted,
        multiplier: player.run.handMultiplier
    }];
}

function resolvePlayerRoundOutcome(player, dealerHand, dealerAttackDamage) {
    const settledHands = getSettledHands(player);
    const dealerScore = getHandValue(dealerHand);
    const dealerBusted = dealerScore > 21;

    const handOutcomes = settledHands.map(handState => {
        const handScore = getHandValue(handState.cards);
        let handResult = "push";

        if (handState.busted) {
            handResult = "loss";
        }
        else if (isBlackjack(handState.cards) && !isBlackjack(dealerHand)) {
            handResult = "blackjack";
        }
        else if (dealerBusted || handScore > dealerScore) {
            handResult = "win";
        }
        else if (handScore < dealerScore) {
            handResult = "loss";
        }

        return {
            result: handResult,
            score: handScore,
            multiplier: handState.multiplier || 1
        };
    });

    const winHands = handOutcomes.filter(x => x.result === "win" || x.result === "blackjack");
    const lossHands = handOutcomes.filter(x => x.result === "loss");
    const blackjackHands = handOutcomes.filter(x => x.result === "blackjack");
    const combo = winHands.length > 0 ? calculateComboDamage(player, winHands) : { totalDamage: 0, heal: 0 };

    return {
        handOutcomes,
        winHands,
        lossHands,
        blackjackHands,
        dealerDamage: combo.totalDamage,
        heal: combo.heal,
        playerDamage: lossHands.length > 0 && lossHands.length === handOutcomes.length
            ? Math.max(1, dealerAttackDamage - player.run.tempShield)
            : 0,
        dealerScore
    };
}

function drawCard(room) {
    if (room.game.deck.length === 0) {
        room.game.deck = createDeck();
        shuffleDeck(room.game.deck);
    }

    return room.game.deck.pop();
}

function getDealerStatsForRound(room) {
    const aliveCount = room.playerIds
        .map(id => players[id])
        .filter(player => player && player.run.alive)
        .length;

    const chapter = room.game.chapter;
    const roundScale = room.game.roundInChapter + 1;
    const tier = room.game.dealerTier || 1;
    const archetype = getDealerArchetypeForTier(tier);
    const isBoss = isBossTier(tier);

    // Base stats scale with chapter/round/tier (same as solo).
    // Extra players make the dealer significantly stronger: each additional
    // player beyond the first adds 20 HP and 4 ATK so the fight stays challenging.
    const extraPlayers = Math.max(0, aliveCount - 1);
    const baseMaxHealth = 16 + (chapter * 5) + (roundScale * 2) + extraPlayers * 20 + (tier - 1) * 25;
    const baseAttackDamage = 4 + chapter + Math.floor(extraPlayers * 4) + (tier - 1) * 4;

    const bossHealthMult = isBoss ? 1.65 : 1;
    const bossAttackMult = isBoss ? 1.4 : 1;

    return {
        maxHealth: Math.max(1, Math.round(baseMaxHealth * archetype.healthMult * bossHealthMult)),
        attackDamage: Math.max(1, Math.round(baseAttackDamage * archetype.attackMult * bossAttackMult)),
        isBoss,
        archetypeId: archetype.id,
        name: isBoss ? `Boss ${archetype.name}` : `${archetype.name} Dealer`
    };
}

function applyAbility(player, room, abilityId) {
    const ability = ABILITIES[abilityId];

    if (!ability) {
        return { ok: false, error: "Unknown ability." };
    }

    if (!runHasAbility(player.run, ability.id)) {
        return { ok: false, error: "You have not unlocked that ability yet." };
    }

    if (ability.type !== "active") {
        return { ok: false, error: "Passive abilities activate automatically." };
    }

    // Only one ability may be used per hand.
    if (player.run.usedAbilityThisHand) {
        return { ok: false, error: "You can only use one ability per hand." };
    }

    if (player.run.mana < ability.manaCost) {
        return { ok: false, error: "Not enough mana." };
    }

    if (ability.id === "arcaneDraw" && player.run.handActionCount > 0) {
        return { ok: false, error: "Arcane Draw can only be used as your first action." };
    }

    player.run.mana -= ability.manaCost;
    player.run.usedAbilityThisHand = true;
    player.run.manaSpentThisHand += ability.manaCost;

    if (ability.id === "arcaneDraw") {
        // Replace the lowest non-Ace card with an Ace.
        const nonAces = player.run.hand
            .map((card, index) => ({ card, index }))
            .filter(({ card }) => card.value !== "A");

        if (nonAces.length === 0) {
            // All cards already Aces; refund mana and cancel.
            player.run.mana += ability.manaCost;
            player.run.usedAbilityThisHand = false;
            return { ok: false, error: "All your cards are already Aces." };
        }

        // Find lowest card by numeric value.
        const lowest = nonAces.reduce((min, item) => {
            const v = getCardValue(item.card);
            return v < getCardValue(min.card) ? item : min;
        }, nonAces[0]);

        player.run.hand[lowest.index] = { value: "A", suit: lowest.card.suit };
        player.run.usedArcaneDrawThisHand = true;

        // Recheck bust status.
        if (getHandValue(player.run.hand) > 21) {
            player.run.busted = true;
            player.run.standing = true;
        } else {
            player.run.busted = false;
        }
    }

    if (ability.id === "mendWounds") {
        player.run.health = Math.min(player.run.maxHealth, player.run.health + 10);
    }

    if (ability.id === "emberStrike") {
        // Mark player; damage is applied at settle time if they win.
        player.run.emberStrikeActive = true;
    }

    if (ability.id === "manaSurge") {
        player.run.mana = Math.min(player.run.maxMana, player.run.mana + 2);
        player.run.usedManaSurge = true;
    }

    if (ability.id === "siphonStrike") {
        player.run.tempShield += 6;
        player.run.siphonStrikeActive = true;
    }

    if (ability.id === "focusSigil") {
        player.run.focusSigilActive = true;
    }

    if (runHasAbility(player.run, "battleTrance")) {
        player.run.tranceStacks = Math.min(4, (player.run.tranceStacks || 0) + 1);
    }

    player.run.handActionCount += 1;

    return { ok: true };
}

function calculateComboDamage(player, winHands) {
    const run = player.run;
    const settledHands = getSettledHands(player);
    let multiplier = run.emberStrikeActive ? 2 : 1;
    let flatBonus = 0;
    let heal = 0;

    if (runHasAbility(run, "battleTrance")) {
        multiplier += Math.min(0.8, (run.tranceStacks || 0) * 0.2);
    }

    if (run.focusSigilActive) {
        multiplier += 0.5;

        if (run.emberStrikeActive) {
            multiplier += 0.5;
        }
    }

    if (runHasAbility(run, "overcharge")) {
        flatBonus += Math.max(0, run.manaSpentThisHand || 0) * 2;

        if (run.usedManaSurge) {
            flatBonus += 4;
        }
    }

    if (runHasAbility(run, "executionerInstinct")) {
        winHands.forEach(hand => {
            if ((hand.score || 0) >= 19) {
                flatBonus += run.usedArcaneDrawThisHand ? 10 : 6;
            }
        });
    }

    if (runHasAbility(run, "splitTorrent") && settledHands.length > 1 && winHands.length > 0) {
        flatBonus += 8 * winHands.length;

        if (run.emberStrikeActive) {
            flatBonus += 4 * winHands.length;
        }
    }

    if (run.siphonStrikeActive) {
        flatBonus += 4 * winHands.length;
        heal += 6;
    }

    const baseDamage = winHands.reduce((sum, hand) => sum + (run.attackDamage * hand.multiplier), 0);
    const totalDamage = Math.max(1, Math.round(baseDamage * multiplier) + flatBonus);

    return { totalDamage, heal };
}

function clearAutoNextTimeout(room) {
    if (room.game.autoNextTimeout) {
        clearTimeout(room.game.autoNextTimeout);
        room.game.autoNextTimeout = null;
    }
}

function clearBlackjackTimeout(room) {
    if (room.game.blackjackTimeout) {
        clearTimeout(room.game.blackjackTimeout);
        room.game.blackjackTimeout = null;
    }
}

function clearTurnTimeout(room) {
    if (room.game.turnTimeout) {
        clearTimeout(room.game.turnTimeout);
        room.game.turnTimeout = null;
    }
}

// 27-second server-side auto-stand: gives the 25s client timer a 2s buffer.
function scheduleTurnTimeout(room) {
    clearTurnTimeout(room);
    const currentId = getCurrentPlayerId(room);
    if (!currentId) return;

    room.game.turnTimeout = setTimeout(() => {
        room.game.turnTimeout = null;
        if (room.game.phase !== "in-round") return;
        if (getCurrentPlayerId(room) !== currentId) return;

        const player = players[currentId];
        if (!player || !player.run.alive) return;

        player.run.standing = true;
        const turnComplete = continueSplitOrEndTurn(player, room);
        if (turnComplete) {
            nextTurn(room);
        } else {
            emitGameState(room);
        }
    }, 27000);
}

function triggerBlackjackResolution(room) {
    if (room.game.blackjackTimeout || room.game.phase === "blackjack-delay") {
        return;
    }

    clearAutoNextTimeout(room);
    clearTurnTimeout(room);
    room.game.phase = "blackjack-delay";
    setRoundBanner(room, "Blackjack!", "win", 2500);
    emitRoomState(room);
    emitGameState(room);

    room.game.blackjackTimeout = setTimeout(() => {
        room.game.blackjackTimeout = null;
        settleRound(room);
    }, 2500);
}

function setRoundBanner(room, text, type = "info", durationMs = 2000) {
    room.game.roundBanner = {
        text,
        type,
        until: Date.now() + durationMs
    };
}

function startRoundInternal(room, socket = null) {
    if (!room.game.runActive) {
        if (socket) {
            socket.emit("errorMessage", "Start the run first.");
        }
        return false;
    }

    if (room.game.phase === "in-round") {
        if (socket) {
            socket.emit("errorMessage", "Round already in progress.");
        }
        return false;
    }

    if (room.game.phase === "level-up" || room.game.phase === "blessing-choice" || room.game.phase === "shop-choice") {
        if (socket) {
            socket.emit("errorMessage", "Resolve pending upgrades first.");
        }
        return false;
    }

    if (anyPendingChoices(room)) {
        if (socket) {
            socket.emit("errorMessage", "Resolve all upgrade choices before next round.");
        }
        return false;
    }

    const activePlayers = room.playerIds
        .map(id => players[id])
        .filter(player => player && player.run.alive);

    if (activePlayers.length === 0) {
        updateRunOver(room, "No living players left.");
        emitRoomState(room);
        emitGameState(room, true);
        return false;
    }

    clearAutoNextTimeout(room);
    clearBlackjackTimeout(room);
    room.game.roundBanner = null;
    room.game.totalRoundsPlayed += 1;
    room.game.phase = "in-round";
    room.game.turnOrder = [];
    room.game.currentTurnIndex = 0;
    room.game.deck = createDeck();
    shuffleDeck(room.game.deck);

    const dealerStats = getDealerStatsForRound(room);
    const needsFreshDealer = !room.game.dealer
        || room.game.dealer.maxHealth <= 0
        || room.game.dealer.health <= 0
        || room.game.dealer.attackDamage <= 0;

    if (needsFreshDealer) {
        room.game.dealer = {
            hand: [],
            busted: false,
            health: dealerStats.maxHealth,
            maxHealth: dealerStats.maxHealth,
            attackDamage: dealerStats.attackDamage,
            isBoss: dealerStats.isBoss,
            archetypeId: dealerStats.archetypeId,
            name: dealerStats.name
        };
    }

    room.game.dealer.hand = [drawCard(room), drawCard(room)];
    room.game.dealer.busted = false;

    activePlayers.forEach(player => {
        player.run.hand = [drawCard(room), drawCard(room)];
        player.run.standing = false;
        player.run.busted = false;
        player.run.handMultiplier = 1;
        player.run.handActionCount = 0;
        player.run.resolvedHands = [];
        player.run.pendingSplitHands = [];
        player.run.splitActive = false;
        player.run.tempShield = 0;
        player.run.usedManaSurge = false;
        player.run.usedArcaneDrawThisHand = false;
        player.run.manaSpentThisHand = 0;
        player.run.emberStrikeActive = false;
        player.run.siphonStrikeActive = false;
        player.run.focusSigilActive = false;
        player.run.mana = Math.min(player.run.maxMana, player.run.mana + 2);
        applyRoundStartRelics(player);
        player.run.busted = getHandValue(player.run.hand) > 21;
        room.game.turnOrder.push(player.id);
    });

    const instantWinner = activePlayers.find(player => getHandValue(player.run.hand) === 21 && !player.run.busted);

    if (instantWinner) {
        if (isBlackjack(instantWinner.run.hand)) {
            triggerBlackjackResolution(room);
        }
        else {
            room.game.dealer.health = 0;
            setRoundBanner(room, `${instantWinner.name} hit 21! Instant Win!`, "win", 2000);
            settleRound(room);
        }
        return true;
    }

    scheduleTurnTimeout(room);
    emitRoomState(room);
    emitGameState(room);
    return true;
}

function maybeAutoStartNextRound(room) {
    if (!room.game.runActive) {
        return;
    }

    if (room.game.phase !== "round-over") {
        return;
    }

    if (anyPendingChoices(room)) {
        return;
    }

    const hostSocketId = room.hostId;

    if (!hostSocketId || !players[hostSocketId]) {
        return;
    }

    clearAutoNextTimeout(room);
    room.game.autoNextTimeout = setTimeout(() => {
        room.game.autoNextTimeout = null;
        startRoundInternal(room);
    }, 2000);
}

function updateRunOver(room, reason) {
    clearAutoNextTimeout(room);
    clearBlackjackTimeout(room);
    clearTurnTimeout(room);
    room.game.phase = "run-over";
    room.game.runActive = false;
    room.game.roundBanner = null;
    room.game.runResult = reason;

    room.playerIds.forEach(id => {
        const player = players[id];

        if (!player) {
            return;
        }

        const profile = getOrCreateProfile(player.name);
        profile.gamesPlayed += 1;
        profile.losses += 1;

        const account = getAccountForPlayer(player);
        if (account) {
            const rounds = Math.max(1, Number(room.game.totalRoundsPlayed) || 1);
            const multiplier = 1 + Math.min(1.5, Math.max(0, rounds - 3) * 0.08);
            grantAccountXp(account, Math.round(18 * multiplier));
        }

        clearSoloRunForPlayer(player.name);
        player.stats = {
            wins: profile.wins,
            losses: profile.losses,
            pushes: profile.pushes,
            gamesPlayed: profile.gamesPlayed
        };
    });

    saveProfiles();
    saveAccounts();
    io.emit("leaderboardUpdated", getSortedLeaderboard());
}

function resolvePostRoundState(room) {
    const alive = room.playerIds
        .map(id => players[id])
        .filter(player => player && player.run.alive);

    alive.forEach(player => ensureBlessingOptions(player.run));
    alive.forEach(player => ensureShopOptions(player.run));

    if (alive.length === 0) {
        updateRunOver(room, "All players were defeated.");
        return;
    }

    // Game ends only when all players are dead; losing hands no longer ends the run.

    if (alive.some(player => player.run.pendingShopChoices > 0)) {
        room.game.phase = "shop-choice";
        return;
    }

    if (alive.some(player => player.run.pendingBlessingChoices > 0)) {
        room.game.phase = "blessing-choice";
        return;
    }

    if (alive.some(player => player.run.pendingStatChoices > 0)) {
        room.game.phase = "level-up";

        alive.forEach(player => {
            if (player.run.pendingStatChoices > 0) {
                scheduleLevelChoiceTimeout(room, player, 30000);
            }
            else {
                clearLevelChoiceTimer(player);
            }
        });

        return;
    }

    alive.forEach(player => clearLevelChoiceTimer(player));

    room.game.phase = "round-over";
}

function settleRound(room) {
    clearBlackjackTimeout(room);
    clearTurnTimeout(room);

    const activePlayers = room.game.turnOrder
        .map(id => players[id])
        .filter(player => player && player.run.alive);

    while (getHandValue(room.game.dealer.hand) < 17) {
        room.game.dealer.hand.push(drawCard(room));
    }

    room.game.dealer.busted = getHandValue(room.game.dealer.hand) > 21;
    const dealerScore = getHandValue(room.game.dealer.hand);

    let wins = 0;
    let losses = 0;
    const results = [];
    let accountProgressUpdated = false;

    activePlayers.forEach(player => {
        const roundOutcome = resolvePlayerRoundOutcome(
            player,
            room.game.dealer.hand,
            room.game.dealer.attackDamage
        );
        const { handOutcomes, winHands, lossHands, blackjackHands } = roundOutcome;

        let result = "push";
        let score = handOutcomes.length > 0 ? Math.max(...handOutcomes.map(x => x.score)) : 0;

        if (winHands.length > 0) {
            result = blackjackHands.length > 0 ? "blackjack" : "win";
            wins += 1;
            room.game.dealer.health = Math.max(0, room.game.dealer.health - roundOutcome.dealerDamage);
            if (roundOutcome.heal > 0) {
                player.run.health = Math.min(player.run.maxHealth, player.run.health + roundOutcome.heal);
            }
            grantXp(player, 5);
        }
        else if (lossHands.length === handOutcomes.length) {
            result = "loss";
            losses += 1;
            player.run.health = Math.max(0, player.run.health - roundOutcome.playerDamage);
            player.run.alive = player.run.health > 0;
        }

        // Reset per-hand ability flags after settlement.
        player.run.usedAbilityThisHand = false;
        player.run.usedArcaneDrawThisHand = false;
        player.run.usedManaSurge = false;
        player.run.manaSpentThisHand = 0;
        player.run.emberStrikeActive = false;
        player.run.siphonStrikeActive = false;
        player.run.focusSigilActive = false;
        player.run.tempShield = 0;

        if (player.run.tranceStacks > 0) {
            player.run.tranceStacks -= 1;
        }

        const account = getAccountForPlayer(player);
        if (account) {
            const baseAccountXp = result === "win" || result === "blackjack"
                ? 10
                : (result === "push" ? 5 : 3);
            const runLengthMultiplier = 1 + Math.min(1.25, Math.max(0, room.game.totalRoundsPlayed - 1) * 0.06);
            grantAccountXp(account, Math.round(baseAccountXp * runLengthMultiplier));
            accountProgressUpdated = true;
        }

        results.push({
            name: player.name,
            result,
            score,
            handCount: handOutcomes.length,
            hp: player.run.health,
            attackDamage: player.run.attackDamage,
            mana: player.run.mana
        });
    });

    const roundDraw = wins === 0 && losses === 0;
    const dealerDefeated = room.game.dealer.health <= 0;
    const roundWon = dealerDefeated || (wins > losses && wins > 0);
    const blackjackWin = activePlayers.some(player => getSettledHands(player).some(handState => isBlackjack(handState.cards) && !isBlackjack(room.game.dealer.hand))) && roundWon;

    if (roundDraw) {
        setRoundBanner(room, "Draw — Redealing", "push", 2000);
    }
    else {
        setRoundBanner(room, blackjackWin ? "Blackjack!" : (roundWon ? "You Win!" : "You Lose"), roundWon ? "win" : "loss", blackjackWin ? 2500 : 2000);
    }

    if (!roundWon && !roundDraw) {
        room.game.roundsLost += 1;
    }

    if (roundWon && !roundDraw) {
        room.game.roundInChapter += 1;
    }

    if (dealerDefeated) {
        // Advance tier so the next dealer spawns stronger.
        const defeatedDealerTier = room.game.dealerTier || 1;
        const defeatedBoss = isBossTier(defeatedDealerTier);
        room.game.dealerTier = defeatedDealerTier + 1;

        activePlayers.forEach(player => {
            if (player.run.alive) {
                // Big upgrade whenever dealer HP is fully depleted.
                player.run.pendingBlessingChoices += 1;
                ensureBlessingOptions(player.run);

                if (defeatedBoss) {
                    player.run.pendingShopChoices += 1;
                    ensureShopOptions(player.run);
                }
            }
        });
    }

    if (roundWon && room.game.roundInChapter >= ROUNDS_PER_CHAPTER) {
        room.game.chapter += 1;
        room.game.roundInChapter = 0;

        room.playerIds.forEach(id => {
            const player = players[id];

            if (player && player.run.alive) {
                player.run.pendingBlessingChoices += 1;
                ensureBlessingOptions(player.run);
            }
        });

        room.playerIds.forEach(id => {
            const player = players[id];

            if (!player) {
                return;
            }

            const profile = getOrCreateProfile(player.name);
            profile.runsCompleted += 1;
            profile.highestChapter = Math.max(profile.highestChapter || 1, room.game.chapter);
            profile.wins += 1;
            profile.gamesPlayed += 1;
            player.stats = {
                wins: profile.wins,
                losses: profile.losses,
                pushes: profile.pushes,
                gamesPlayed: profile.gamesPlayed
            };
        });

        saveProfiles();
        io.emit("leaderboardUpdated", getSortedLeaderboard());
    }

    room.game.phase = "round-over";
    room.game.lastRoundSummary = {
        chapter: room.game.chapter,
        roundInChapter: room.game.roundInChapter,
        roundsLost: room.game.roundsLost,
        roundWon,
        roundDraw,
        dealerScore,
        dealerHealthAfter: room.game.dealer.health,
        results,
        resolvedAt: Date.now(),
        playerLost: false
    };

    if (room.playerIds.length === 1) {
        const soloPlayer = players[room.playerIds[0]];
        if (soloPlayer) {
            saveSoloRunForPlayer(soloPlayer, room);
        }
    }

    if (accountProgressUpdated) {
        saveAccounts();
    }

    resolvePostRoundState(room);
    emitRoomState(room);
    emitGameState(room, true);

    maybeAutoStartNextRound(room);
}

function nextTurn(room) {
    clearTurnTimeout(room);
    room.game.currentTurnIndex += 1;

    if (room.game.currentTurnIndex >= room.game.turnOrder.length) {
        settleRound(room);
        return;
    }

    scheduleTurnTimeout(room);
    emitGameState(room);
}

function resetRun(room) {
    clearAutoNextTimeout(room);
    clearBlackjackTimeout(room);
    clearTurnTimeout(room);
    room.game = createRunState();

    room.playerIds.forEach(id => {
        const player = players[id];

        if (player) {
            clearSoloRunForPlayer(player.name);
            resetPlayerRunState(player);
        }
    });
}

function startRun(room) {
    clearAutoNextTimeout(room);
    clearBlackjackTimeout(room);
    clearTurnTimeout(room);
    room.game.runActive = true;
    room.game.phase = "run-lobby";
    room.game.chapter = 1;
    room.game.roundInChapter = 0;
    room.game.roundsLost = 0;
    room.game.totalRoundsPlayed = 0;
    room.game.lastRoundSummary = null;
    room.game.runResult = null;
    room.game.roundBanner = null;

    room.playerIds.forEach(id => {
        const player = players[id];

        if (player) {
            clearSoloRunForPlayer(player.name);
            resetPlayerRunState(player);
        }
    });
}

function startRound(room, socket) {
    startRoundInternal(room, socket);
}

function requireAdminAccountFromToken(token) {
    const { session, account } = getAccountFromToken(token);

    if (!session || !account) {
        return { ok: false, status: 401, error: "Session expired." };
    }

    if (!account.isAdmin) {
        return { ok: false, status: 403, error: "Admin privileges required." };
    }

    return { ok: true, session, account };
}

function serializeAdminAccountRow(account) {
    const profile = profiles[account.displayName] || makeProfile(account.displayName);

    return {
        username: account.username,
        displayName: account.displayName,
        createdAt: account.createdAt || null,
        isAdmin: !!account.isAdmin,
        isDisabled: !!account.isDisabled,
        accountLevel: account.accountLevel || 1,
        accountTotalXp: account.accountTotalXp || 0,
        wins: profile.wins || 0,
        losses: profile.losses || 0,
        pushes: profile.pushes || 0,
        gamesPlayed: profile.gamesPlayed || 0,
        runsCompleted: profile.runsCompleted || 0,
        highestChapter: profile.highestChapter || 1
    };
}

app.post("/api/register", async (req, res) => {
    const { username, displayName, pin } = req.body || {};

    if (!username || !/^[A-Za-z0-9_-]{2,20}$/.test(String(username))) {
        return res.status(400).json({ error: "Username must be 2-20 characters (letters, numbers, _ or -)." });
    }

    const trimmedDisplay = String(displayName || "").trim();

    if (!trimmedDisplay || !/^[A-Za-z0-9 _-]{2,20}$/.test(trimmedDisplay)) {
        return res.status(400).json({ error: "Display name must be 2-20 characters (letters, numbers, spaces, _ or -)." });
    }

    if (!pin || !/^\d{4,12}$/.test(String(pin))) {
        return res.status(400).json({ error: "PIN must be 4-12 digits." });
    }

    const key = String(username).toLowerCase();

    if (isReservedAdminUsername(key)) {
        return res.status(403).json({ error: "That username is reserved." });
    }

    if (isReservedAdminDisplayName(trimmedDisplay)) {
        return res.status(403).json({ error: "That display name is reserved." });
    }

    if (accounts[key]) {
        return res.status(409).json({ error: "That username is already taken." });
    }

    try {
        const pinHash = await bcrypt.hash(String(pin), BCRYPT_ROUNDS);
        accounts[key] = {
            username: key,
            displayName: trimmedDisplay,
            pinHash,
            profilePicture: resolveProfilePicturePath(DEFAULT_PROFILE_PICTURE_ID),
            selectedProfilePictureId: DEFAULT_PROFILE_PICTURE_ID,
            unlockedProfilePictures: PROFILE_PICTURES.filter(pic => pic.unlockLevel <= 1).map(pic => pic.id),
            accountLevel: 1,
            accountXp: 0,
            accountXpToNext: calculateAccountXpToNext(1),
            accountTotalXp: 0,
            isAdmin: ADMIN_USERNAMES.has(key),
            isDisabled: false,
            createdAt: Date.now()
        };
        getOrCreateProfile(trimmedDisplay);
        saveAccounts();
        saveProfiles();
        io.emit("leaderboardUpdated", getSortedLeaderboard());
        return res.status(201).json({ ok: true });
    }
    catch (error) {
        console.error("Register error:", error);
        return res.status(500).json({ error: "Server error. Please try again." });
    }
});

app.post("/api/login", async (req, res) => {
    const ip = req.socket.remoteAddress || "unknown";

    if (isRateLimited(ip)) {
        return res.status(429).json({ error: "Too many failed attempts. Try again in 15 minutes." });
    }

    const { username, pin, rememberLogin } = req.body || {};

    if (!username || !pin) {
        return res.status(400).json({ error: "Username and PIN required." });
    }

    const key = String(username).toLowerCase();
    const account = accounts[key];

    if (!account) {
        recordLoginAttempt(ip);
        return res.status(401).json({ error: "Invalid username or PIN." });
    }

    try {
        ensureAccountDefaults(account);

        if (account.isDisabled) {
            recordLoginAttempt(ip);
            return res.status(403).json({ error: "This account has been disabled." });
        }

        const match = await bcrypt.compare(String(pin), account.pinHash);

        if (!match) {
            recordLoginAttempt(ip);
            return res.status(401).json({ error: "Invalid username or PIN." });
        }

        clearLoginAttempts(ip);

        const token = generateToken();
        setSessionRecord(token, {
            username: key,
            displayName: account.displayName,
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_TTL_MS
        });

        let rememberToken = "";

        if (rememberLogin) {
            rememberToken = issueRememberToken(account);
            saveAccounts();
        }

        const profile = profiles[account.displayName] || null;
        return res.json({ token, displayName: account.displayName, profile, rememberToken });
    }
    catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({ error: "Server error. Please try again." });
    }
});

app.post("/api/remember-login", (req, res) => {
    const { rememberToken } = req.body || {};

    if (!rememberToken || String(rememberToken).length < 20) {
        return res.status(400).json({ error: "Invalid remember token." });
    }

    const account = findAccountByRememberToken(rememberToken);

    if (!account) {
        return res.status(401).json({ error: "Remember login expired." });
    }

    ensureAccountDefaults(account);

    if (account.isDisabled) {
        return res.status(403).json({ error: "This account has been disabled." });
    }

    const token = generateToken();
    setSessionRecord(token, {
        username: account.username,
        displayName: account.displayName,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS
    });

    const rotatedRememberToken = issueRememberToken(account);
    saveAccounts();

    const profile = profiles[account.displayName] || null;
    return res.json({
        token,
        displayName: account.displayName,
        profile,
        rememberToken: rotatedRememberToken
    });
});

app.post("/api/session", (req, res) => {
    const { token } = req.body || {};
    const sessionToken = String(token || "");
    const session = getSession(sessionToken);

    if (!session) {
        return res.status(401).json({ valid: false });
    }

    const account = accounts[session.username] || null;
    if (account) {
        ensureAccountDefaults(account);

        if (account.isDisabled) {
            deleteSessionRecord(sessionToken);
            return res.status(401).json({ valid: false });
        }
    }

    return res.json({ valid: true, displayName: session.displayName, isAdmin: !!(account && account.isAdmin) });
});

app.post("/api/account", (req, res) => {
    const { token } = req.body || {};
    const { session, account } = getAccountFromToken(token);

    if (!session || !account) {
        return res.status(401).json({ error: "Session expired." });
    }

    return res.json({
        username: account.username,
        displayName: account.displayName,
        isAdmin: !!account.isAdmin,
        profilePicture: account.profilePicture || "",
        selectedProfilePictureId: account.selectedProfilePictureId,
        accountLevel: account.accountLevel,
        accountXp: account.accountXp,
        accountXpToNext: account.accountXpToNext,
        accountTotalXp: account.accountTotalXp,
        options: account.options,
        profilePictures: getPublicProfilePicturesForAccount(account)
    });
});

app.post("/api/options", (req, res) => {
    const { token } = req.body || {};
    const { session, account } = getAccountFromToken(token);

    if (!session || !account) {
        return res.status(401).json({ error: "Session expired." });
    }

    return res.json({
        ok: true,
        options: account.options || { theme: "light" }
    });
});

app.post("/api/options/update", (req, res) => {
    const { token, options } = req.body || {};
    const { session, account } = getAccountFromToken(token);

    if (!session || !account) {
        return res.status(401).json({ error: "Session expired." });
    }

    const candidate = options && typeof options === "object" ? options : {};

    if (candidate.theme !== undefined) {
        const theme = String(candidate.theme || "").trim().toLowerCase();

        if (theme !== "light" && theme !== "dark") {
            return res.status(400).json({ error: "Theme must be 'light' or 'dark'." });
        }

        account.options.theme = theme;
    }

    saveAccounts();

    return res.json({
        ok: true,
        options: account.options
    });
});

app.post("/api/account/update", async (req, res) => {
    const {
        token,
        displayName,
        profilePicture,
        selectedProfilePictureId,
        currentPin,
        newPin
    } = req.body || {};

    const { session, account } = getAccountFromToken(token);

    if (!session || !account) {
        return res.status(401).json({ error: "Session expired." });
    }

    const updates = {};

    if (displayName !== undefined) {
        const nextDisplay = String(displayName || "").trim();
        if (!nextDisplay || !/^[A-Za-z0-9 _-]{2,20}$/.test(nextDisplay)) {
            return res.status(400).json({ error: "Display name must be 2-20 characters (letters, numbers, spaces, _ or -)." });
        }

        if (isReservedAdminDisplayName(nextDisplay) && account.username !== BUILT_IN_ADMIN_USERNAME) {
            return res.status(403).json({ error: "That display name is reserved." });
        }

        if (nextDisplay !== account.displayName && profiles[nextDisplay]) {
            return res.status(409).json({ error: "Display name is already in use." });
        }

        updates.displayName = nextDisplay;
    }

    if (profilePicture !== undefined) {
        const nextPicture = String(profilePicture || "").trim();

        if (nextPicture.length > 250000) {
            return res.status(400).json({ error: "Profile picture is too large." });
        }

        updates.profilePicture = nextPicture;
    }

    if (selectedProfilePictureId !== undefined) {
        const nextPictureId = String(selectedProfilePictureId || "").trim();
        const pictureMeta = getProfilePictureById(nextPictureId);

        if (!pictureMeta) {
            return res.status(400).json({ error: "Unknown profile picture." });
        }

        refreshAccountPictureUnlocks(account);
        const unlocked = new Set(account.unlockedProfilePictures || []);

        if (!unlocked.has(nextPictureId)) {
            return res.status(403).json({ error: "That profile picture is locked." });
        }

        updates.selectedProfilePictureId = nextPictureId;
        updates.profilePicture = pictureMeta.path;
    }

    if (newPin !== undefined && String(newPin || "").length > 0) {
        if (!currentPin) {
            return res.status(400).json({ error: "Current PIN is required to change PIN." });
        }

        if (!/^\d{4,12}$/.test(String(newPin))) {
            return res.status(400).json({ error: "New PIN must be 4-12 digits." });
        }

        const match = await bcrypt.compare(String(currentPin), account.pinHash);
        if (!match) {
            return res.status(401).json({ error: "Current PIN is incorrect." });
        }

        updates.pinHash = await bcrypt.hash(String(newPin), BCRYPT_ROUNDS);
    }

    const oldDisplayName = account.displayName;

    if (updates.displayName) {
        account.displayName = updates.displayName;
        session.displayName = updates.displayName;

        sessions.forEach(sess => {
            if (sess.username === account.username) {
                sess.displayName = updates.displayName;
            }
        });

        updateConnectedPlayerName(account.username, updates.displayName);
        migrateDisplayName(oldDisplayName, updates.displayName);
    }

    if (updates.profilePicture !== undefined) {
        account.profilePicture = updates.profilePicture;
    }

    if (updates.selectedProfilePictureId !== undefined) {
        account.selectedProfilePictureId = updates.selectedProfilePictureId;
    }

    if (updates.pinHash) {
        account.pinHash = updates.pinHash;
    }

    saveAccounts();

    io.emit("leaderboardUpdated", getSortedLeaderboard());

    return res.json({
        ok: true,
        displayName: account.displayName,
        profilePicture: account.profilePicture || "",
        selectedProfilePictureId: account.selectedProfilePictureId,
        accountLevel: account.accountLevel,
        accountXp: account.accountXp,
        accountXpToNext: account.accountXpToNext,
        accountTotalXp: account.accountTotalXp,
        profilePictures: getPublicProfilePicturesForAccount(account)
    });
});

app.post("/api/admin/accounts", (req, res) => {
    const { token } = req.body || {};
    const admin = requireAdminAccountFromToken(token);

    if (!admin.ok) {
        return res.status(admin.status).json({ error: admin.error });
    }

    syncProfilesWithAccounts();

    const rows = Object.values(accounts)
        .map(account => {
            ensureAccountDefaults(account);
            return serializeAdminAccountRow(account);
        })
        .sort((a, b) => String(a.username).localeCompare(String(b.username)));

    return res.json({ accounts: rows });
});

app.post("/api/admin/account/set-role", (req, res) => {
    const { token, username, isAdmin } = req.body || {};
    const admin = requireAdminAccountFromToken(token);

    if (!admin.ok) {
        return res.status(admin.status).json({ error: admin.error });
    }

    const key = String(username || "").trim().toLowerCase();
    const target = accounts[key];

    if (!target) {
        return res.status(404).json({ error: "Account not found." });
    }

    if (target.username === BUILT_IN_ADMIN_USERNAME && !isAdmin) {
        return res.status(403).json({ error: "Built-in Admin role cannot be removed." });
    }

    target.isAdmin = !!isAdmin;
    saveAccounts();

    return res.json({ ok: true, account: serializeAdminAccountRow(target) });
});

app.post("/api/admin/account/set-disabled", (req, res) => {
    const { token, username, isDisabled } = req.body || {};
    const admin = requireAdminAccountFromToken(token);

    if (!admin.ok) {
        return res.status(admin.status).json({ error: admin.error });
    }

    const key = String(username || "").trim().toLowerCase();
    const target = accounts[key];

    if (!target) {
        return res.status(404).json({ error: "Account not found." });
    }

    if (target.username === BUILT_IN_ADMIN_USERNAME && !!isDisabled) {
        return res.status(403).json({ error: "Built-in Admin account cannot be disabled." });
    }

    target.isDisabled = !!isDisabled;

    if (target.isDisabled) {
        deleteSessionsForUsername(target.username);
    }

    saveAccounts();
    return res.json({ ok: true, account: serializeAdminAccountRow(target) });
});

app.post("/api/admin/account/delete", (req, res) => {
    const { token, username } = req.body || {};
    const admin = requireAdminAccountFromToken(token);

    if (!admin.ok) {
        return res.status(admin.status).json({ error: admin.error });
    }

    const key = String(username || "").trim().toLowerCase();
    const target = accounts[key];

    if (!target) {
        return res.status(404).json({ error: "Account not found." });
    }

    if (target.username === BUILT_IN_ADMIN_USERNAME) {
        return res.status(403).json({ error: "Built-in Admin account cannot be deleted." });
    }

    deleteSessionsForUsername(target.username);

    delete accounts[key];

    if (profiles[target.displayName]) {
        delete profiles[target.displayName];
        saveProfiles();
        io.emit("leaderboardUpdated", getSortedLeaderboard());
    }

    clearSoloRunForPlayer(target.displayName);
    saveAccounts();

    return res.json({ ok: true });
});

app.post("/api/solo-run-status", (req, res) => {
    const { token } = req.body || {};
    const session = getSession(String(token || ""));

    if (!session) {
        return res.status(401).json({ valid: false, hasSavedRun: false });
    }

    const saved = soloRuns[session.displayName];
    return res.json({
        valid: true,
        hasSavedRun: !!(saved && saved.game && saved.playerRun),
        updatedAt: saved ? saved.updatedAt : null
    });
});

app.post("/api/solo-run-reset", (req, res) => {
    const { token } = req.body || {};
    const session = getSession(String(token || ""));

    if (!session) {
        return res.status(401).json({ valid: false, ok: false });
    }

    clearSoloRunForPlayer(session.displayName);
    return res.json({ valid: true, ok: true });
});

app.post("/api/logout", (req, res) => {
    const { token } = req.body || {};

    if (token) {
        deleteSessionRecord(String(token));
    }

    return res.json({ ok: true });
});

app.get("/api/leaderboard", (req, res) => {
    res.json({ leaderboard: getSortedLeaderboard() });
});

app.get("/api/profile/:name", (req, res) => {
    const name = normalizeName(req.params.name);

    if (!name) {
        return res.status(400).json({ error: "Invalid name." });
    }

    const profile = profiles[name];

    if (!profile) {
        return res.status(404).json({ error: "Player not found." });
    }

    return res.json({ profile });
});

app.get("/api/status", (req, res) => {
    res.json({
        ok: true,
        playerCount: Object.keys(players).length,
        roomCount: rooms.size
    });
});

io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const session = getSession(token);

    if (!session) {
        return next(new Error(token ? "AUTH_EXPIRED" : "AUTH_REQUIRED"));
    }

    const account = accounts[session.username] || null;
    if (account) {
        ensureAccountDefaults(account);

        if (account.isDisabled) {
            deleteSessionRecord(String(token || ""));
            return next(new Error("AUTH_EXPIRED"));
        }
    }

    socket.data.username = session.username;
    socket.data.displayName = session.displayName;
    socket.data.token = token;
    next();
});

io.on("connection", socket => {
    socket.emit("leaderboardUpdated", getSortedLeaderboard());
    emitRoomList(socket);

    socket.on("joinGame", payload => {
        const requestRoomCode = payload && payload.roomCode ? String(payload.roomCode).toUpperCase() : "";
        const displayName = socket.data.displayName;
        const username = socket.data.username;

        const existingId = Object.keys(players).find(
            id => players[id].name.toLowerCase() === displayName.toLowerCase() && id !== socket.id
        );

        if (existingId) {
            const existing = players[existingId];
            const oldRoom = existing.roomCode ? rooms.get(existing.roomCode) : null;

            existing.id = socket.id;
            existing.username = username;
            players[socket.id] = existing;
            delete players[existingId];

            if (oldRoom) {
                oldRoom.playerIds = oldRoom.playerIds.map(id => (id === existingId ? socket.id : id));
                oldRoom.game.turnOrder = oldRoom.game.turnOrder.map(id => (id === existingId ? socket.id : id));

                if (oldRoom.hostId === existingId) {
                    oldRoom.hostId = socket.id;
                }

                socket.join(oldRoom.code);
                ensureRoomHost(oldRoom);
                emitRoomState(oldRoom);
                emitGameState(oldRoom);
            }

            socket.emit("joinAccepted", {
                name: displayName,
                profile: getOrCreateProfile(displayName),
                roomCode: existing.roomCode
            });

            emitRoomList();
            return;
        }

        const profile = getOrCreateProfile(displayName);

        players[socket.id] = {
            id: socket.id,
            username,
            roomCode: null,
            name: displayName,
            connectedAt: Date.now(),
            isHost: false,
            stats: {
                wins: profile.wins,
                losses: profile.losses,
                pushes: profile.pushes,
                gamesPlayed: profile.gamesPlayed
            },
            run: makePlayerRunState()
        };

        let room;

        if (requestRoomCode && rooms.has(requestRoomCode)) {
            const joinResult = joinRoom(socket, requestRoomCode);

            if (!joinResult.ok) {
                socket.emit("joinError", joinResult.error);
                return;
            }

            room = joinResult.room;
        }
        else {
            room = createRoom(socket.id);
            room.playerIds.push(socket.id);
            players[socket.id].roomCode = room.code;
            players[socket.id].isHost = true;
            socket.join(room.code);
            ensureRoomHost(room);
            emitRoomState(room);
            emitGameState(room);
            emitRoomList();
        }

        socket.emit("joinAccepted", {
            name: displayName,
            profile,
            roomCode: room.code
        });
    });

    socket.on("createRoom", () => {
        if (!requireJoined(socket)) {
            return;
        }

        leaveCurrentRoom(socket.id, socket);

        const room = createRoom(socket.id);
        room.playerIds.push(socket.id);

        const player = players[socket.id];
        player.roomCode = room.code;
        player.isHost = true;

        socket.join(room.code);
        ensureRoomHost(room);
        emitRoomState(room);
        emitGameState(room);
        emitRoomList();
    });

    socket.on("joinRoom", roomCode => {
        if (!requireJoined(socket)) {
            return;
        }

        const result = joinRoom(socket, roomCode);

        if (!result.ok) {
            socket.emit("errorMessage", result.error);
        }
    });

    socket.on("requestRooms", () => {
        emitRoomList(socket);
    });

    socket.on("startRun", () => {
        if (!requireJoined(socket)) {
            return;
        }

        const room = requireRoom(socket);

        if (!room || !requireHost(socket, room)) {
            return;
        }

        startRun(room);
        emitRoomState(room);
        emitGameState(room);
    });

    socket.on("startRound", () => {
        if (!requireJoined(socket)) {
            return;
        }

        const room = requireRoom(socket);

        if (!room || !requireHost(socket, room)) {
            return;
        }

        startRound(room, socket);
    });

    socket.on("resumeSoloRun", ack => {
        if (!requireJoined(socket)) {
            if (typeof ack === "function") {
                ack({ ok: false });
            }
            return;
        }

        const room = requireRoom(socket);

        if (!room || !requireHost(socket, room)) {
            if (typeof ack === "function") {
                ack({ ok: false });
            }
            return;
        }

        if (room.playerIds.length !== 1) {
            socket.emit("errorMessage", "Continue is only available for solo runs.");
            if (typeof ack === "function") {
                ack({ ok: false });
            }
            return;
        }

        const player = players[socket.id];

        if (!restoreSoloRunForPlayer(player, room)) {
            socket.emit("errorMessage", "No saved solo run found.");
            if (typeof ack === "function") {
                ack({ ok: false });
            }
            return;
        }

        emitRoomState(room);
        emitGameState(room, room.game.phase !== "in-round");

        if (typeof ack === "function") {
            ack({ ok: true });
        }
    });

    socket.on("saveAndExitSolo", ack => {
        if (requireJoined(socket)) {
            const room = getRoomBySocketId(socket.id);
            const player = players[socket.id];

            if (room && player && room.playerIds.length === 1 && room.game.runActive) {
                saveSoloRunForPlayer(player, room);
            }
        }

        if (typeof ack === "function") {
            ack({ ok: true });
        }
    });

    socket.on("hit", () => {
        if (!requireJoined(socket)) {
            return;
        }

        const room = requireRoom(socket);

        if (!room) {
            return;
        }

        if (room.game.phase !== "in-round") {
            socket.emit("errorMessage", "No active round.");
            return;
        }

        if (getCurrentPlayerId(room) !== socket.id) {
            socket.emit("errorMessage", "Not your turn.");
            return;
        }

        clearTurnTimeout(room);
        const player = players[socket.id];
        player.run.hand.push(drawCard(room));
        player.run.handActionCount += 1;

        if (getHandValue(player.run.hand) > 21) {
            player.run.busted = true;
            player.run.standing = true;
            const turnComplete = continueSplitOrEndTurn(player, room);

            if (turnComplete) {
                nextTurn(room);
            }
            else {
                // Moved to next split hand — restart timer.
                scheduleTurnTimeout(room);
                emitGameState(room);
            }
            return;
        }

        if (getHandValue(player.run.hand) === 21) {
            if (isBlackjack(player.run.hand)) {
                triggerBlackjackResolution(room);
            }
            else {
                room.game.dealer.health = 0;
                setRoundBanner(room, `${player.name} hit 21! Instant Win!`, "win", 2000);
                settleRound(room);
            }
            return;
        }

        // Still in turn — restart the countdown.
        scheduleTurnTimeout(room);
        emitGameState(room);
    });

    socket.on("stand", () => {
        if (!requireJoined(socket)) {
            return;
        }

        const room = requireRoom(socket);

        if (!room) {
            return;
        }

        if (room.game.phase !== "in-round") {
            socket.emit("errorMessage", "No active round.");
            return;
        }

        if (getCurrentPlayerId(room) !== socket.id) {
            socket.emit("errorMessage", "Not your turn.");
            return;
        }

        clearTurnTimeout(room);
        players[socket.id].run.standing = true;
        const player = players[socket.id];
        const turnComplete = continueSplitOrEndTurn(player, room);

        if (turnComplete) {
            nextTurn(room);
        }
        else {
            emitGameState(room);
        }
    });

    socket.on("double", () => {
        if (!requireJoined(socket)) {
            return;
        }

        const room = requireRoom(socket);

        if (!room) {
            return;
        }

        if (room.game.phase !== "in-round") {
            socket.emit("errorMessage", "No active round.");
            return;
        }

        if (getCurrentPlayerId(room) !== socket.id) {
            socket.emit("errorMessage", "Not your turn.");
            return;
        }

        clearTurnTimeout(room);
        const player = players[socket.id];
        const canDouble = player.run.hand.length === 2 && player.run.handActionCount === 0 && !player.run.standing && !player.run.busted;

        if (!canDouble) {
            socket.emit("errorMessage", "Double is only available as your first action on a fresh hand.");
            return;
        }

        player.run.handMultiplier = 2;
        player.run.hand.push(drawCard(room));
        player.run.handActionCount += 1;
        player.run.busted = getHandValue(player.run.hand) > 21;
        player.run.standing = true;

        if (!player.run.busted && getHandValue(player.run.hand) === 21) {
            if (isBlackjack(player.run.hand)) {
                triggerBlackjackResolution(room);
            }
            else {
                room.game.dealer.health = 0;
                setRoundBanner(room, `${player.name} hit 21! Instant Win!`, "win", 2000);
                settleRound(room);
            }
            return;
        }

        const turnComplete = continueSplitOrEndTurn(player, room);

        if (turnComplete) {
            nextTurn(room);
        }
        else {
            emitGameState(room);
        }
    });

    socket.on("split", () => {
        if (!requireJoined(socket)) {
            return;
        }

        const room = requireRoom(socket);

        if (!room) {
            return;
        }

        if (room.game.phase !== "in-round") {
            socket.emit("errorMessage", "No active round.");
            return;
        }

        if (getCurrentPlayerId(room) !== socket.id) {
            socket.emit("errorMessage", "Not your turn.");
            return;
        }

        clearTurnTimeout(room);
        const player = players[socket.id];
        const hand = player.run.hand;
        // Allow split regardless of handActionCount so abilities like Arcane Draw
        // (which increment handActionCount) don't block a resulting matching pair.
        const canSplit = hand.length === 2
            && player.run.pendingSplitHands.length === 0
            && !player.run.standing
            && !player.run.busted
            && getCardValue(hand[0]) === getCardValue(hand[1]);

        if (!canSplit) {
            socket.emit("errorMessage", "Split requires a fresh pair.");
            return;
        }

        const first = [hand[0], drawCard(room)];
        const second = [hand[1], drawCard(room)];

        player.run.hand = first;
        player.run.pendingSplitHands = [second];
        player.run.splitActive = true;
        player.run.standing = false;
        player.run.busted = false;
        player.run.handMultiplier = 1;
        player.run.handActionCount = 0;

        if (getHandValue(player.run.hand) === 21 || getHandValue(second) === 21) {
            if (isBlackjack(player.run.hand) || isBlackjack(second)) {
                triggerBlackjackResolution(room);
            }
            else {
                room.game.dealer.health = 0;
                setRoundBanner(room, `${player.name} split into 21! Instant Win!`, "win", 2000);
                settleRound(room);
            }
            return;
        }

        scheduleTurnTimeout(room);
        emitGameState(room);
    });

    socket.on("useAbility", abilityId => {
        if (!requireJoined(socket)) {
            return;
        }

        const room = requireRoom(socket);

        if (!room) {
            return;
        }

        if (room.game.phase !== "in-round") {
            socket.emit("errorMessage", "Abilities can only be used during a round.");
            return;
        }

        if (getCurrentPlayerId(room) !== socket.id) {
            socket.emit("errorMessage", "It is not your turn.");
            return;
        }

        clearTurnTimeout(room);
        const player = players[socket.id];
        const outcome = applyAbility(player, room, String(abilityId || ""));

        if (!outcome.ok) {
            socket.emit("errorMessage", outcome.error);
            return;
        }

        if (player.run.standing) {
            nextTurn(room);
            return;
        }

        if (getHandValue(player.run.hand) === 21) {
            if (isBlackjack(player.run.hand)) {
                triggerBlackjackResolution(room);
            }
            else {
                room.game.dealer.health = 0;
                setRoundBanner(room, `${player.name} hit 21! Instant Win!`, "win", 2000);
                settleRound(room);
            }
            return;
        }

        if (room.game.dealer.health <= 0) {
            settleRound(room);
            return;
        }

        // Ability used but turn still ongoing — restart the timer with remaining time.
        scheduleTurnTimeout(room);
        emitGameState(room);
    });

    socket.on("chooseLevelUp", stat => {
        if (!requireJoined(socket)) {
            return;
        }

        const room = requireRoom(socket);

        if (!room) {
            return;
        }

        const player = players[socket.id];

        if (player.run.pendingStatChoices <= 0) {
            socket.emit("errorMessage", "No level-up choice pending.");
            return;
        }

        const selected = String(stat || "").toLowerCase();

        const validChoices = ["health", "attack", "mana"];
        if (!validChoices.includes(selected)) {
            socket.emit("errorMessage", "Choose health, attack, or mana.");
            return;
        }

        applyLevelUpStat(player, selected);
        player.run.pendingStatChoices -= 1;
        clearLevelChoiceTimer(player);

        resolvePostRoundState(room);
        emitRoomState(room);
        emitGameState(room);
        maybeAutoStartNextRound(room);
    });

    socket.on("chooseBlessing", blessingId => {
        if (!requireJoined(socket)) {
            return;
        }

        const room = requireRoom(socket);

        if (!room) {
            return;
        }

        const player = players[socket.id];

        if (player.run.pendingBlessingChoices <= 0) {
            socket.emit("errorMessage", "No blessing choice pending.");
            return;
        }

        const selectedId = String(blessingId || "");
        const options = Array.isArray(player.run.pendingBlessingOptions)
            ? player.run.pendingBlessingOptions
            : [];
        const selected = options.find(option => option && option.id === selectedId);

        if (!selected || !ABILITIES[selectedId]) {
            socket.emit("errorMessage", "Unknown blessing.");
            return;
        }

        applyBlessingChoice(player.run, selectedId);
        player.run.pendingBlessingChoices -= 1;
        player.run.pendingBlessingOptions = [];
        ensureBlessingOptions(player.run);

        resolvePostRoundState(room);
        emitRoomState(room);
        emitGameState(room);
        maybeAutoStartNextRound(room);
    });

    socket.on("chooseShopItem", itemId => {
        if (!requireJoined(socket)) {
            return;
        }

        const room = requireRoom(socket);

        if (!room) {
            return;
        }

        const player = players[socket.id];

        if (player.run.pendingShopChoices <= 0) {
            socket.emit("errorMessage", "No shop choice pending.");
            return;
        }

        const selectedId = String(itemId || "");
        const options = Array.isArray(player.run.pendingShopOptions)
            ? player.run.pendingShopOptions
            : [];
        const selected = options.find(option => option && option.id === selectedId);

        if (!selected || !SHOP_ITEMS[selectedId]) {
            socket.emit("errorMessage", "Unknown shop item.");
            return;
        }

        const applied = applyShopChoice(player.run, selectedId);
        if (!applied) {
            socket.emit("errorMessage", "That item is no longer available for this run.");
            return;
        }

        player.run.pendingShopChoices -= 1;
        player.run.pendingShopOptions = [];
        ensureShopOptions(player.run);

        if (room.playerIds.length === 1) {
            saveSoloRunForPlayer(player, room);
        }

        emitRoomState(room);
        emitGameState(room);

        resolvePostRoundState(room);
        emitRoomState(room);
        emitGameState(room);
        maybeAutoStartNextRound(room);
    });

    socket.on("resetRun", () => {
        if (!requireJoined(socket)) {
            return;
        }

        const room = requireRoom(socket);

        if (!room || !requireHost(socket, room)) {
            return;
        }

        resetRun(room);
        emitRoomState(room);
        emitGameState(room);
    });

    socket.on("disconnect", () => {
        setTimeout(() => {
            if (!players[socket.id]) {
                return;
            }

            leaveCurrentRoom(socket.id);
            delete players[socket.id];
            emitRoomList();
        }, 1200);
    });
});

async function startServer(port = PORT) {
    if (DB_ENABLED) {
        await initializeDatabasePersistence();
    }
    else {
        persistenceState.initialized = true;
    }

    return server.listen(port, () => {
        const assigned = server.address() && server.address().port ? server.address().port : port;
        console.log(`Server running on port ${assigned}${DB_ENABLED ? " (db mode)" : ""}`);
    });
}

if (require.main === module) {
    startServer(PORT).catch(error => {
        console.error("Failed to start server:", error);
        process.exit(1);
    });
}

module.exports = {
    app,
    server,
    startServer,
    __testOnly: {
        makePlayerRunState,
        calculateXpToNext,
        calculateAccountXpToNext,
        grantXp,
        grantAccountXp,
        ensureAccountDefaults,
        applyLevelUpStat,
        resolvePlayerRoundOutcome,
        getCardValue,
        getHandValue,
        isBlackjack
    }
};
