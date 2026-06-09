if (!window.bjAuth) {
    window.location.href = "index.html";
}

const adminAccountsBody = document.getElementById("adminAccountsBody");
const adminMessage = document.getElementById("adminMessage");
const adminRefreshButton = document.getElementById("adminRefreshButton");
const adminClearAccountsButton = document.getElementById("adminClearAccountsButton");

let currentUsername = "";

function showAdminMessage(text, isError = false) {
    adminMessage.hidden = false;
    adminMessage.textContent = text;
    adminMessage.className = isError ? "message message-error" : "message";
}

async function postAdmin(path, payload) {
    const { response, data } = await window.bjApi.requestAuthedJson(path, payload);

    if (!response.ok) {
        throw new Error(data.error || "Admin request failed.");
    }

    return data;
}

async function loadCurrentAccount() {
    const { response, data } = await window.bjApi.requestAuthedJson("/api/account");

    if (!response.ok) {
        throw new Error("Session expired.");
    }

    if (!data.isAdmin) {
        throw new Error("Admin privileges required.");
    }

    currentUsername = String(data.username || "").toLowerCase();
}

function renderAccounts(rows) {
    adminAccountsBody.innerHTML = "";

    if (!rows.length) {
        adminAccountsBody.innerHTML = "<tr><td colspan='7'>No accounts found.</td></tr>";
        return;
    }

    rows.forEach(row => {
        const tr = document.createElement("tr");

        const actions = document.createElement("td");
        actions.className = "actions";

        const toggleAdminButton = document.createElement("button");
        toggleAdminButton.type = "button";
        toggleAdminButton.textContent = row.isAdmin ? "Revoke Admin" : "Make Admin";
        toggleAdminButton.disabled = row.username === "admin";
        toggleAdminButton.addEventListener("click", async () => {
            try {
                await postAdmin("/api/admin/account/set-role", {
                    username: row.username,
                    isAdmin: !row.isAdmin
                });
                await loadAccounts();
            }
            catch (error) {
                showAdminMessage(error.message, true);
            }
        });

        const toggleDisabledButton = document.createElement("button");
        toggleDisabledButton.type = "button";
        toggleDisabledButton.textContent = row.isDisabled ? "Enable" : "Disable";
        toggleDisabledButton.disabled = row.username === "admin";
        toggleDisabledButton.addEventListener("click", async () => {
            try {
                await postAdmin("/api/admin/account/set-disabled", {
                    username: row.username,
                    isDisabled: !row.isDisabled
                });
                await loadAccounts();
            }
            catch (error) {
                showAdminMessage(error.message, true);
            }
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.disabled = row.username === "admin" || row.username === currentUsername;
        deleteButton.addEventListener("click", async () => {
            const confirmed = window.confirm(`Delete account ${row.username}? This cannot be undone.`);
            if (!confirmed) {
                return;
            }

            try {
                await postAdmin("/api/admin/account/delete", {
                    username: row.username
                });
                await loadAccounts();
            }
            catch (error) {
                showAdminMessage(error.message, true);
            }
        });

        actions.appendChild(toggleAdminButton);
        actions.appendChild(toggleDisabledButton);
        actions.appendChild(deleteButton);

        tr.innerHTML = `
            <td>${row.username}</td>
            <td>${row.displayName}</td>
            <td>${row.isAdmin ? "Yes" : "No"}</td>
            <td>${row.isDisabled ? "Yes" : "No"}</td>
            <td>${row.accountLevel || 1}</td>
            <td>${row.gamesPlayed || 0}</td>
        `;

        tr.appendChild(actions);
        adminAccountsBody.appendChild(tr);
    });
}

async function loadAccounts() {
    try {
        const data = await postAdmin("/api/admin/accounts", {});
        renderAccounts(Array.isArray(data.accounts) ? data.accounts : []);
        showAdminMessage(`Loaded ${Array.isArray(data.accounts) ? data.accounts.length : 0} accounts.`);
    }
    catch (error) {
        showAdminMessage(error.message, true);
    }
}

window.bjAuth.ensureSession().then(async isValid => {
    if (!isValid) {
        window.bjAuth.clearAuth();
        window.location.href = "index.html";
        return;
    }

    try {
        await loadCurrentAccount();
        await loadAccounts();
    }
    catch (error) {
        showAdminMessage(error.message, true);
        setTimeout(() => {
            window.location.href = "menu.html";
        }, 1000);
    }
});

adminRefreshButton.addEventListener("click", loadAccounts);

adminClearAccountsButton.addEventListener("click", async () => {
    const confirmed = window.confirm("Clear all accounts from the table? The built-in Admin account will be preserved.");

    if (!confirmed) {
        return;
    }

    try {
        const result = await postAdmin("/api/admin/account/clear", {});
        await loadAccounts();
        showAdminMessage(`Cleared ${Number(result.removedCount || 0)} accounts.`);
    }
    catch (error) {
        showAdminMessage(error.message, true);
    }
});
