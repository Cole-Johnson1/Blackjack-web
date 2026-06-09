if (!window.bjAuth) {
    window.location.href = "index.html";
}

const accountForm = document.getElementById("accountForm");
const accountUsername = document.getElementById("accountUsername");
const accountDisplayName = document.getElementById("accountDisplayName");
const accountProfilePicture = document.getElementById("accountProfilePicture");
const accountCurrentPin = document.getElementById("accountCurrentPin");
const accountNewPin = document.getElementById("accountNewPin");
const accountConfirmPin = document.getElementById("accountConfirmPin");
const accountAvatarPreview = document.getElementById("accountAvatarPreview");
const accountMessage = document.getElementById("accountMessage");

function showMessage(text, isError = false) {
    accountMessage.hidden = false;
    accountMessage.textContent = text;
    accountMessage.className = isError ? "message message-error" : "message";
}

function refreshAvatar() {
    const raw = String(accountProfilePicture.value || "").trim();
    accountAvatarPreview.src = raw || "assets/cards/back.svg";
}

async function loadAccount() {
    const token = window.bjAuth.getToken();

    const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
    });

    if (!response.ok) {
        throw new Error("Unable to load account.");
    }

    const data = await response.json();
    accountUsername.value = data.username || "";
    accountDisplayName.value = data.displayName || "";
    accountProfilePicture.value = data.profilePicture || "";
    refreshAvatar();
}

window.bjAuth.ensureSession().then(async isValid => {
    if (!isValid) {
        window.bjAuth.clearAuth();
        window.location.href = "index.html";
        return;
    }

    try {
        await loadAccount();
    }
    catch (error) {
        showMessage(error.message || "Unable to load account.", true);
    }
});

accountProfilePicture.addEventListener("input", refreshAvatar);
accountAvatarPreview.addEventListener("error", () => {
    accountAvatarPreview.src = "assets/cards/back.svg";
});

accountForm.addEventListener("submit", async event => {
    event.preventDefault();

    const token = window.bjAuth.getToken();
    const displayName = accountDisplayName.value.trim();
    const profilePicture = accountProfilePicture.value.trim();
    const currentPin = accountCurrentPin.value;
    const newPin = accountNewPin.value;
    const confirmPin = accountConfirmPin.value;

    if (newPin || confirmPin) {
        if (newPin !== confirmPin) {
            showMessage("New PIN and confirmation do not match.", true);
            return;
        }
    }

    try {
        const response = await fetch("/api/account/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token,
                displayName,
                profilePicture,
                currentPin,
                newPin
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showMessage(data.error || "Unable to update account.", true);
            return;
        }

        window.bjAuth.setDisplayName(data.displayName || displayName);
        accountCurrentPin.value = "";
        accountNewPin.value = "";
        accountConfirmPin.value = "";
        showMessage("Account updated successfully.");
        refreshAvatar();
    }
    catch {
        showMessage("Network error while updating account.", true);
    }
});
