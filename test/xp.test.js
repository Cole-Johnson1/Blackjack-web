const test = require("node:test");
const assert = require("node:assert/strict");

const { __testOnly } = require("../server");

const {
    makePlayerRunState,
    calculateXpToNext,
    grantXp,
    applyLevelUpStat,
    getHandValue,
    isBlackjack
} = __testOnly;

test("xp thresholds scale 10, 15, 20 for early levels", () => {
    assert.equal(calculateXpToNext(1), 10);
    assert.equal(calculateXpToNext(2), 15);
    assert.equal(calculateXpToNext(3), 20);
});

test("new run state starts at 0/10 xp", () => {
    const run = makePlayerRunState();
    assert.equal(run.level, 1);
    assert.equal(run.xp, 0);
    assert.equal(run.xpToNext, 10);
});

test("grantXp levels up after 2 wins-equivalent then 3 more", () => {
    const player = { run: makePlayerRunState() };

    // 2 round wins at +5 xp each
    grantXp(player, 10);
    assert.equal(player.run.level, 2);
    assert.equal(player.run.xp, 0);
    assert.equal(player.run.xpToNext, 15);
    assert.equal(player.run.pendingStatChoices, 1);

    // 3 more wins at +5 xp each
    grantXp(player, 15);
    assert.equal(player.run.level, 3);
    assert.equal(player.run.xp, 0);
    assert.equal(player.run.xpToNext, 20);
    assert.equal(player.run.pendingStatChoices, 2);
});

test("level-up stat upgrades apply expected values", () => {
    const player = { run: makePlayerRunState() };
    player.run.health = 24;

    applyLevelUpStat(player, "health");
    assert.equal(player.run.maxHealth, 36);
    assert.equal(player.run.health, 30);

    applyLevelUpStat(player, "attack");
    assert.equal(player.run.attackDamage, 7);

    applyLevelUpStat(player, "mana");
    assert.equal(player.run.maxMana, 8);
    assert.equal(player.run.mana, 8);
});

test("blackjack detection and hand value remain correct", () => {
    const blackjackHand = [{ value: "A", suit: "S" }, { value: "K", suit: "H" }];
    const softHand = [{ value: "A", suit: "S" }, { value: "9", suit: "H" }, { value: "9", suit: "D" }];

    assert.equal(isBlackjack(blackjackHand), true);
    assert.equal(getHandValue(blackjackHand), 21);
    assert.equal(getHandValue(softHand), 19);
});
