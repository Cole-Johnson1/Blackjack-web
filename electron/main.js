const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const WEB_URL = process.env.SMACKJACK_URL || "http://localhost:3000";
let serverProcess = null;

function waitForServer(url, timeoutMs = 15000) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
        const tick = () => {
            const req = http.get(url, res => {
                res.resume();
                resolve();
            });

            req.on("error", () => {
                if (Date.now() - startedAt > timeoutMs) {
                    reject(new Error("Server startup timeout."));
                    return;
                }

                setTimeout(tick, 250);
            });
        };

        tick();
    });
}

function startLocalServer() {
    if (process.env.SMACKJACK_URL) {
        return Promise.resolve();
    }

    const serverEntry = path.join(__dirname, "..", "server.js");
    serverProcess = spawn(process.execPath, [serverEntry], {
        cwd: path.join(__dirname, ".."),
        stdio: "inherit",
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1"
        }
    });

    serverProcess.on("exit", code => {
        if (code !== 0) {
            console.error(`Embedded server exited with code ${code}`);
        }
    });

    return waitForServer(`${WEB_URL}/api/status`);
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 980,
        minHeight: 700,
        autoHideMenuBar: true,
        title: "SmackJack",
        webPreferences: {
            contextIsolation: true,
            sandbox: true
        }
    });

    win.loadURL(WEB_URL);

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });
}

app.whenReady().then(async () => {
    await startLocalServer();
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}).catch(error => {
    console.error("Failed to start SmackJack:", error);
    app.quit();
});

app.on("window-all-closed", () => {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
    }

    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", () => {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
    }
});
