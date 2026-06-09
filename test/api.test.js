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

    const updatedDisplay = `Ren${username}`.slice(0, 20);
    const update = await post("/api/account/update", {
        token,
        displayName: updatedDisplay,
        profilePicture: "https://example.com/avatar.png",
        currentPin: "5555",
        newPin: "6666"
    });
    assert.equal(update.response.status, 200);
    assert.equal(update.body.displayName, updatedDisplay);

    const loginWithNewPin = await post("/api/login", {
        username,
        pin: "6666",
        rememberLogin: false
    });
    assert.equal(loginWithNewPin.response.status, 200);
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
