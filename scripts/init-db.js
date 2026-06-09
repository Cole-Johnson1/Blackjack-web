const fs = require("fs");
const path = require("path");
const { makeClient } = require("./db-util");

async function main() {
    const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf8");

    const client = makeClient();

    await client.connect();

    try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("COMMIT");
        console.log("Database schema initialized.");
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
    console.error("Failed to initialize database schema:", error.message);
    process.exit(1);
});
