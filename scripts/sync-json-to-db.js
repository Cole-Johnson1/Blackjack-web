const fs = require("fs");
const path = require("path");
const { makeClient } = require("./db-util");

function readJson(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) {
        return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
}

async function syncAccounts(client, accounts) {
    for (const [username, account] of Object.entries(accounts)) {
        await client.query(
            `
            INSERT INTO accounts (
                username,
                display_name,
                pin_hash,
                profile_picture,
                selected_profile_picture_id,
                unlocked_profile_pictures,
                account_level,
                account_xp,
                account_xp_to_next,
                account_total_xp,
                remember_tokens,
                is_admin,
                is_disabled,
                created_at,
                updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, NOW()
            )
            ON CONFLICT (username) DO UPDATE
            SET
                display_name = EXCLUDED.display_name,
                pin_hash = EXCLUDED.pin_hash,
                profile_picture = EXCLUDED.profile_picture,
                selected_profile_picture_id = EXCLUDED.selected_profile_picture_id,
                unlocked_profile_pictures = EXCLUDED.unlocked_profile_pictures,
                account_level = EXCLUDED.account_level,
                account_xp = EXCLUDED.account_xp,
                account_xp_to_next = EXCLUDED.account_xp_to_next,
                account_total_xp = EXCLUDED.account_total_xp,
                remember_tokens = EXCLUDED.remember_tokens,
                is_admin = EXCLUDED.is_admin,
                is_disabled = EXCLUDED.is_disabled,
                created_at = EXCLUDED.created_at,
                updated_at = NOW()
            `,
            [
                username,
                String(account.displayName || username),
                String(account.pinHash || ""),
                String(account.profilePicture || ""),
                String(account.selectedProfilePictureId || "rookie_1"),
                JSON.stringify(Array.isArray(account.unlockedProfilePictures) ? account.unlockedProfilePictures : []),
                Number(account.accountLevel || 1),
                Number(account.accountXp || 0),
                Number(account.accountXpToNext || 50),
                Number(account.accountTotalXp || 0),
                JSON.stringify(Array.isArray(account.rememberTokens) ? account.rememberTokens : []),
                !!account.isAdmin,
                !!account.isDisabled,
                Number(account.createdAt || Date.now())
            ]
        );
    }
}

async function syncProfiles(client, profiles) {
    for (const [displayName, profile] of Object.entries(profiles)) {
        await client.query(
            `
            INSERT INTO profiles (
                display_name,
                balance,
                wins,
                losses,
                pushes,
                games_played,
                total_earnings,
                runs_completed,
                highest_chapter,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (display_name) DO UPDATE
            SET
                balance = EXCLUDED.balance,
                wins = EXCLUDED.wins,
                losses = EXCLUDED.losses,
                pushes = EXCLUDED.pushes,
                games_played = EXCLUDED.games_played,
                total_earnings = EXCLUDED.total_earnings,
                runs_completed = EXCLUDED.runs_completed,
                highest_chapter = EXCLUDED.highest_chapter,
                updated_at = NOW()
            `,
            [
                displayName,
                Number(profile.balance || 1000),
                Number(profile.wins || 0),
                Number(profile.losses || 0),
                Number(profile.pushes || 0),
                Number(profile.gamesPlayed || 0),
                Number(profile.totalEarnings || 0),
                Number(profile.runsCompleted || 0),
                Number(profile.highestChapter || 1)
            ]
        );
    }
}

async function syncSoloRuns(client, soloRuns) {
    for (const [displayName, run] of Object.entries(soloRuns)) {
        const gameState = run && run.game ? run.game : {};
        const playerRunState = run && run.playerRun ? run.playerRun : {};

        await client.query(
            `
            INSERT INTO solo_runs (
                display_name,
                updated_at,
                game_state,
                player_run_state,
                updated_ts
            )
            VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
            ON CONFLICT (display_name) DO UPDATE
            SET
                updated_at = EXCLUDED.updated_at,
                game_state = EXCLUDED.game_state,
                player_run_state = EXCLUDED.player_run_state,
                updated_ts = NOW()
            `,
            [
                displayName,
                Number(run && run.updatedAt ? run.updatedAt : Date.now()),
                JSON.stringify(gameState),
                JSON.stringify(playerRunState)
            ]
        );
    }
}

async function main() {
    const root = path.join(__dirname, "..");
    const accountsPath = path.join(root, "data", "accounts.json");
    const profilesPath = path.join(root, "data", "leaderboard.json");
    const soloRunsPath = path.join(root, "data", "solo-runs.json");

    const accounts = readJson(accountsPath);
    const profiles = readJson(profilesPath);
    const soloRuns = readJson(soloRunsPath);

    const client = makeClient();
    await client.connect();

    try {
        await client.query("BEGIN");
        await syncAccounts(client, accounts);
        await syncProfiles(client, profiles);
        await syncSoloRuns(client, soloRuns);
        await client.query("COMMIT");

        console.log(
            `Synced ${Object.keys(accounts).length} accounts, ${Object.keys(profiles).length} profiles, ${Object.keys(soloRuns).length} solo runs.`
        );
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        await client.end();
    }
}

main().catch(error => {
    console.error("Failed to sync JSON data to database:", error.message);
    process.exit(1);
});
