const { Client } = require("pg");

function requireDatabaseUrl() {
    const databaseUrl = process.env.DATABASE_URL || "";

    if (!databaseUrl) {
        throw new Error("DATABASE_URL is required.");
    }

    return databaseUrl;
}

function makeClient() {
    const databaseUrl = requireDatabaseUrl();
    const useSsl = String(process.env.PGSSLMODE || "require").toLowerCase() !== "disable";

    return new Client({
        connectionString: databaseUrl,
        ssl: useSsl ? { rejectUnauthorized: false } : false
    });
}

module.exports = {
    makeClient
};
