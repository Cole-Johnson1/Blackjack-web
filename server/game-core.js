const BASE_PLAYER = {
    health: 30,
    attackDamage: 5,
    maxMana: 6
};

const BALANCE = {
    progression: {
        roundsPerChapter: 5,
        accountUnlockStep: 5,
        runXp: {
            baseToNext: 10,
            perLevel: 5,
            winGrant: 5
        },
        accountXp: {
            baseToNext: 50,
            perLevel: 30,
            perRound: {
                win: 10,
                push: 5,
                loss: 3,
                runLengthPerRound: 0.06,
                runLengthCap: 1.25
            },
            runOver: {
                base: 18,
                roundsBeforeScale: 3,
                perRound: 0.08,
                cap: 1.5
            }
        }
    },
    dealer: {
        baseHealth: 16,
        healthPerChapter: 5,
        healthPerRoundInChapter: 2,
        healthPerTier: 25,
        healthPerExtraPlayer: 20,
        baseAttack: 4,
        attackPerChapter: 1,
        attackPerTier: 4,
        attackPerExtraPlayer: 4,
        bossHealthMult: 1.65,
        bossAttackMult: 1.4
    },
    combat: {
        playerDamageFloor: 1,
        combo: {
            kingKuntaMult: 3,
            kevinHeartsHealPerHeart: 4,
            emberStrikeMult: 2,
            battleTrance: {
                maxStacks: 4,
                perStackMult: 0.2,
                capMult: 0.8
            },
            focusSigilMult: 0.5,
            focusSigilEmberBonusMult: 0.5,
            overchargePerManaSpent: 2,
            overchargeManaSurgeBonus: 4,
            executioner: {
                scoreThreshold: 19,
                baseBonus: 6,
                arcaneDrawBonus: 10
            },
            splitTorrent: {
                basePerWin: 8,
                emberPerWin: 4
            },
            siphonStrike: {
                bonusPerWin: 4,
                heal: 6,
                shieldOnCast: 6
            }
        }
    }
};

const ROUNDS_PER_CHAPTER = BALANCE.progression.roundsPerChapter;
const BLESSING_OPTION_COUNT = 3;
const SHOP_OPTION_COUNT = 3;
const ACCOUNT_LEVEL_UNLOCK_STEP = BALANCE.progression.accountUnlockStep;

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
    countingCards: {
        id: "countingCards",
        name: "Counting Cards",
        type: "active",
        manaCost: 2,
        description: "Reveal the dealer's hidden card for this round."
    },
    evilBong: {
        id: "evilBong",
        name: "Evil Bong",
        type: "active",
        manaCost: 3,
        description: "Transmute the dealer's hidden card into a 4."
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
    },
    kingKunta: {
        id: "kingKunta",
        name: "King Kunta",
        type: "passive",
        manaCost: 0,
        description: "Passive: any winning hand that holds a King deals 3x damage."
    },
    kevinHearts: {
        id: "kevinHearts",
        name: "Kevin Hearts",
        type: "passive",
        manaCost: 0,
        description: "Passive: each Heart card in your settled hands restores 4 HP."
    }
};

function calculateXpToNext(level) {
    return BALANCE.progression.runXp.baseToNext
        + (Math.max(1, level) - 1) * BALANCE.progression.runXp.perLevel;
}

function calculateAccountXpToNext(level) {
    return BALANCE.progression.accountXp.baseToNext
        + (Math.max(1, level) - 1) * BALANCE.progression.accountXp.perLevel;
}

function getProfilePictureById(id) {
    return PROFILE_PICTURES.find(pic => pic.id === id) || null;
}

function resolveProfilePicturePath(profilePictureId) {
    const picture = getProfilePictureById(profilePictureId) || getProfilePictureById(DEFAULT_PROFILE_PICTURE_ID);
    return picture ? picture.path : "assets/cards/back.svg";
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
        handsPlayed: 0,
        pendingStatChoices: 0,
        pendingBlessingChoices: 0,
        alive: true
    };
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

module.exports = {
    BASE_PLAYER,
    BALANCE,
    ROUNDS_PER_CHAPTER,
    BLESSING_OPTION_COUNT,
    SHOP_OPTION_COUNT,
    ACCOUNT_LEVEL_UNLOCK_STEP,
    PROFILE_PICTURES,
    DEFAULT_PROFILE_PICTURE_ID,
    DEALER_ARCHETYPES,
    SHOP_ITEMS,
    ABILITIES,
    calculateXpToNext,
    calculateAccountXpToNext,
    getProfilePictureById,
    resolveProfilePicturePath,
    normalizeUnlockedPictures,
    refreshAccountPictureUnlocks,
    grantAccountXp,
    getPublicProfilePicturesForAccount,
    makePlayerRunState,
    grantXp,
    getCardValue,
    getHandValue,
    isBlackjack,
    applyLevelUpStat
};