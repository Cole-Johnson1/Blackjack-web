if (!window.bjAuth || (!window.bjAuth.getToken() && !window.bjAuth.getRememberToken())) {
    window.location.href = "index.html";
}

const tableStatus = document.getElementById("tableStatus");
const gameMessage = document.getElementById("gameMessage");
const roundBanner = document.getElementById("roundBanner");
const roomCodeRow = document.getElementById("roomCodeRow");
const roomCodeText = document.getElementById("roomCodeText");

const dealerCards = document.getElementById("dealerCards");
const dealerValue = document.getElementById("dealerValue");
const dealerCombatStats = document.getElementById("dealerCombatStats");
const modeLabel = document.getElementById("modeLabel");
const playersDiv = document.getElementById("players");
const roundSummary = document.getElementById("roundSummary");

const battleP1 = document.getElementById("battleP1");
const battleP2 = document.getElementById("battleP2");
const roundCounter = document.getElementById("roundCounter");
const matchOverSection = document.getElementById("matchOverSection");
const matchWinnerText = document.getElementById("matchWinnerText");

const abilityControls = document.getElementById("abilityControls");
const abilityUsedNote = document.getElementById("abilityUsedNote");

const hitButton = document.getElementById("hitButton");
const standButton = document.getElementById("standButton");
const doubleButton = document.getElementById("doubleButton");
const splitButton = document.getElementById("splitButton");
const backToMenuButton = document.getElementById("backToMenuButton");
const rematchButton = document.getElementById("rematchButton");

if (splitButton && splitButton.isConnected) {
    splitButton.remove();
}

// Small upgrade modal elements
const upgradeModalOverlay = document.getElementById("upgradeModalOverlay");
const upgradeTimer = document.getElementById("upgradeTimer");
const upgradeResultBanner = document.getElementById("upgradeResultBanner");
const modalUpgradeHealthButton = document.getElementById("modalUpgradeHealthButton");
const modalUpgradeAttackButton = document.getElementById("modalUpgradeAttackButton");
const modalUpgradeManaButton = document.getElementById("modalUpgradeManaButton");

// Big upgrade (blessing) modal elements
const blessingModalOverlay = document.getElementById("blessingModalOverlay");
const blessingTimer = document.getElementById("blessingTimer");
const blessingOptions = document.getElementById("blessingOptions");
const blessingModalTitle = document.getElementById("blessingModalTitle");
const blessingResultBanner = document.getElementById("blessingResultBanner");

// Stat display elements
const statLevel = document.getElementById("statLevel");
const statLevelNext = document.getElementById("statLevelNext");
const statHealth = document.getElementById("statHealth");
const statHealthNext = document.getElementById("statHealthNext");
const statAttack = document.getElementById("statAttack");
const statAttackNext = document.getElementById("statAttackNext");
const statMana = document.getElementById("statMana");
const statManaNext = document.getElementById("statManaNext");

let joined = false;
let lastState = null;
let levelUpTimerInterval = null;
let levelUpTimerSeconds = 30;
let choiceMade = false;
let gameStarted = false;
let singlePlayerRunStarted = false;
let singlePlayerRoundRequested = false;
let upgradeModalVisible = false;
let blessingModalVisible = false;
let blessingTimerInterval = null;
let blessingTimerSeconds = 30;
let blessingChoiceMade = false;
let turnTimerInterval = null;
let turnTimerSeconds = 25;

const pageParams = new URLSearchParams(window.location.search);
const singlePlayerMode = pageParams.get("single") === "1";
const multiplayerRoomCode = pageParams.get("room") || "";
const continueRequested = pageParams.get("continue") === "1";
let continueAttempted = false;

if (singlePlayerMode && roomCodeRow) {
    roomCodeRow.hidden = true;
}

const UPGRADE_FULL  = { health: 6, attack: 2, mana: 2 };

function getUpgradeValues() {
    return UPGRADE_FULL;
}

function updateUpgradeModalStats(state) {
    const self = state.players[window.socket.id];
    if (!self || !self.run) return;

    const run = self.run;
    const level = run.level || 1;
    const vals = getUpgradeValues();

    statLevel.textContent = level;
    statHealth.textContent = `${run.health}/${run.maxHealth}`;
    statAttack.textContent = run.attackDamage;
    statMana.textContent = `${run.mana}/${run.maxMana}`;

    statLevelNext.textContent = level + 1;
    statHealthNext.textContent = `${run.health}/${run.maxHealth + vals.health}`;
    statAttackNext.textContent = run.attackDamage + vals.attack;
    statManaNext.textContent = `${run.mana}/${run.maxMana + vals.mana}`;

    // Update button labels to match actual grant.
    modalUpgradeHealthButton.querySelector(".upgrade-value").textContent = `+${vals.health} HP`;
    modalUpgradeAttackButton.querySelector(".upgrade-value").textContent = `+${vals.attack} Damage`;
    modalUpgradeManaButton.querySelector(".upgrade-value").textContent = `+${vals.mana} Mana`;
}

function showUpgradeModal(state) {
    updateUpgradeModalStats(state);

    upgradeResultBanner.textContent = "Level Up!";
    upgradeResultBanner.className = "modal-result-banner result-won";

    if (upgradeModalVisible) {
        return;
    }

    upgradeModalVisible = true;
    upgradeModalOverlay.removeAttribute("hidden");
    startModalTimer();
}

function hideUpgradeModal() {
    upgradeModalVisible = false;
    upgradeModalOverlay.setAttribute("hidden", "");
    if (levelUpTimerInterval) {
        clearInterval(levelUpTimerInterval);
        levelUpTimerInterval = null;
    }
}

// ---- Big upgrade (blessing) modal ----------------------------------------

function showBlessingModal(state) {
    if (blessingModalVisible) {
        return;
    }

    const tier = state.dealerTier || 1;
    blessingModalTitle.textContent = `Power-Up — Dealer #${tier - 1} Defeated`;

    // Big upgrade only fires on dealer defeat (always a win), banner is always positive.
    blessingResultBanner.textContent = "Dealer Slain!";
    blessingResultBanner.className = "modal-result-banner result-won";

    // Build blessing buttons dynamically from server state.
    blessingOptions.innerHTML = "";
    (state.blessings || []).forEach(blessing => {
        const btn = document.createElement("button");
        btn.className = "upgrade-option blessing-option";
        btn.dataset.blessingId = blessing.id;
        btn.innerHTML = `
            <span class="upgrade-name">${blessing.name}</span>
            <span class="upgrade-value">${blessing.description}</span>
        `;
        btn.addEventListener("click", () => {
            if (blessingChoiceMade) return;
            window.socket.emit("chooseBlessing", blessing.id);
            startPostBlessingModal();
        });
        blessingOptions.appendChild(btn);
    });

    blessingModalVisible = true;
    blessingModalOverlay.removeAttribute("hidden");
    startBlessingTimer();
}

function hideBlessingModal() {
    blessingModalVisible = false;
    blessingModalOverlay.setAttribute("hidden", "");
    if (blessingTimerInterval) {
        clearInterval(blessingTimerInterval);
        blessingTimerInterval = null;
    }
}

function clickRandomBlessingOption() {
    const buttons = blessingOptions.querySelectorAll(".blessing-option");
    if (!buttons.length) return;
    const selected = buttons[Math.floor(Math.random() * buttons.length)];
    selected.click();
}

function startBlessingTimer() {
    blessingChoiceMade = false;
    blessingTimerSeconds = 30;
    blessingTimer.classList.remove("warning");
    blessingTimer.textContent = "30s";

    if (blessingTimerInterval) clearInterval(blessingTimerInterval);

    blessingTimerInterval = setInterval(() => {
        blessingTimerSeconds--;
        blessingTimer.textContent = `${blessingTimerSeconds}s`;

        if (blessingTimerSeconds <= 5) {
            blessingTimer.classList.add("warning");
        }

        if (blessingTimerSeconds <= 0) {
            clearInterval(blessingTimerInterval);
            blessingTimerInterval = null;
            if (!blessingChoiceMade) {
                clickRandomBlessingOption();
            }
        }
    }, 1000);
}

function startPostBlessingModal() {
    blessingChoiceMade = true;
    blessingTimerSeconds = 5;
    blessingTimer.classList.remove("warning");
    blessingTimer.textContent = "5s";

    if (blessingTimerInterval) clearInterval(blessingTimerInterval);

    blessingTimerInterval = setInterval(() => {
        blessingTimerSeconds--;
        blessingTimer.textContent = `${blessingTimerSeconds}s`;

        if (blessingTimerSeconds <= 0) {
            clearInterval(blessingTimerInterval);
            blessingTimerInterval = null;
            hideBlessingModal();
        }
    }, 1000);
}

// ---- Small upgrade helpers -------------------------------------------------

function clickRandomUpgradeOption() {
    const bases = ["health", "attack", "mana"];
    const base = bases[Math.floor(Math.random() * bases.length)];

    window.socket.emit("chooseLevelUp", base);
    startPostChoiceModal();
}

function startModalTimer() {
    choiceMade = false;
    levelUpTimerSeconds = 30;
    upgradeTimer.classList.remove("warning");
    upgradeTimer.textContent = "30s";

    if (levelUpTimerInterval) {
        clearInterval(levelUpTimerInterval);
    }

    levelUpTimerInterval = setInterval(() => {
        levelUpTimerSeconds--;
        upgradeTimer.textContent = `${levelUpTimerSeconds}s`;

        if (levelUpTimerSeconds <= 5) {
            upgradeTimer.classList.add("warning");
        }

        if (levelUpTimerSeconds <= 0) {
            clearInterval(levelUpTimerInterval);
            levelUpTimerInterval = null;
            // Auto-select a random option if no choice was made in time.
            if (!choiceMade) {
                clickRandomUpgradeOption();
            }
        }
    }, 1000);
}

function startPostChoiceModal() {
    choiceMade = true;
    levelUpTimerSeconds = 5;
    upgradeTimer.classList.remove("warning");
    upgradeTimer.textContent = "5s";

    if (levelUpTimerInterval) {
        clearInterval(levelUpTimerInterval);
    }

    levelUpTimerInterval = setInterval(() => {
        levelUpTimerSeconds--;
        upgradeTimer.textContent = `${levelUpTimerSeconds}s`;

        if (levelUpTimerSeconds <= 0) {
            clearInterval(levelUpTimerInterval);
            levelUpTimerInterval = null;
            hideUpgradeModal();
        }
    }, 1000);
}

function showMessage(text, isError = false) {
    gameMessage.hidden = false;
    gameMessage.textContent = text;
    gameMessage.className = isError ? "message message-error" : "message";
}

// ---- Per-turn countdown timer (25 seconds) --------------------------------

let turnTimerEl = null;

function getTurnTimerEl() {
    if (!turnTimerEl) {
        turnTimerEl = document.getElementById("turnTimerDisplay");
    }
    return turnTimerEl;
}

function startTurnTimer() {
    stopTurnTimer();
    turnTimerSeconds = 25;
    const el = getTurnTimerEl();
    if (el) {
        el.hidden = false;
        el.textContent = "25s";
        el.classList.remove("warning");
    }

    turnTimerInterval = setInterval(() => {
        turnTimerSeconds--;
        if (el) {
            el.textContent = `${turnTimerSeconds}s`;
            if (turnTimerSeconds <= 5) el.classList.add("warning");
        }

        if (turnTimerSeconds <= 0) {
            stopTurnTimer();
            window.socket.emit("stand");
        }
    }, 1000);
}

function stopTurnTimer() {
    if (turnTimerInterval) {
        clearInterval(turnTimerInterval);
        turnTimerInterval = null;
    }
    const el = getTurnTimerEl();
    if (el) {
        el.hidden = true;
        el.classList.remove("warning");
    }
}

function getCardAssetPath(card) {
    if (!card || !card.value || !card.suit) {
        return "assets/cards/back.svg";
    }

    return `assets/cards/${card.value}${card.suit}.svg`;
}

function renderCards(cards) {
    return cards.map(card => {
        if (card.hidden) {
            return '<img class="playing-card-image" src="assets/cards/back.svg" alt="Hidden card">';
        }

        const label = `${card.value}${card.suit}`;
        return `<img class="playing-card-image" src="${getCardAssetPath(card)}" alt="${label}" loading="lazy">`;
    }).join("");
}

function getClientHandValue(cards) {
    let total = 0;
    let aces = 0;

    cards.forEach(card => {
        if (!card || card.hidden) {
            return;
        }

        if (["J", "Q", "K"].includes(card.value)) {
            total += 10;
            return;
        }

        if (card.value === "A") {
            total += 11;
            aces += 1;
            return;
        }

        total += Number(card.value || 0);
    });

    while (total > 21 && aces > 0) {
        total -= 10;
        aces -= 1;
    }

    return total;
}

function renderBars(current, max) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
    return `
        <div class="stat-bar">
            <div class="stat-bar-fill" style="width:${pct.toFixed(1)}%"></div>
        </div>
    `;
}

function renderBattleBar(state) {
    const allPlayers = Object.values(state.players || {});
    const alive = allPlayers.filter(p => p.run && p.run.alive);

    battleP1.innerHTML = `
        <span class="battle-name">Dealer</span>
        <span class="battle-hp">HP ${state.dealer.health} / ${state.dealer.maxHealth}</span>
        ${renderBars(state.dealer.health, state.dealer.maxHealth)}
        <span class="subtle small">Attack ${state.dealer.attackDamage}</span>
    `;

    battleP2.innerHTML = `
        <span class="battle-name">Team</span>
        <span class="battle-hp">Alive ${alive.length} / ${allPlayers.length}</span>
        <span class="subtle small">Party Status</span>
    `;

    roundCounter.textContent = `Chapter ${state.chapter} • Round ${state.roundInChapter + 1}/${state.roundsPerChapter}`;
}

function renderSummary(summary) {
    if (!summary) {
        roundSummary.innerHTML = "<p class='subtle'>No round completed yet.</p>";
        return;
    }

    const rows = summary.results.map(result => `
        <div class="summary-row">
            <span><strong>${result.name}</strong> <span class="result-tag result-${result.result}">${result.result.toUpperCase()}</span></span>
            <span>Score ${result.score} • Hands ${result.handCount || 1} • HP ${result.hp} • Mana ${result.mana}</span>
        </div>
    `).join("");

    roundSummary.innerHTML = `
        <p>Chapter ${summary.chapter} • Round ${summary.roundInChapter}</p>
        <p class="subtle">Dealer score ${summary.dealerScore} • Dealer HP end ${summary.dealerHealthAfter}</p>
        ${rows}
    `;
}

function renderPlayers(players, currentTurnId, phase) {
    playersDiv.innerHTML = "";

    Object.entries(players).forEach(([id, player]) => {
        const article = document.createElement("article");
        const isCurrent = id === currentTurnId;
        const run = player.run;

        article.className = `player-card ${isCurrent ? "active-turn" : ""}`;
        const manaPct = run.maxMana > 0 ? Math.max(0, Math.min(100, (run.mana / run.maxMana) * 100)) : 0;

        const handMarkup = run.hand.length
            ? renderCards(run.hand)
            : "<span class=\"subtle\">No cards dealt</span>";

        const hasSplitDisplay = !!run.splitActive;

        const splitHandsMarkup = (() => {
            if (!hasSplitDisplay) {
                return "";
            }

            const segments = [];

            (run.resolvedHands || []).forEach((resolvedHand, index) => {
                segments.push({
                    cards: resolvedHand.cards || [],
                    busted: !!resolvedHand.busted,
                    number: index + 1,
                    isActive: false
                });
            });

            const finalSplitHandAlreadyResolved = !!(
                (run.resolvedHands || []).length > 0
                && (run.pendingSplitHands || []).length === 0
                && run.standing
                && !(id === currentTurnId && phase === "in-round")
            );

            if (!finalSplitHandAlreadyResolved) {
                segments.push({
                    cards: run.hand || [],
                    busted: !!run.busted,
                    number: segments.length + 1,
                    isActive: id === currentTurnId && phase === "in-round"
                });
            }

            (run.pendingSplitHands || []).forEach(pendingHand => {
                segments.push({
                    cards: pendingHand || [],
                    busted: false,
                    number: segments.length + 1,
                    isActive: false
                });
            });

            const cards = segments.map(segment => {
                const handValue = getClientHandValue(segment.cards || []);
                const status = segment.isActive
                    ? "ACTIVE"
                    : (segment.busted ? "BUST" : "READY");

                return `
                    <div class="split-hand-card ${segment.isActive ? "split-hand-active" : ""}">
                        <div class="split-hand-title-row">
                            <span class="split-hand-title">Hand ${segment.number}</span>
                            <span class="split-hand-state">${status}</span>
                        </div>
                        <p class="split-hand-value">Value ${handValue}</p>
                        <div class="card-row">${segment.cards.length ? renderCards(segment.cards) : "<span class='subtle'>No cards</span>"}</div>
                    </div>
                `;
            }).join("");

            return `<div class="split-hands-grid">${cards}</div>`;
        })();

        article.innerHTML = `
            <div class="player-card-header">
                <h3>${player.name} ${player.isHost ? "<span class='host-tag'>Host</span>" : ""}</h3>
                <span class="hp-badge ${run.health <= 8 ? "hp-critical" : ""}">HP ${run.health}/${run.maxHealth}</span>
            </div>
            <div class="player-hud-row">
                <span class="hud-pill hud-pill-level">★ Lv ${run.level}</span>
                <span class="hud-pill hud-pill-xp">◆ XP ${run.xp}/${run.xpToNext}</span>
                <span class="hud-pill hud-pill-attack">⚔ ATK ${run.attackDamage}</span>
            </div>
            <div class="mana-hud" aria-label="Mana ${run.mana} out of ${run.maxMana}">
                <span class="mana-potion-label">Mana</span>
                <div class="mana-potion">
                    <div class="mana-potion-bottle">
                        <div class="mana-potion-fill" style="height:${manaPct.toFixed(1)}%"></div>
                    </div>
                    <span class="mana-potion-text">${run.mana}/${run.maxMana}</span>
                </div>
            </div>
            ${renderBars(run.health, run.maxHealth)}
            ${hasSplitDisplay
                ? splitHandsMarkup
                : `<p class="hand-value">Hand: <strong>${run.handValue}</strong></p><div class="card-row">${handMarkup}</div>`}
            <p class="player-status-text">${!run.alive ? "Defeated" : (run.busted ? "BUST" : (run.standing ? "STAND" : (isCurrent ? "YOUR TURN" : "Waiting")))}</p>
        `;

        playersDiv.appendChild(article);
    });
}

function renderAbilityControls(state) {
    const self = state.players[window.socket.id];

    abilityControls.innerHTML = "";

    if (!self) {
        return;
    }

    const usedAbility = !!(self.run && self.run.usedAbilityThisHand);

    if (abilityUsedNote) {
        abilityUsedNote.hidden = !usedAbility;
    }

    state.abilities.forEach(ability => {
        const btn = document.createElement("button");
        btn.className = "ability-chip";
        const isDisabled = state.phase !== "in-round"
            || state.currentTurnId !== window.socket.id
            || self.run.mana < ability.manaCost
            || !self.run.alive
            || usedAbility;
        btn.disabled = isDisabled;
        btn.title = ability.description;

        btn.innerHTML = `
            <span class="ability-icon">${abilityIcon(ability.id)}</span>
            <span class="ability-info">
                <span class="ability-name">${ability.name}</span>
                <span class="ability-desc">${ability.description}</span>
            </span>
            <span class="ability-cost">${ability.manaCost > 0 ? ability.manaCost + " MP" : "Free"}</span>
        `;

        btn.addEventListener("click", () => {
            window.socket.emit("useAbility", ability.id);
        });
        abilityControls.appendChild(btn);
    });
}

function abilityIcon(id) {
    const icons = {
        arcaneDraw: "🃏",
        mendWounds: "💚",
        emberStrike: "🔥",
        manaSurge: "⚡"
    };
    return icons[id] || "✨";
}

function startLevelUpTimer() {
    choiceMade = false;
    levelUpTimerSeconds = 30;
    levelUpTimer.hidden = false;
    levelUpTimer.classList.remove("warning");
    levelUpTimer.classList.add("normal");

    if (levelUpTimerInterval) {
        clearInterval(levelUpTimerInterval);
    }

    levelUpTimerInterval = setInterval(() => {
        levelUpTimerSeconds--;
        levelUpTimer.textContent = `${levelUpTimerSeconds}s`;

        if (levelUpTimerSeconds <= 5) {
            levelUpTimer.classList.remove("normal");
            levelUpTimer.classList.add("warning");
        }

        if (levelUpTimerSeconds <= 0) {
            clearInterval(levelUpTimerInterval);
            levelUpTimer.hidden = true;
            // Auto-select first option if no choice made
            if (!choiceMade && !upgradeHealthButton.hidden) {
                upgradeHealthButton.click();
            }
        }
    }, 1000);
}

function startPostChoiceTimer() {
    choiceMade = true;
    levelUpTimerSeconds = 3;
    levelUpTimer.classList.remove("normal");
    levelUpTimer.classList.add("warning");

    if (levelUpTimerInterval) {
        clearInterval(levelUpTimerInterval);
    }

    levelUpTimerInterval = setInterval(() => {
        levelUpTimerSeconds--;
        levelUpTimer.textContent = `${levelUpTimerSeconds}s`;

        if (levelUpTimerSeconds <= 0) {
            clearInterval(levelUpTimerInterval);
            levelUpTimer.hidden = true;
        }
    }, 1000);
}

function renderProgressChoices(state) {
    const self = state.players[window.socket.id];

    if (!self) {
        hideUpgradeModal();
        hideBlessingModal();
        return;
    }

    const hasLevelChoice = self.run.pendingStatChoices > 0;
    const hasBlessingChoice = self.run.pendingBlessingChoices > 0;

    // Small upgrade modal — hide during blessing phase so they don't stack.
    if (hasBlessingChoice) {
        hideUpgradeModal();
        showBlessingModal(state);
    } else if (hasLevelChoice) {
        hideBlessingModal();
        showUpgradeModal(state);
    } else {
        hideUpgradeModal();
        hideBlessingModal();
    }
}

function renderRunOver(state) {
    const over = state.phase === "run-over";
    matchOverSection.hidden = !over;

    if (!over) {
        return;
    }

    matchWinnerText.textContent = state.runResult || "Run complete.";

    const self = state.players[window.socket.id];
    rematchButton.hidden = !self || !self.isHost;
}

function renderRoundBanner(state) {
    if (!state.roundBanner) {
        roundBanner.hidden = true;
        return;
    }

    roundBanner.hidden = false;
    roundBanner.textContent = state.roundBanner.text;
    const bannerType = state.roundBanner.type === "loss" ? "message-type-loss" : "message-type-win";
    roundBanner.className = `message ${bannerType}`;
}

function emitJoin() {
    if (joined) {
        return;
    }

    window.socket.emit("joinGame", { roomCode: multiplayerRoomCode });
    joined = true;
}

window.socket.on("connect", emitJoin);
emitJoin();

window.socket.on("joinError", message => {
    showMessage(message, true);
    joined = false;
});

window.socket.on("errorMessage", message => showMessage(message, true));

window.socket.on("gameState", state => {
    lastState = state;

    const self = state.players[window.socket.id];
    const isHost = !!self && self.isHost;
    const isMyTurn = state.currentTurnId === window.socket.id;

    if (singlePlayerMode && isHost && !state.runActive && !singlePlayerRunStarted) {
        singlePlayerRunStarted = true;

        if (continueRequested && !continueAttempted) {
            continueAttempted = true;
            window.socket.emit("resumeSoloRun", response => {
                if (!response || !response.ok) {
                    window.socket.emit("startRun");
                }
            });
        }
        else {
            window.socket.emit("startRun");
        }
    }

    // Auto-start the first round for solo mode as soon as the run is created.
    if (singlePlayerMode && isHost && state.runActive && !singlePlayerRoundRequested && state.phase === "run-lobby") {
        singlePlayerRoundRequested = true;
        window.socket.emit("startRound");
    }

    // General host auto-start guard (used for reconnect edge-cases).
    if (isHost && state.runActive && !gameStarted && state.chapter === 1 && state.roundInChapter === 0 && state.phase === "in-round") {
        gameStarted = true;
    }

    // Multiplayer: host auto-starts first round when run is ready.
    if (!singlePlayerMode && isHost && state.runActive && !singlePlayerRoundRequested && state.phase === "run-lobby") {
        singlePlayerRoundRequested = true;
        window.socket.emit("startRound");
    }

    // Turn timer: start when it becomes my turn, stop otherwise.
    if (!singlePlayerMode && state.phase === "in-round") {
        if (isMyTurn) {
            if (!turnTimerInterval) {
                startTurnTimer();
            }
        } else {
            stopTurnTimer();
        }
    } else if (singlePlayerMode && state.phase === "in-round" && isMyTurn) {
        // Solo: still show timer so the rule is consistent
        if (!turnTimerInterval) {
            startTurnTimer();
        }
    } else {
        stopTurnTimer();
    }

    roomCodeText.textContent = singlePlayerMode ? "Solo" : (state.roomCode || "-");
    modeLabel.textContent = singlePlayerMode
        ? "SmackJack Solo Run"
        : "SmackJack Roguelike Co-op";

    if (!state.runActive) {
        tableStatus.textContent = "Run not started. Host can start a new run.";
    }
    else if (state.phase === "in-round") {
        tableStatus.textContent = `Round in progress • Chapter ${state.chapter}`;
    }
    else if (state.phase === "blackjack-delay") {
        tableStatus.textContent = "Blackjack! Resolving hand...";
    }
    else if (state.phase === "level-up") {
        tableStatus.textContent = "Choose your level-up stat to continue.";
    }
    else if (state.phase === "blessing-choice") {
        tableStatus.textContent = "Choose your big upgrade to continue.";
    }
    else if (state.phase === "run-over") {
        tableStatus.textContent = "Run over. Host can reset and start again.";
    }
    else {
        tableStatus.textContent = "Waiting for host to start next round.";
    }

    dealerCards.innerHTML = renderCards(state.dealer.hand || []);
    dealerValue.textContent = `Dealer Value: ${state.dealer.handValue || 0}`;
    dealerCombatStats.textContent = `Dealer HP ${state.dealer.health}/${state.dealer.maxHealth} • ATK ${state.dealer.attackDamage}`;

    renderBattleBar(state);
    renderPlayers(state.players, state.currentTurnId, state.phase);
    renderSummary(state.lastRoundSummary);
    renderAbilityControls(state);
    renderProgressChoices(state);
    renderRunOver(state);
    renderRoundBanner(state);

    hitButton.disabled = !isMyTurn || state.phase !== "in-round";
    standButton.disabled = !isMyTurn || state.phase !== "in-round";
    doubleButton.disabled = !isMyTurn || state.phase !== "in-round" || !self || !self.run.canDouble;
    const canShowSplit = !!(isMyTurn && state.phase === "in-round" && self && self.run.canSplit);
    if (canShowSplit) {
        if (!splitButton.isConnected) {
            doubleButton.insertAdjacentElement("afterend", splitButton);
        }
        splitButton.hidden = false;
        splitButton.disabled = false;
    }
    else if (splitButton.isConnected) {
        splitButton.hidden = true;
        splitButton.remove();
    }
});

// Modal upgrade button listeners
modalUpgradeHealthButton.addEventListener("click", () => {
    if (choiceMade) {
        return;
    }

    window.socket.emit("chooseLevelUp", "health");
    startPostChoiceModal();
});

modalUpgradeAttackButton.addEventListener("click", () => {
    if (choiceMade) {
        return;
    }

    window.socket.emit("chooseLevelUp", "attack");
    startPostChoiceModal();
});

modalUpgradeManaButton.addEventListener("click", () => {
    if (choiceMade) {
        return;
    }

    window.socket.emit("chooseLevelUp", "mana");
    startPostChoiceModal();
});

hitButton.addEventListener("click", () => {
    window.socket.emit("hit");
});

standButton.addEventListener("click", () => {
    window.socket.emit("stand");
});

doubleButton.addEventListener("click", () => {
    window.socket.emit("double");
});

splitButton.addEventListener("click", () => {
    window.socket.emit("split");
});

backToMenuButton.addEventListener("click", () => {
    if (singlePlayerMode) {
        backToMenuButton.disabled = true;
        window.socket.emit("saveAndExitSolo", () => {
            window.location.href = "menu.html";
        });

        setTimeout(() => {
            window.location.href = "menu.html";
        }, 400);
        return;
    }

    window.location.href = "lobby.html";
});

function goToMenuFromGame() {
    if (singlePlayerMode) {
        window.socket.emit("saveAndExitSolo", () => {
            window.location.href = "menu.html";
        });

        setTimeout(() => {
            window.location.href = "menu.html";
        }, 400);
        return;
    }

    window.location.href = "menu.html";
}

rematchButton.addEventListener("click", () => {
    if (singlePlayerMode) {
        singlePlayerRunStarted = false;
        singlePlayerRoundRequested = false;
        gameStarted = false;
    }

    window.socket.emit("resetRun");
});

// Keyboard navigation for game actions
document.addEventListener("keydown", event => {
    if (event.target.tagName === "INPUT") return; // Don't intercept form inputs

    if (event.key === "Escape") {
        event.preventDefault();
        goToMenuFromGame();
        return;
    }

    const primaryButtons = [
        { elem: hitButton, key: "h" },
        { elem: standButton, key: "s" },
        { elem: doubleButton, key: "d" },
        { elem: splitButton, key: "p" }
    ];

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
