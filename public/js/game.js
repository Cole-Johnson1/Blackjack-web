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
const comboDisplay = document.getElementById("comboDisplay");
const abilityUsedNote = document.getElementById("abilityUsedNote");

const hitButton = document.getElementById("hitButton");
const standButton = document.getElementById("standButton");
const doubleButton = document.getElementById("doubleButton");
const splitButton = document.getElementById("splitButton");
const menuBurgerButton = document.getElementById("menuBurgerButton");
const rematchButton = document.getElementById("rematchButton");

const escMenuOverlay = document.getElementById("escMenuOverlay");
const escResumeButton = document.getElementById("escResumeButton");
const escExitButton = document.getElementById("escExitButton");

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

const shopModalOverlay = document.getElementById("shopModalOverlay");
const shopTimer = document.getElementById("shopTimer");
const shopOptions = document.getElementById("shopOptions");
const shopModalTitle = document.getElementById("shopModalTitle");
const shopResultBanner = document.getElementById("shopResultBanner");

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
let shopModalVisible = false;
let shopTimerInterval = null;
let shopTimerSeconds = 30;
let shopChoiceMade = false;
let turnTimerInterval = null;
let turnTimerSeconds = 25;
let escMenuOpen = false;

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

    setEscMenuOpen(false);
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

    setEscMenuOpen(false);
    const tier = state.dealerTier || 1;
    blessingModalTitle.textContent = `Power-Up — Dealer #${tier - 1} Defeated`;

    // Big upgrade only fires on dealer defeat (always a win), banner is always positive.
    blessingResultBanner.textContent = "Dealer Slain!";
    blessingResultBanner.className = "modal-result-banner result-won";

    const self = state.players[window.socket.id];
    const blessingChoices = self && self.run && Array.isArray(self.run.pendingBlessingOptions)
        ? self.run.pendingBlessingOptions
        : (state.blessings || []);

    // Build blessing buttons dynamically from server state.
    blessingOptions.innerHTML = "";
    blessingChoices.forEach(blessing => {
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

function showShopModal(state) {
    if (shopModalVisible) {
        return;
    }

    setEscMenuOpen(false);
    shopModalTitle.textContent = "Boss Shop — Choose 1 Reward";
    shopResultBanner.textContent = "A powerful dealer was defeated.";
    shopResultBanner.className = "modal-result-banner result-won";

    const self = state.players[window.socket.id];
    const shopChoices = self && self.run && Array.isArray(self.run.pendingShopOptions)
        ? self.run.pendingShopOptions
        : [];

    shopOptions.innerHTML = "";
    shopChoices.forEach(item => {
        const btn = document.createElement("button");
        btn.className = "upgrade-option blessing-option";
        btn.dataset.shopItemId = item.id;
        btn.innerHTML = `
            <span class="upgrade-name">${item.name}</span>
            <span class="upgrade-value">${item.description}</span>
        `;
        btn.addEventListener("click", () => {
            if (shopChoiceMade) return;
            window.socket.emit("chooseShopItem", item.id);
            startPostShopModal();
        });
        shopOptions.appendChild(btn);
    });

    shopModalVisible = true;
    shopModalOverlay.removeAttribute("hidden");
    startShopTimer();
}

function hideShopModal() {
    shopModalVisible = false;
    shopModalOverlay.setAttribute("hidden", "");
    if (shopTimerInterval) {
        clearInterval(shopTimerInterval);
        shopTimerInterval = null;
    }
}

function clickRandomShopOption() {
    const buttons = shopOptions.querySelectorAll(".blessing-option");
    if (!buttons.length) return;
    const selected = buttons[Math.floor(Math.random() * buttons.length)];
    selected.click();
}

function startShopTimer() {
    shopChoiceMade = false;
    shopTimerSeconds = 30;
    shopTimer.classList.remove("warning");
    shopTimer.textContent = "30s";

    if (shopTimerInterval) clearInterval(shopTimerInterval);

    shopTimerInterval = setInterval(() => {
        shopTimerSeconds--;
        shopTimer.textContent = `${shopTimerSeconds}s`;

        if (shopTimerSeconds <= 5) {
            shopTimer.classList.add("warning");
        }

        if (shopTimerSeconds <= 0) {
            clearInterval(shopTimerInterval);
            shopTimerInterval = null;
            if (!shopChoiceMade) {
                clickRandomShopOption();
            }
        }
    }, 1000);
}

function startPostShopModal() {
    shopChoiceMade = true;
    shopTimerSeconds = 5;
    shopTimer.classList.remove("warning");
    shopTimer.textContent = "5s";

    if (shopTimerInterval) clearInterval(shopTimerInterval);

    shopTimerInterval = setInterval(() => {
        shopTimerSeconds--;
        shopTimer.textContent = `${shopTimerSeconds}s`;

        if (shopTimerSeconds <= 0) {
            clearInterval(shopTimerInterval);
            shopTimerInterval = null;
            hideShopModal();
        }
    }, 1000);
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
    gameMessage.className = isError
        ? "game-message-pov message-error"
        : "game-message-pov";
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

function renderCards(cards, options = {}) {
    const owner = options.owner === "dealer" ? "dealer" : "player";

    return cards.map((card, index) => {
        const delay = owner === "dealer" ? index * 0.07 : index * 0.055;
        const duration = Math.min(0.42, 0.24 + (index * 0.018));
        const xOffset = owner === "dealer"
            ? ((index % 2 === 0 ? -1 : 1) * (10 + (index * 1.5)))
            : ((index % 2 === 0 ? -1 : 1) * (7 + (index * 1.2)));
        const rotation = owner === "dealer"
            ? (-8 + (index * 2.2))
            : (-6 + (index * 1.8));
        const style = `style="--deal-delay:${delay.toFixed(3)}s; --deal-duration:${duration.toFixed(3)}s; --deal-x:${xOffset.toFixed(1)}px; --deal-rot:${rotation.toFixed(1)}deg;"`;

        if (card.hidden) {
            return `<img class="playing-card-image deal-owner-${owner}" ${style} src="assets/cards/back.svg" alt="Hidden card">`;
        }

        const label = `${card.value}${card.suit}`;
        return `<img class="playing-card-image deal-owner-${owner}" ${style} src="${getCardAssetPath(card)}" alt="${label}" loading="lazy">`;
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

// ── POV ANIMATION HELPERS ──────────────────────────────────────

const bloodScreen   = document.getElementById("bloodScreen");
const hitFlashEl    = document.getElementById("hitFlash");
const dealerImpactEl = document.getElementById("dealerImpact");
const playerImpactEl = document.getElementById("playerImpact");
const gameViewport  = document.getElementById("gameViewport");
const dealerSprite  = document.getElementById("dealerSprite");
const dealerCardsEl = document.getElementById("dealerCards");
const abilityHudEl  = document.querySelector(".ability-hud");
const dealerArmL    = document.getElementById("dealerArmLeft");
const dealerArmR    = document.getElementById("dealerArmRight");
const playerArmL    = document.getElementById("playerArmLeft");
const playerArmR    = document.getElementById("playerArmRight");

function updateDealerTierMotion(tier) {
    if (!dealerSprite) return;

    dealerSprite.classList.remove(
        "tier-low",
        "tier-mid",
        "tier-high",
        "theme-crimson",
        "theme-emerald",
        "theme-royal",
        "theme-amber"
    );

    const palette = ["theme-crimson", "theme-emerald", "theme-royal", "theme-amber"];
    dealerSprite.classList.add(palette[(Math.max(1, tier) - 1) % palette.length]);

    if (tier >= 5) {
        dealerSprite.classList.add("tier-high");
        return;
    }

    if (tier >= 3) {
        dealerSprite.classList.add("tier-mid");
        return;
    }

    dealerSprite.classList.add("tier-low");
}

function updateAtmosphere(state) {
    if (!gameViewport) return;

    gameViewport.classList.remove(
        "atmo-crimson",
        "atmo-emerald",
        "atmo-royal",
        "atmo-amber",
        "atmo-high"
    );

    const palette = ["atmo-crimson", "atmo-emerald", "atmo-royal", "atmo-amber"];
    const tier = Math.max(1, state.dealerTier || 1);
    gameViewport.classList.add(palette[(tier - 1) % palette.length]);

    if (tier >= 5) {
        gameViewport.classList.add("atmo-high");
    }
}

function updateBloodScreen(hpPct) {
    if (!bloodScreen) return;
    bloodScreen.classList.remove("hp-low", "hp-critical");
    if (hpPct < 25) {
        bloodScreen.classList.add("hp-critical");
    } else if (hpPct < 50) {
        bloodScreen.classList.add("hp-low");
    }
}

function triggerHitFlash(intensity = "medium") {
    if (!hitFlashEl) return;
    hitFlashEl.classList.remove("light", "heavy");
    if (intensity === "light") hitFlashEl.classList.add("light");
    if (intensity === "heavy") hitFlashEl.classList.add("heavy");
    hitFlashEl.classList.add("active");
    setTimeout(() => hitFlashEl.classList.remove("active"), 120);
}

function triggerImpactBurst(el) {
    if (!el) return;
    el.classList.remove("active");
    void el.offsetWidth;
    el.classList.add("active");
}

function triggerScreenShake(intensity = "medium") {
    if (!gameViewport) return;
    gameViewport.classList.remove("screen-shake-light", "screen-shake", "screen-shake-heavy");

    const shakeClass = intensity === "heavy"
        ? "screen-shake-heavy"
        : intensity === "light"
            ? "screen-shake-light"
            : "screen-shake";
    gameViewport.classList.add(shakeClass);
    const duration = intensity === "heavy" ? 460 : intensity === "light" ? 260 : 400;
    setTimeout(() => gameViewport.classList.remove(shakeClass), duration);
}

function animatePlayerSmack() {
    if (!playerArmL || !playerArmR) return;
    // Alternate arms for a punching feel
    const useLeft = Math.random() < 0.5;
    const arm = useLeft ? playerArmL : playerArmR;
    arm.classList.remove("smacking");
    // Force reflow so re-adding triggers the animation
    void arm.offsetWidth;
    arm.classList.add("smacking");
    arm.addEventListener("animationend", () => arm.classList.remove("smacking"), { once: true });

    // Dealer reacts to being hit
    if (dealerSprite) {
        setTimeout(() => {
            triggerImpactBurst(dealerImpactEl);
            triggerScreenShake("light");
            if (dealerCardsEl) {
                dealerCardsEl.classList.remove("hit-rattle");
                void dealerCardsEl.offsetWidth;
                dealerCardsEl.classList.add("hit-rattle");
            }
            dealerSprite.classList.remove("hit");
            void dealerSprite.offsetWidth;
            dealerSprite.classList.add("hit");
            dealerSprite.addEventListener("animationend", () => dealerSprite.classList.remove("hit"), { once: true });
        }, 120);
    }
}

function animateDealerSmack() {
    if (!dealerArmR) return;
    // Dealer strikes with right arm
    dealerArmR.classList.remove("smacking");
    void dealerArmR.offsetWidth;
    dealerArmR.classList.add("smacking");
    dealerArmR.addEventListener("animationend", () => dealerArmR.classList.remove("smacking"), { once: true });

    if (playerArmL && playerArmR) {
        [playerArmL, playerArmR].forEach(arm => {
            arm.classList.remove("recoil-hit");
            void arm.offsetWidth;
            arm.classList.add("recoil-hit");
            arm.addEventListener("animationend", () => arm.classList.remove("recoil-hit"), { once: true });
        });
    }

    // Screen shake + hit flash for player getting hit
    setTimeout(() => {
        triggerImpactBurst(playerImpactEl);
        triggerHitFlash("heavy");
        triggerScreenShake("heavy");
    }, 200);
}

let lastBannerType = null;

function renderBattleBar(state) {
    // ── Dealer HUD pills ──
    const dHpPct = state.dealer.maxHealth > 0
        ? Math.max(0, Math.min(100, (state.dealer.health / state.dealer.maxHealth) * 100))
        : 0;
    const dCritical = dHpPct < 25;
    const dTier = state.dealerTier || 1;

    battleP1.innerHTML = `
        <span class="hud-pill hud-pill-level">★ Tier ${dTier}</span>
        <span class="hud-pill hud-pill-attack">${state.dealer.isBoss ? "BOSS" : "Dealer"}: ${state.dealer.name || "Dealer"}</span>
        <span class="hud-pill hud-pill-health ${dCritical ? 'critical' : ''}">❤ ${state.dealer.health}/${state.dealer.maxHealth}</span>
        <span class="hud-pill hud-pill-attack">⚔ ATK ${state.dealer.attackDamage}</span>
    `;

    // Update dealer HP bar
    const dealerBar = document.getElementById('dealerHpBarFill');
    if (dealerBar) {
        dealerBar.style.width = dHpPct.toFixed(1) + '%';
        dealerBar.classList.toggle('critical', dCritical);
    }

    // ── Player stat pills (bottom HUD) ──
    const self = state.players[window.socket.id];
    if (self && self.run) {
        const run = self.run;
        const hpPct = run.maxHealth > 0
            ? Math.max(0, Math.min(100, (run.health / run.maxHealth) * 100))
            : 0;
        const manaPct = run.maxMana > 0
            ? Math.max(0, Math.min(100, (run.mana / run.maxMana) * 100))
            : 0;
        const hpCrit = hpPct < 25;
        const hpLow  = hpPct < 50;

        battleP2.innerHTML = `
            <span class="hud-pill hud-pill-level">★ Lv ${run.level || 1}</span>
            <span class="hud-pill hud-pill-xp">◆ ${run.xp}/${run.xpToNext}</span>
            <span class="hud-pill hud-pill-health ${hpCrit ? 'critical' : ''}">❤ ${run.health}/${run.maxHealth}</span>
            <span class="hud-pill hud-pill-attack">⚔ ATK ${run.attackDamage}</span>
            <div class="hud-hp-bar">
                <div class="hud-hp-track">
                    <div class="hud-hp-fill ${hpLow ? 'low' : ''}" style="width:${hpPct.toFixed(1)}%"></div>
                </div>
            </div>
            <div class="mana-hud">
                <span class="mana-potion-label">MP</span>
                <div class="mana-potion">
                    <div class="mana-potion-bottle">
                        <div class="mana-potion-fill" style="height:${manaPct.toFixed(1)}%"></div>
                    </div>
                    <span class="mana-potion-text">${run.mana}/${run.maxMana}</span>
                </div>
            </div>
        `;

        // Blood screen intensity
        updateBloodScreen(hpPct);
    } else {
        battleP2.innerHTML = '';
    }

    roundCounter.textContent = `Chapter ${state.chapter} · Round ${state.roundInChapter + 1}/${state.roundsPerChapter}`;
}

function renderSummary(summary) {
    if (!summary) {
        roundSummary.innerHTML = '';
        return;
    }

    // Compact strip for the bottom HUD bar
    const parts = summary.results.map(r => {
        const tag = r.result === 'win' ? '✔' : (r.result === 'loss' ? '✘' : '~');
        return `${r.name} ${tag} HP${r.hp}`;
    });
    roundSummary.textContent = `Dealer ${summary.dealerScore} | ${parts.join(' • ')}`;
}

function renderPlayers(players, currentTurnId, phase) {
    playersDiv.innerHTML = "";

    Object.entries(players).forEach(([id, player]) => {
        const article = document.createElement("article");
        const isCurrent = id === currentTurnId;
        const run = player.run;

        article.className = `player-card ${isCurrent ? "active-turn" : ""}`;

        const handMarkup = run.hand.length
            ? renderCards(run.hand, { owner: "player" })
            : "<span class=\"subtle\">No cards</span>";

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
                        <div class="card-row">${segment.cards.length ? renderCards(segment.cards, { owner: "player" }) : "<span class='subtle'>No cards</span>"}</div>
                    </div>
                `;
            }).join("");

            return `<div class="split-hands-grid">${cards}</div>`;
        })();

        // Compact POV layout — header + status + cards (stats live in the bottom HUD bar)
        const statusText = !run.alive
            ? "⚰ Defeated"
            : run.busted
                ? "⚡ BUST"
                : run.standing
                    ? "✋ Stand"
                    : isCurrent
                        ? "▶ Your Turn"
                        : "⏳ Waiting";

        article.innerHTML = `
            <div class="player-card-header">
                <h3>${player.name}${player.isHost ? " <span class='host-tag'>Host</span>" : ""}</h3>
                <span class="hp-badge ${run.health <= 8 ? "hp-critical" : ""}">❤ ${run.health}/${run.maxHealth}</span>
            </div>
            ${hasSplitDisplay
                ? splitHandsMarkup
                : `<p class="hand-value">Hand: <strong>${run.handValue}</strong></p><div class="card-row">${handMarkup}</div>`}
            <p class="player-status-text">${statusText}</p>
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
    const unlockedSet = new Set((self.run && self.run.unlockedAbilities) || []);
    const unlockedAbilities = (state.abilities || []).filter(ability => unlockedSet.has(ability.id));

    if (abilityUsedNote) {
        abilityUsedNote.hidden = !usedAbility;
    }

    if (unlockedAbilities.length === 0) {
        const empty = document.createElement("p");
        empty.className = "subtle small";
        empty.textContent = "No abilities unlocked yet. Defeat dealers to unlock new powers.";
        abilityControls.appendChild(empty);
        return;
    }

    unlockedAbilities.forEach(ability => {
        const btn = document.createElement("button");
        btn.className = "ability-chip";
        const isPassive = ability.type === "passive";
        const isDisabled = isPassive
            || state.phase !== "in-round"
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
            <span class="ability-cost">${isPassive ? "Passive" : (ability.manaCost > 0 ? ability.manaCost + " MP" : "Free")}</span>
        `;

        if (!isPassive) {
            btn.addEventListener("click", () => {
                btn.classList.remove("ability-fx");
                void btn.offsetWidth;
                btn.classList.add("ability-fx");
                btn.addEventListener("animationend", () => btn.classList.remove("ability-fx"), { once: true });
                window.socket.emit("useAbility", ability.id);
            });
        }

        abilityControls.appendChild(btn);
    });
}

function renderComboPresentation(state) {
    const self = state.players[window.socket.id];

    if (!comboDisplay || !abilityHudEl) return;

    if (!self || !self.run) {
        comboDisplay.hidden = true;
        abilityHudEl.classList.remove("combo-ready");
        return;
    }

    const run = self.run;
    const comboBits = [];

    if (run.emberStrikeActive) {
        comboBits.push("Ember Strike");
    }

    if (run.focusSigilActive) {
        comboBits.push("Focus Sigil");
    }

    if (run.siphonStrikeActive) {
        comboBits.push("Siphon Strike");
    }

    if (run.usedManaSurge) {
        comboBits.push("Mana Surge");
    }

    if ((run.tranceStacks || 0) > 0) {
        comboBits.push(`Trance x${run.tranceStacks}`);
    }

    if ((run.manaSpentThisHand || 0) > 0) {
        comboBits.push(`${run.manaSpentThisHand} Mana spent`);
    }

    if (!comboBits.length) {
        comboDisplay.hidden = true;
        comboDisplay.textContent = "";
        abilityHudEl.classList.remove("combo-ready");
        return;
    }

    const strongCombo = comboBits.length >= 3 || run.emberStrikeActive || run.focusSigilActive;
    comboDisplay.hidden = false;
    comboDisplay.classList.toggle("combo-heavy", strongCombo);
    comboDisplay.classList.toggle("combo-active", !strongCombo);
    comboDisplay.innerHTML = `
        <span class="combo-label">Combo</span>
        <span class="combo-values">${comboBits.join(" • ")}</span>
    `;
    abilityHudEl.classList.add("combo-ready");
}

function abilityIcon(id) {
    const icons = {
        arcaneDraw: "🃏",
        mendWounds: "💚",
        emberStrike: "🔥",
        manaSurge: "⚡",
        siphonStrike: "🛡",
        focusSigil: "🎯",
        battleTrance: "🧠",
        overcharge: "💥",
        executionerInstinct: "🗡",
        splitTorrent: "🌪"
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
    const hasShopChoice = self.run.pendingShopChoices > 0;

    // Small upgrade modal — hide during blessing phase so they don't stack.
    if (hasShopChoice) {
        hideUpgradeModal();
        hideBlessingModal();
        showShopModal(state);
    } else if (hasBlessingChoice) {
        hideShopModal();
        hideUpgradeModal();
        showBlessingModal(state);
    } else if (hasLevelChoice) {
        hideShopModal();
        hideBlessingModal();
        showUpgradeModal(state);
    } else {
        hideShopModal();
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
        lastBannerType = null;
        return;
    }

    const newType = state.roundBanner.type; // "win" | "loss" | "push" | "blackjack"

    // Trigger animations only when the banner first appears or changes
    if (newType !== lastBannerType) {
        lastBannerType = newType;

        if (newType === "loss") {
            // Dealer smacks the player
            animateDealerSmack();
        } else if (newType === "win" || newType === "blackjack") {
            // Player smacks the dealer
            animatePlayerSmack();
        }
    }

    roundBanner.hidden = false;
    roundBanner.textContent = state.roundBanner.text;

    let bannerClass = "round-banner-pov ";
    if (newType === "loss") {
        bannerClass += "message-type-loss";
    } else if (newType === "win" || newType === "blackjack") {
        bannerClass += "message-type-win";
    } else {
        bannerClass += "message-type-push";
    }
    roundBanner.className = bannerClass;
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
    else if (state.phase === "shop-choice") {
        tableStatus.textContent = "Boss defeated. Visit the shop and choose one reward.";
    }
    else if (state.phase === "run-over") {
        tableStatus.textContent = "Run over. Host can reset and start again.";
    }
    else {
        tableStatus.textContent = "Waiting for host to start next round.";
    }

    updateDealerTierMotion(state.dealerTier || 1);
    updateAtmosphere(state);
    dealerCards.innerHTML = renderCards(state.dealer.hand || [], { owner: "dealer" });
    dealerValue.textContent = `HAND: ${state.dealer.handValue || 0}`;
    dealerCombatStats.textContent = `${state.dealer.isBoss ? "Boss" : "Dealer"} ${state.dealer.name || "Dealer"}  •  Tier ${state.dealerTier || 1}  •  ATK ${state.dealer.attackDamage}`;

    renderBattleBar(state);
    renderPlayers(state.players, state.currentTurnId, state.phase);
    renderSummary(state.lastRoundSummary);
    renderAbilityControls(state);
    renderComboPresentation(state);
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

function setEscMenuOpen(open) {
    escMenuOpen = !!open;
    if (escMenuOverlay) {
        if (escMenuOpen) {
            escMenuOverlay.removeAttribute("hidden");
        }
        else {
            escMenuOverlay.setAttribute("hidden", "");
        }
    }

    if (menuBurgerButton) {
        menuBurgerButton.setAttribute("aria-expanded", escMenuOpen ? "true" : "false");
    }
}

function canOpenEscMenu() {
    return !upgradeModalVisible && !blessingModalVisible && !shopModalVisible && !!(matchOverSection && matchOverSection.hidden);
}

function openEscMenu() {
    if (!canOpenEscMenu()) {
        return;
    }

    setEscMenuOpen(true);
    if (escResumeButton) {
        escResumeButton.focus();
    }
}

function closeEscMenu() {
    setEscMenuOpen(false);
    if (menuBurgerButton) {
        menuBurgerButton.focus();
    }
}

if (menuBurgerButton) {
    menuBurgerButton.addEventListener("click", () => {
        if (escMenuOpen) {
            closeEscMenu();
        }
        else {
            openEscMenu();
        }
    });
}

if (escResumeButton) {
    escResumeButton.addEventListener("click", () => {
        closeEscMenu();
    });
}

if (escExitButton) {
    escExitButton.addEventListener("click", () => {
        setEscMenuOpen(false);
        goToMenuFromGame();
    });
}

if (escMenuOverlay) {
    escMenuOverlay.addEventListener("click", event => {
        if (event.target === escMenuOverlay) {
            closeEscMenu();
        }
    });
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
        if (escMenuOpen) {
            closeEscMenu();
        }
        else {
            openEscMenu();
        }
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
