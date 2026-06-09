const express = require("express");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "leaderboard.json");
const ACCOUNTS_FILE = path.join(__dirname, "data", "accounts.json");
const SOLO_RUNS_FILE = path.join(__dirname, "data", "solo-runs.json");

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const RUN_LOSS_LIMIT = 3;
const ROUNDS_PER_CHAPTER = 5;
const MAX_PLAYERS_PER_ROOM = 4;

const BASE_PLAYER = {
    health: 30,
    attackDamage: 5,
    maxMana: 6
};

const BLESSING_OPTION_COUNT = 3;

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

function loadProfiles() {
    try {
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
        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(profiles, null, 2), "utf8");
    }
    catch (error) {
        console.error("Failed to save leaderboard data:", error);
    }
}

function loadAccounts() {
    try {
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
        fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf8");
    }
    catch (error) {
        console.error("Failed to save accounts data:", error);
    }
}

function ensureAccountDefaults(account) {
    if (!account) {
        return;
    }

    if (!Array.isArray(account.rememberTokens)) {
        account.rememberTokens = [];
    }

    if (typeof account.profilePicture !== "string") {
        account.profilePicture = "";
    }
}

function loadSoloRuns() {
    try {
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
        fs.mkdirSync(path.dirname(SOLO_RUNS_FILE), { recursive: true });
        fs.writeFileSync(SOLO_RUNS_FILE, JSON.stringify(soloRuns, null, 2), "utf8");
    }
    catch (error) {
        console.error("Failed to save solo run data:", error);
    }
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

function getSession(token) {
    if (!token) {
        return null;
    }

    const session = sessions.get(token);

    if (!session) {
        return null;
    }

    if (session.expiresAt < Date.now()) {
        sessions.delete(token);
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

Object.values(accounts).forEach(ensureAccountDefaults);

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

function getSortedLeaderboard(limit = 20) {
    return Object.values(profiles)
        .sort((a, b) => {
            if (b.runsCompleted !== a.runsCompleted) {
                return b.runsCompleted - a.runsCompleted;
            }

            if (b.highestChapter !== a.highestChapter) {
                return b.highestChapter - a.highestChapter;
            }

            return a.name.localeCompare(b.name);
        })
        .slice(0, limit)
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
            attackDamage: 0
        },
        roundBanner: null,
        autoNextTimeout: null,
        blackjackTimeout: null,
        turnTimeout: null,
        turnOrder: [],
        currentTurnIndex: 0,
        lastRoundSummary: null,
        runResult: null
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
        }
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
            attackDamage: room.game.dealer.attackDamage
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
        return player && (player.run.pendingStatChoices > 0 || player.run.pendingBlessingChoices > 0);
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

    // Base stats scale with chapter/round/tier (same as solo).
    // Extra players make the dealer significantly stronger: each additional
    // player beyond the first adds 20 HP and 4 ATK so the fight stays challenging.
    const extraPlayers = Math.max(0, aliveCount - 1);
    return {
        maxHealth: 16 + (chapter * 5) + (roundScale * 2) + extraPlayers * 20 + (tier - 1) * 25,
        attackDamage: 4 + chapter + Math.floor(extraPlayers * 4) + (tier - 1) * 4
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

    if (room.game.phase === "level-up" || room.game.phase === "blessing-choice") {
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
            attackDamage: dealerStats.attackDamage
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
        clearSoloRunForPlayer(player.name);
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

function resolvePostRoundState(room) {
    const alive = room.playerIds
        .map(id => players[id])
        .filter(player => player && player.run.alive);

    alive.forEach(player => ensureBlessingOptions(player.run));

    if (alive.length === 0) {
        updateRunOver(room, "All players were defeated.");
        return;
    }

    // Game ends only when all players are dead; losing hands no longer ends the run.

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
        room.game.dealerTier = (room.game.dealerTier || 1) + 1;

        activePlayers.forEach(player => {
            if (player.run.alive) {
                // Big upgrade whenever dealer HP is fully depleted.
                player.run.pendingBlessingChoices += 1;
                ensureBlessingOptions(player.run);
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

    if (accounts[key]) {
        return res.status(409).json({ error: "That username is already taken." });
    }

    try {
        const pinHash = await bcrypt.hash(String(pin), BCRYPT_ROUNDS);
        accounts[key] = {
            username: key,
            displayName: trimmedDisplay,
            pinHash,
            profilePicture: "",
            createdAt: Date.now()
        };
        saveAccounts();
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
        const match = await bcrypt.compare(String(pin), account.pinHash);

        if (!match) {
            recordLoginAttempt(ip);
            return res.status(401).json({ error: "Invalid username or PIN." });
        }

        clearLoginAttempts(ip);

        const token = generateToken();
        sessions.set(token, {
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

    const token = generateToken();
    sessions.set(token, {
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
    const session = getSession(String(token || ""));

    if (!session) {
        return res.status(401).json({ valid: false });
    }

    return res.json({ valid: true, displayName: session.displayName });
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
        profilePicture: account.profilePicture || ""
    });
});

app.post("/api/account/update", async (req, res) => {
    const {
        token,
        displayName,
        profilePicture,
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

    if (updates.pinHash) {
        account.pinHash = updates.pinHash;
    }

    saveAccounts();

    io.emit("leaderboardUpdated", getSortedLeaderboard());

    return res.json({
        ok: true,
        displayName: account.displayName,
        profilePicture: account.profilePicture || ""
    });
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
        sessions.delete(String(token));
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

        const existingId = Object.keys(players).find(
            id => players[id].name.toLowerCase() === displayName.toLowerCase() && id !== socket.id
        );

        if (existingId) {
            const existing = players[existingId];
            const oldRoom = existing.roomCode ? rooms.get(existing.roomCode) : null;

            existing.id = socket.id;
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

function startServer(port = PORT) {
    return server.listen(port, () => {
        const assigned = server.address() && server.address().port ? server.address().port : port;
        console.log(`Server running on port ${assigned}`);
    });
}

if (require.main === module) {
    startServer(PORT);
}

module.exports = {
    app,
    server,
    startServer,
    __testOnly: {
        makePlayerRunState,
        calculateXpToNext,
        grantXp,
        applyLevelUpStat,
        resolvePlayerRoundOutcome,
        getCardValue,
        getHandValue,
        isBlackjack
    }
};
