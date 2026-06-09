if (!window.bjAuth) {
    window.location.href = "index.html";
}

const rememberStatusText = document.getElementById("rememberStatusText");
const clearSavedLoginButton = document.getElementById("clearSavedLoginButton");
const lightModeButton = document.getElementById("lightModeButton");
const darkModeButton = document.getElementById("darkModeButton");
const optionsMessage = document.getElementById("optionsMessage");

function showMessage(text, isError = false) {
    optionsMessage.hidden = false;
    optionsMessage.textContent = text;
    optionsMessage.className = isError ? "message message-error" : "message";
}

function refreshRememberStatus() {
    rememberStatusText.textContent = window.bjAuth.hasPersistentSession() ? "on" : "off";
}

function refreshThemeButtons() {
    const active = (window.bjTheme && window.bjTheme.getTheme()) || "light";
    lightModeButton.disabled = active === "light";
    darkModeButton.disabled = active === "dark";
}

window.bjAuth.ensureSession().then(isValid => {
    if (!isValid) {
        window.bjAuth.clearAuth();
        window.location.href = "index.html";
        return;
    }

    refreshRememberStatus();
    refreshThemeButtons();
});

clearSavedLoginButton.addEventListener("click", () => {
    if (!window.bjAuth.hasPersistentSession()) {
        showMessage("No saved login found.");
        refreshRememberStatus();
        return;
    }

    localStorage.removeItem(window.bjAuth.REMEMBER_TOKEN_KEY);
    showMessage("Saved login cleared for future launches.");
    refreshRememberStatus();
});

lightModeButton.addEventListener("click", () => {
    if (window.bjTheme) {
        window.bjTheme.setTheme("light");
    }
    refreshThemeButtons();
    showMessage("Light mode enabled.");
});

darkModeButton.addEventListener("click", () => {
    if (window.bjTheme) {
        window.bjTheme.setTheme("dark");
    }
    refreshThemeButtons();
    showMessage("Dark mode enabled.");
});
