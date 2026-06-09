const test = require("node:test");
const assert = require("node:assert/strict");

const { __testOnly } = require("../server");

const { makePlayerRunState, resolvePlayerRoundOutcome } = __testOnly;

function makeCard(value, suit = "S") {
    return { value, suit };
}

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