if (!window.bjAuth) {
    window.location.href = "index.html";
}

const accountForm = document.getElementById("accountForm");
const accountUsername = document.getElementById("accountUsername");
const accountDisplayName = document.getElementById("accountDisplayName");
const accountCurrentPin = document.getElementById("accountCurrentPin");
const accountNewPin = document.getElementById("accountNewPin");
const accountConfirmPin = document.getElementById("accountConfirmPin");
const accountAvatarPreview = document.getElementById("accountAvatarPreview");
const accountAvatarChoices = document.getElementById("accountAvatarChoices");
const accountLevelText = document.getElementById("accountLevelText");
const accountXpFill = document.getElementById("accountXpFill");
const accountXpText = document.getElementById("accountXpText");
const accountMessage = document.getElementById("accountMessage");

let selectedProfilePictureId = "";
let availableProfilePictures = [];

function showMessage(text, isError = false) {
    accountMessage.hidden = false;
    accountMessage.textContent = text;
    accountMessage.className = isError ? "message message-error" : "message";
}

function getSelectedAvatarPath() {
    const selected = availableProfilePictures.find(pic => pic.id === selectedProfilePictureId);
    return selected ? selected.path : "assets/cards/back.svg";
}

function refreshAvatar() {
    accountAvatarPreview.src = getSelectedAvatarPath();
}

function renderProgress(level, xp, xpToNext) {
    const safeLevel = Math.max(1, Number(level) || 1);
    const safeXp = Math.max(0, Number(xp) || 0);
    const safeXpToNext = Math.max(1, Number(xpToNext) || 1);
    const pct = Math.max(0, Math.min(100, (safeXp / safeXpToNext) * 100));

    accountLevelText.textContent = `Lv ${safeLevel}`;
    accountXpFill.style.width = `${pct.toFixed(1)}%`;
    accountXpText.textContent = `${safeXp} / ${safeXpToNext} XP`;
}

function renderAvatarChoices() {
    accountAvatarChoices.innerHTML = "";

    availableProfilePictures.forEach(pic => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "avatar-choice";
        button.dataset.avatarId = pic.id;

        if (pic.unlocked) {
            if (pic.id === selectedProfilePictureId) {
                button.classList.add("selected");
            }
        }
        else {
            button.classList.add("locked");
            button.disabled = true;
        }

        button.innerHTML = `
            <img src="${pic.path}" alt="${pic.name}">
            <span class="avatar-choice-name">${pic.name}</span>
            <span class="avatar-choice-meta">${pic.unlocked ? "Unlocked" : `Unlocks at Lv ${pic.unlockLevel}`}</span>
        `;

        if (pic.unlocked) {
            button.addEventListener("click", () => {
                selectedProfilePictureId = pic.id;
                renderAvatarChoices();
                refreshAvatar();
            });
        }

        accountAvatarChoices.appendChild(button);
    });
}

async function loadAccount() {
    const { response, data } = await window.bjApi.requestAuthedJson("/api/account");

    if (!response.ok) {
        throw new Error("Unable to load account.");
    }

    accountUsername.value = data.username || "";
    accountDisplayName.value = data.displayName || "";
    availableProfilePictures = Array.isArray(data.profilePictures) ? data.profilePictures : [];
    selectedProfilePictureId = data.selectedProfilePictureId || (availableProfilePictures[0] && availableProfilePictures[0].id) || "";
    renderProgress(data.accountLevel, data.accountXp, data.accountXpToNext);
    renderAvatarChoices();
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

accountAvatarPreview.addEventListener("error", () => {
    accountAvatarPreview.src = "assets/cards/back.svg";
});

accountForm.addEventListener("submit", async event => {
    event.preventDefault();

    const token = window.bjAuth.getToken();
    const displayName = accountDisplayName.value.trim();
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
        const { response, data } = await window.bjApi.requestAuthedJson("/api/account/update", {
            displayName,
            selectedProfilePictureId,
            currentPin,
            newPin
        });

        if (!response.ok) {
            showMessage(data.error || "Unable to update account.", true);
            return;
        }

        window.bjAuth.setDisplayName(data.displayName || displayName);
        availableProfilePictures = Array.isArray(data.profilePictures) ? data.profilePictures : availableProfilePictures;
        selectedProfilePictureId = data.selectedProfilePictureId || selectedProfilePictureId;
        renderProgress(data.accountLevel, data.accountXp, data.accountXpToNext);
        renderAvatarChoices();
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
