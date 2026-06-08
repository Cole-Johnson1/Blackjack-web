if (!window.bjAuth || (!window.bjAuth.getToken() && !window.bjAuth.getRememberToken())) {
    window.location.href = "index.html";
}

const waitingRoomSection = document.getElementById("waitingRoomSection");
const playerStatsWaiting = document.getElementById("playerStatsWaiting");
const waitingPlayersList = document.getElementById("waitingPlayersList");
const waitingReadyButton = document.getElementById("waitingReadyButton");

const playerList = document.getElementById("playerList");
const playerCount = document.getElementById("playerCount");
const lobbyMessage = document.getElementById("lobbyMessage");
const roomsList = document.getElementById("roomsList");
const roomCodeText = document.getElementById("roomCodeText");
const inviteLinkInput = document.getElementById("inviteLinkInput");
const joinRoomInput = document.getElementById("joinRoomInput");
const toggleRoomsButton = document.getElementById("toggleRoomsButton");

const copyInviteButton = document.getElementById("copyInviteButton");
const createRoomButton = document.getElementById("createRoomButton");
const joinRoomButton = document.getElementById("joinRoomButton");
const startRunButton = document.getElementById("startRunButton");

let joined = false;
let roomsOpen = false;
let inWaitingRoom = false;

function showLobbyMessage(text, isError = false) {
    lobbyMessage.hidden = false;
    lobbyMessage.textContent = text;
    lobbyMessage.className = isError ? "message message-error" : "message";
}

function formatInvite(path) {
    if (!path) {
        return "";
    }

    return `${window.location.origin}${path}`;
}

function showWaitingRoom(state) {
    inWaitingRoom = true;
    waitingRoomSection.classList.add("active");
    
    const self = state.players[window.socket.id];
    if (!self) return;

    // Show player's own stats
    const run = self.run || {};
    playerStatsWaiting.innerHTML = `
        <div class="stat-card">
            <h4>Level</h4>
            <div class="stat-value">${run.level || 1}</div>
        </div>
        <div class="stat-card">
            <h4>HP</h4>
            <div class="stat-value">${run.health || 0}/${run.maxHealth || 0}</div>
        </div>
        <div class="stat-card">
            <h4>Attack</h4>
            <div class="stat-value">${run.attackDamage || 0}</div>
        </div>
        <div class="stat-card">
            <h4>Mana</h4>
            <div class="stat-value">${run.mana || 0}/${run.maxMana || 0}</div>
        </div>
    `;

    // Show all players waiting
    const players = Object.values(state.players || {});
    waitingPlayersList.innerHTML = "";
    players.forEach(player => {
        const pRun = player.run || {};
        const item = document.createElement("div");
        item.className = "waiting-player-item";
        item.innerHTML = `
            <span class="waiting-player-name">${player.name}</span>
            <span class="waiting-player-badge">Lv ${pRun.level || 1}</span>
        `;
        waitingPlayersList.appendChild(item);
    });

    // Update timer text based on phase
    const waitingTitle = document.getElementById("waitingTitle");
    if (state.chapter === 1 && state.roundInChapter === 0) {
        waitingTitle.textContent = "Ready for Battle!";
    } else {
        waitingTitle.textContent = `Chapter ${state.chapter} • Prepare Next Round`;
    }
}

function hideWaitingRoom() {
    inWaitingRoom = false;
    waitingRoomSection.classList.remove("active");
}

function renderRoomState(state) {
    const players = Object.values(state.players || {});
    const self = state.players[window.socket.id];

    // Show waiting room if run is active and phase is not in-round
    if (state.runActive && (state.phase === "level-up" || state.phase === "blessing-choice" || state.phase === "waiting")) {
        showWaitingRoom(state);
    } else if (state.runActive && state.phase === "in-round") {
        hideWaitingRoom();
    } else {
        hideWaitingRoom();
    }

    // Update main lobby display
    roomCodeText.textContent = state.roomCode || "-";
    inviteLinkInput.value = formatInvite(state.invitePath);

    playerList.innerHTML = "";
    playerCount.textContent = String(state.playerCount || players.length);

    players.forEach(player => {
        const li = document.createElement("li");
        li.className = "list-item";
        const run = player.run || {};
        li.innerHTML = `
            <span>${player.name} ${player.isHost ? "<strong>(Host)</strong>" : ""}</span>
            <span>Lv ${run.level || 1} | HP ${run.health || 0}/${run.maxHealth || 0} | AD ${run.attackDamage || 0} | MP ${run.mana || 0}/${run.maxMana || 0}</span>
        `;
        playerList.appendChild(li);
    });

    startRunButton.disabled = !self || !self.isHost;

    if (state.runActive) {
        showLobbyMessage(`Run active (${state.phase}). Go to game table.`);
    }
}

function renderRooms(rooms) {
    roomsList.innerHTML = "";

    if (!rooms || rooms.length === 0) {
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML = "<span>No open rooms yet.</span>";
        roomsList.appendChild(li);
        return;
    }

    rooms.forEach(room => {
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML = `
            <span>${room.code} • Host ${room.hostName}</span>
            <span>${room.playerCount}/4 • ${room.runActive ? "In Run" : "Idle"}</span>
        `;

        li.addEventListener("click", () => {
            window.socket.emit("joinRoom", room.code);
        });

        roomsList.appendChild(li);
    });
}

function updateRoomsVisibility() {
    roomsList.hidden = !roomsOpen;
    toggleRoomsButton.textContent = roomsOpen ? "Hide Rooms" : "Open Rooms";
}

function emitJoin() {
    if (joined) {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get("room") || "";
    window.socket.emit("joinGame", { roomCode });
    window.socket.emit("requestRooms");
    joined = true;
}

window.socket.on("connect", emitJoin);
emitJoin();

window.socket.on("joinAccepted", payload => {
    if (payload.roomCode) {
        roomCodeText.textContent = payload.roomCode;
    }
});

window.socket.on("joinError", message => {
    showLobbyMessage(message, true);
    joined = false;
});

window.socket.on("roomState", renderRoomState);
window.socket.on("roomsList", renderRooms);
window.socket.on("errorMessage", message => showLobbyMessage(message, true));

createRoomButton.addEventListener("click", () => {
    window.socket.emit("createRoom");
});

joinRoomButton.addEventListener("click", () => {
    const code = joinRoomInput.value.trim().toUpperCase();

    if (!code) {
        showLobbyMessage("Enter a room code.", true);
        return;
    }

    window.socket.emit("joinRoom", code);
});

copyInviteButton.addEventListener("click", async () => {
    const value = inviteLinkInput.value;

    if (!value) {
        showLobbyMessage("No invite link available yet.", true);
        return;
    }

    try {
        await navigator.clipboard.writeText(value);
        showLobbyMessage("Invite link copied.");
    }
    catch {
        showLobbyMessage("Unable to copy link on this browser.", true);
    }
});

startRunButton.addEventListener("click", () => {
    window.socket.emit("startRun");
    window.location.href = "game.html";
});

toggleRoomsButton.addEventListener("click", () => {
    roomsOpen = !roomsOpen;
    updateRoomsVisibility();
    if (roomsOpen) {
        window.socket.emit("requestRooms");
    }
});

waitingReadyButton.addEventListener("click", () => {
    // Auto-advance to game table when in waiting room
    window.location.href = "game.html";
});

updateRoomsVisibility();

// Keyboard navigation for lobby menu
document.addEventListener("keydown", event => {
    if (inWaitingRoom && event.key === "Enter") {
        waitingReadyButton.click();
        return;
    }

    const buttons = Array.from(document.querySelectorAll("button:not(:disabled), a.button-link"));
    const currentIndex = buttons.indexOf(document.activeElement);

    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        const prevIndex = (currentIndex - 1 + buttons.length) % buttons.length;
        if (buttons[prevIndex]) buttons[prevIndex].focus();
    }
    else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        const nextIndex = (currentIndex + 1) % buttons.length;
        if (buttons[nextIndex]) buttons[nextIndex].focus();
    }
    else if (event.key === "Enter" && (event.target.tagName === "BUTTON" || event.target.tagName === "A")) {
        event.target.click();
    }
});

document.getElementById("logoutButton").addEventListener("click", () => {
    window.bj.logout();
});
