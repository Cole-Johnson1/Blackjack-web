const test = require("node:test");
const assert = require("node:assert/strict");

const { startServer } = require("../server");

let listener;
let baseUrl;

function uniqueUser(prefix) {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 18);
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

async function get(path) {
    const response = await fetch(`${baseUrl}${path}`);

    let body = {};
    try {
        body = await response.json();
    }
    catch {
        body = {};
    }

    return { response, body };
}

test.before(async () => {
    listener = startServer(0);
    const address = listener.address();
    const port = typeof address === "object" && address ? address.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
    await new Promise(resolve => listener.close(resolve));
});

test("register/login/session flow works", async () => {
    const username = uniqueUser("u");
    const displayName = `Disp${username}`.slice(0, 20);

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

    const session = await post("/api/session", {
        token: login.body.token
    });
    assert.equal(session.response.status, 200);
    assert.equal(session.body.valid, true);
    assert.equal(session.body.displayName, displayName);
});

test("built-in Admin account can login with hardcoded credentials", async () => {
    const login = await post("/api/login", {
        username: "Admin",
        pin: "0000",
        rememberLogin: false
    });

    assert.equal(login.response.status, 200);
    assert.equal(String(login.body.displayName || ""), "Admin");
    assert.ok(login.body.token);
});

test("account endpoints allow display name and pin updates", async () => {
    const username = uniqueUser("acct");
    const displayName = `D${username}`.slice(0, 20);

    const register = await post("/api/register", {
        username,
        displayName,
        pin: "5555"
    });
    assert.equal(register.response.status, 201);

    const login = await post("/api/login", {
        username,
        pin: "5555",
        rememberLogin: false
    });
    assert.equal(login.response.status, 200);
    const token = login.body.token;

    const accountBefore = await post("/api/account", { token });
    assert.equal(accountBefore.response.status, 200);
    assert.equal(accountBefore.body.displayName, displayName);
    assert.equal(accountBefore.body.accountLevel, 1);
    assert.ok(Array.isArray(accountBefore.body.profilePictures));

    const updatedDisplay = `Ren${username}`.slice(0, 20);
    const update = await post("/api/account/update", {
        token,
        displayName: updatedDisplay,
        selectedProfilePictureId: "rookie_2",
        currentPin: "5555",
        newPin: "6666"
    });
    assert.equal(update.response.status, 200);
    assert.equal(update.body.displayName, updatedDisplay);
    assert.equal(update.body.selectedProfilePictureId, "rookie_2");

    const loginWithNewPin = await post("/api/login", {
        username,
        pin: "6666",
        rememberLogin: false
    });
    assert.equal(loginWithNewPin.response.status, 200);
});

test("locked profile picture cannot be selected", async () => {
    const username = uniqueUser("lock");
    const displayName = `P${username}`.slice(0, 20);

    const register = await post("/api/register", {
        username,
        displayName,
        pin: "4444"
    });
    assert.equal(register.response.status, 201);

    const login = await post("/api/login", {
        username,
        pin: "4444",
        rememberLogin: false
    });
    assert.equal(login.response.status, 200);

    const update = await post("/api/account/update", {
        token: login.body.token,
        selectedProfilePictureId: "veteran_5"
    });

    assert.equal(update.response.status, 403);
});

test("invalid registration payloads are rejected", async () => {
    const bad = await post("/api/register", {
        username: "x",
        displayName: "ok",
        pin: "12"
    });

    assert.equal(bad.response.status, 400);
    assert.ok(String(bad.body.error || "").length > 0);
});

test("reserved Admin username and display name cannot be registered", async () => {
    const reservedUsername = await post("/api/register", {
        username: "Admin",
        displayName: uniqueUser("disp"),
        pin: "1234"
    });
    assert.equal(reservedUsername.response.status, 403);

    const reservedDisplay = await post("/api/register", {
        username: uniqueUser("usr"),
        displayName: "Admin",
        pin: "1234"
    });
    assert.equal(reservedDisplay.response.status, 403);
});

test("newly registered account appears on leaderboard", async () => {
    const username = uniqueUser("board");
    const displayName = `LB${username}`.slice(0, 20);

    const register = await post("/api/register", {
        username,
        displayName,
        pin: "7777"
    });
    assert.equal(register.response.status, 201);

    const leaderboard = await get("/api/leaderboard");
    assert.equal(leaderboard.response.status, 200);

    const names = (leaderboard.body.leaderboard || []).map(row => row.name);
    assert.ok(names.includes(displayName));
});

test("options endpoints persist theme preferences", async () => {
    const username = uniqueUser("opt");
    const displayName = `Opt${username}`.slice(0, 20);

    const register = await post("/api/register", {
        username,
        displayName,
        pin: "8899"
    });
    assert.equal(register.response.status, 201);

    const login = await post("/api/login", {
        username,
        pin: "8899",
        rememberLogin: false
    });
    assert.equal(login.response.status, 200);

    const update = await post("/api/options/update", {
        token: login.body.token,
        options: { theme: "dark" }
    });
    assert.equal(update.response.status, 200);
    assert.equal(update.body.options.theme, "dark");

    const read = await post("/api/options", {
        token: login.body.token
    });
    assert.equal(read.response.status, 200);
    assert.equal(read.body.options.theme, "dark");
});
