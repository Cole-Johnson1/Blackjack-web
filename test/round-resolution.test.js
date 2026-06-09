const test = require("node:test");
const assert = require("node:assert/strict");
const { io: createSocketClient } = require("socket.io-client");

const { startServer, __testOnly } = require("../server");

const {
    makePlayerRunState,
    buildBlessingOptionsForRun,
    resolvePlayerRoundOutcome,
    settleRound,
    getRoomByCode,
    getPlayerById
} = __testOnly;

let listener;
let baseUrl;

function makeCard(value, suit = "S") {
    return { value, suit };
}

function uniqueUser(prefix) {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 18);
}

async function post(path, payload) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    let body = {};
    try {
        body = await response.json();
    }
    catch {
        body = {};
    }

    return { response, body };
}

function onceEvent(socket, eventName, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(eventName, onEvent);
            reject(new Error(`Timed out waiting for ${eventName}`));
        }, timeoutMs);

        const onEvent = payload => {
            clearTimeout(timer);
            socket.off(eventName, onEvent);
            resolve(payload);
        };

        socket.on(eventName, onEvent);
    });
}

function createGameStateTracker(socket) {
    let latest = null;

    const onGameState = state => {
        latest = state;
    };

    socket.on("gameState", onGameState);

    return {
        getLatest() {
            return latest;
        },
        waitForPhase(phase, timeoutMs = 7000) {
            if (latest && latest.phase === phase) {
                return Promise.resolve(latest);
            }

            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    socket.off("gameState", onPhase);
                    reject(new Error(`Timed out waiting for phase ${phase}`));
                }, timeoutMs);

                const onPhase = state => {
                    if (!state || state.phase !== phase) {
                        return;
                    }

                    clearTimeout(timer);
                    socket.off("gameState", onPhase);
                    resolve(state);
                };

                socket.on("gameState", onPhase);
            });
        },
        detach() {
            socket.off("gameState", onGameState);
        }
    };
}

async function createAuthedSocket(prefix) {
    const username = uniqueUser(prefix);
    const displayName = `P${username}`.slice(0, 20);

    const register = await post("/api/register", {
        username,
        displayName,
        pin: "1234"
    });
    assert.equal(register.response.status, 201);

    const login = await post("/api/login", {
        username,
        pin: "1234",
        rememberLogin: false
    });
    assert.equal(login.response.status, 200);
    assert.ok(login.body.token);

    const socket = createSocketClient(baseUrl, {
        auth: { token: login.body.token },
        transports: ["websocket"],
        forceNew: true,
        reconnection: false
    });

    await onceEvent(socket, "connect", 8000);

    const gameStateTracker = createGameStateTracker(socket);
    const joinAcceptedPromise = onceEvent(socket, "joinAccepted", 8000);
    socket.emit("joinGame", {});
    const joinAccepted = await joinAcceptedPromise;

    assert.ok(joinAccepted && joinAccepted.roomCode);

    return {
        socket,
        roomCode: joinAccepted.roomCode,
        gameStateTracker
    };
}

function forceWinningDealerDefeat(roomCode, socketId, dealerTier) {
    const room = getRoomByCode(roomCode);
    assert.ok(room, "Expected active room for phase test");

    const player = getPlayerById(socketId);
    assert.ok(player, "Expected player for phase test");

    room.game.runActive = true;
    room.game.phase = "in-round";
    room.game.dealerTier = dealerTier;
    room.game.turnOrder = [socketId];
    room.game.currentTurnIndex = 0;
    room.game.totalRoundsPlayed = Math.max(1, Number(room.game.totalRoundsPlayed) || 1);
    room.game.dealer = {
        hand: [makeCard("10"), makeCard("7")],
        busted: false,
        health: 1,
        maxHealth: 24,
        attackDamage: 0,
        isBoss: dealerTier % 5 === 0,
        archetypeId: "crusher",
        name: "Dealer"
    };

    player.run.alive = true;
    player.run.health = Math.max(1, Number(player.run.health) || 30);
    player.run.maxHealth = Math.max(player.run.health, Number(player.run.maxHealth) || 30);
    player.run.attackDamage = Math.max(5, Number(player.run.attackDamage) || 5);
    player.run.hand = [makeCard("10"), makeCard("9")];
    player.run.standing = true;
    player.run.busted = false;
    player.run.handMultiplier = 1;
    player.run.handActionCount = 0;
    player.run.resolvedHands = [];
    player.run.pendingSplitHands = [];
    player.run.splitActive = false;
    player.run.pendingBlessingChoices = 0;
    player.run.pendingBlessingOptions = [];
    player.run.pendingShopChoices = 0;
    player.run.pendingShopOptions = [];
    player.run.pendingStatChoices = 0;

    settleRound(room);
}

test.before(async () => {
    listener = await startServer(0);
    const address = listener.address();
    const port = typeof address === "object" && address ? address.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
    if (listener && listener.listening) {
        await new Promise(resolve => listener.close(resolve));
    }
});

test("split hands only damage the dealer for winning hands", () => {
    const player = { run: makePlayerRunState() };
    player.run.attackDamage = 5;
    player.run.handMultiplier = 1;
    player.run.resolvedHands = [
        {
            cards: [makeCard("10"), makeCard("7")],
            busted: false,
            multiplier: 1
        },
        {
            cards: [makeCard("9"), makeCard("5")],
            busted: false,
            multiplier: 1
        }
    ];

    const outcome = resolvePlayerRoundOutcome(player, [makeCard("9"), makeCard("7")], 6);

    assert.equal(outcome.winHands.length, 1);
    assert.equal(outcome.lossHands.length, 1);
    assert.equal(outcome.dealerDamage, 5);
    assert.equal(outcome.playerDamage, 0);
});

test("double down makes that hand deal double damage", () => {
    const player = { run: makePlayerRunState() };
    player.run.attackDamage = 5;
    player.run.handMultiplier = 2;
    player.run.resolvedHands = [
        {
            cards: [makeCard("10"), makeCard("9"), makeCard("2")],
            busted: false,
            multiplier: 2
        }
    ];

    const outcome = resolvePlayerRoundOutcome(player, [makeCard("8"), makeCard("7")], 6);

    assert.equal(outcome.winHands.length, 1);
    assert.equal(outcome.dealerDamage, 10);
    assert.equal(outcome.playerDamage, 0);
});

test("king kunta boosts king-hand damage and kevin hearts heals from heart cards", () => {
    const player = { run: makePlayerRunState() };
    player.run.attackDamage = 5;
    player.run.unlockedAbilities = ["kingKunta", "kevinHearts"];
    player.run.resolvedHands = [
        {
            cards: [makeCard("K", "H"), makeCard("9", "H")],
            busted: false,
            multiplier: 1
        }
    ];

    const outcome = resolvePlayerRoundOutcome(player, [makeCard("10"), makeCard("7")], 6);

    assert.equal(outcome.winHands.length, 1);
    assert.equal(outcome.dealerDamage, 15);
    assert.equal(outcome.heal, 8);
});

test("blessing options never include already unlocked abilities", () => {
    const run = makePlayerRunState();

    run.unlockedAbilities = ["emberStrike", "battleTrance"];
    const options = buildBlessingOptionsForRun(run);
    const optionIds = options.map(option => option.id);

    assert.ok(!optionIds.includes("emberStrike"));
    assert.ok(!optionIds.includes("battleTrance"));

    // After every ability is unlocked, no blessing options should be offered.
    const seenIds = new Set();
    let stalledRounds = 0;

    while (seenIds.size < 100 && stalledRounds < 1000) {
        const roll = buildBlessingOptionsForRun(run);
        if (roll.length === 0) {
            break;
        }

        roll.forEach(option => seenIds.add(option.id));
        run.unlockedAbilities = Array.from(new Set([...run.unlockedAbilities, ...roll.map(option => option.id)]));
        stalledRounds += 1;
    }

    const noOptions = buildBlessingOptionsForRun(run);
    assert.equal(noOptions.length, 0);
});

test("solo flow transitions dealer defeat to blessing choice then next round", async () => {
    const session = await createAuthedSocket("phasea");
    const { socket, roomCode, gameStateTracker } = session;

    try {
        socket.emit("startRun");
        await gameStateTracker.waitForPhase("run-lobby");

        socket.emit("startRound");
        await gameStateTracker.waitForPhase("in-round");

        forceWinningDealerDefeat(roomCode, socket.id, 1);

        const blessingState = await gameStateTracker.waitForPhase("blessing-choice");
        const blessingOptions = blessingState.players[socket.id].run.pendingBlessingOptions;
        assert.ok(Array.isArray(blessingOptions) && blessingOptions.length > 0);

        socket.emit("chooseBlessing", blessingOptions[0].id);
        await gameStateTracker.waitForPhase("round-over");

        socket.emit("startRound");
        await gameStateTracker.waitForPhase("in-round");
    }
    finally {
        gameStateTracker.detach();
        socket.disconnect();
    }
});

test("boss dealer defeat transitions shop choice then blessing choice then next round", async () => {
    const session = await createAuthedSocket("phaseb");
    const { socket, roomCode, gameStateTracker } = session;

    try {
        socket.emit("startRun");
        await gameStateTracker.waitForPhase("run-lobby");

        socket.emit("startRound");
        await gameStateTracker.waitForPhase("in-round");

        forceWinningDealerDefeat(roomCode, socket.id, 5);

        const shopState = await gameStateTracker.waitForPhase("shop-choice");
        const shopOptions = shopState.players[socket.id].run.pendingShopOptions;
        assert.ok(Array.isArray(shopOptions) && shopOptions.length > 0);

        socket.emit("chooseShopItem", shopOptions[0].id);

        const blessingState = await gameStateTracker.waitForPhase("blessing-choice");
        const blessingOptions = blessingState.players[socket.id].run.pendingBlessingOptions;
        assert.ok(Array.isArray(blessingOptions) && blessingOptions.length > 0);

        socket.emit("chooseBlessing", blessingOptions[0].id);
        await gameStateTracker.waitForPhase("round-over");

        socket.emit("startRound");
        await gameStateTracker.waitForPhase("in-round");
    }
    finally {
        gameStateTracker.detach();
        socket.disconnect();
    }
});