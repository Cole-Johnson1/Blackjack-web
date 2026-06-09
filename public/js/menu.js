if (!window.bjAuth) {
    window.location.href = "index.html";
}

const menuWelcomeText = document.getElementById("menuWelcomeText");
const menuMessage = document.getElementById("menuMessage");

const singlePlayerButton = document.getElementById("singlePlayerButton");
const resetRunButton = document.getElementById("resetRunButton");
const multiPlayerButton = document.getElementById("multiPlayerButton");
const accountButton = document.getElementById("accountButton");
const leaderboardButton = document.getElementById("leaderboardButton");
const adminPanelButton = document.getElementById("adminPanelButton");
const optionsButton = document.getElementById("optionsButton");
const logoutButton = document.getElementById("logoutButton");
const exitButton = document.getElementById("exitButton");
let hasSavedSoloRun = false;

function getNavigableButtons() {
    return Array.from(document.querySelectorAll(".menu-grid button"))
        .filter(button => !button.hidden && !button.disabled);
}

function setActiveMenuButton(button) {
    getNavigableButtons().forEach(item => item.classList.remove("menu-focused"));

    if (button) {
        button.classList.add("menu-focused");
    }
}

function setupMenuKeyboardNavigation() {
    const buttons = getNavigableButtons();

    if (!buttons.length) {
        return;
    }

    buttons.forEach(button => {
        button.addEventListener("focus", () => setActiveMenuButton(button));
        button.addEventListener("mouseenter", () => setActiveMenuButton(button));
    });

    document.addEventListener("keydown", event => {
        if (!["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
            return;
        }

        const navigable = getNavigableButtons();
        const activeElement = document.activeElement;
        const activeIndex = navigable.indexOf(activeElement);

        if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            navigable[activeIndex].click();
            return;
        }

        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const current = activeIndex >= 0 ? activeIndex : 0;
            const delta = event.key === "ArrowDown" ? 1 : -1;
            const nextIndex = (current + delta + navigable.length) % navigable.length;
            navigable[nextIndex].focus();
        }
    });

    buttons[0].focus();
    setActiveMenuButton(buttons[0]);
}

async function apiLogout() {
    const token = window.bjAuth.getToken();

    if (!token) {
        return;
    }

    await fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
    }).catch(() => {});
}

function showMessage(text, isError = false) {
    menuMessage.hidden = false;
    menuMessage.textContent = text;
    menuMessage.className = isError ? "message message-error" : "message";
}

async function refreshSinglePlayerEntry() {
    hasSavedSoloRun = false;

    const token = window.bjAuth.getToken();

    if (!token) {
        singlePlayerButton.textContent = "Single Player";
        return;
    }

    try {
        const response = await fetch("/api/solo-run-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
        });

        if (!response.ok) {
            singlePlayerButton.textContent = "Single Player";
            return;
        }

        const data = await response.json();
        hasSavedSoloRun = !!data.hasSavedRun;
        singlePlayerButton.textContent = hasSavedSoloRun ? "Continue" : "Single Player";
    }
    catch {
        singlePlayerButton.textContent = "Single Player";
    }
}

async function refreshAdminEntry() {
    adminPanelButton.hidden = true;

    const token = window.bjAuth.getToken();
    if (!token) {
        return;
    }

    try {
        const response = await fetch("/api/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json();
        adminPanelButton.hidden = !data.isAdmin;
    }
    catch {
        adminPanelButton.hidden = true;
    }
}

async function logoutAndReturn() {
    await apiLogout();
    window.bjAuth.clearAuth();
    window.location.href = "index.html";
}

function tryExitApp() {
    // In Electron, window.close works as expected. Browsers may block scripted closing.
    window.close();

    setTimeout(() => {
        if (!document.hidden) {
            showMessage("Exit is only available in desktop mode. Close this browser tab/window.", true);
        }
    }, 150);
}

window.bjAuth.ensureSession().then(async isValid => {
    if (!isValid) {
        window.bjAuth.clearAuth();
        window.location.href = "index.html";
        return;
    }

    menuWelcomeText.textContent = `Welcome, ${window.bjAuth.getDisplayName() || "Player"}.`;
    await refreshSinglePlayerEntry();
    await refreshAdminEntry();
    setupMenuKeyboardNavigation();
});

singlePlayerButton.addEventListener("click", () => {
    window.location.href = hasSavedSoloRun
        ? "game.html?single=1&continue=1"
        : "game.html?single=1";
});

resetRunButton.addEventListener("click", async () => {
    const token = window.bjAuth.getToken();

    if (!token) {
        showMessage("Session expired. Please log in again.", true);
        return;
    }

    resetRunButton.disabled = true;

    try {
        const response = await fetch("/api/solo-run-reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
        });

        if (!response.ok) {
            showMessage("Could not reset run right now.", true);
            return;
        }

        hasSavedSoloRun = false;
        singlePlayerButton.textContent = "Single Player";
        showMessage("Run reset. Start a fresh single-player run.");
    }
    catch {
        showMessage("Network error while resetting run.", true);
    }
    finally {
        resetRunButton.disabled = false;
    }
});

multiPlayerButton.addEventListener("click", () => {
    window.location.href = "lobby.html";
});

accountButton.addEventListener("click", () => {
    window.location.href = "account.html";
});

leaderboardButton.addEventListener("click", () => {
    window.location.href = "leaderboard.html";
});

adminPanelButton.addEventListener("click", () => {
    window.location.href = "admin.html";
});

optionsButton.addEventListener("click", () => {
    window.location.href = "options.html";
});

logoutButton.addEventListener("click", logoutAndReturn);
exitButton.addEventListener("click", tryExitApp);
