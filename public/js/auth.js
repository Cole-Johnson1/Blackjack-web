function showMessage(text, isError = false) {
    const el = document.getElementById("authMessage");
    el.hidden = false;
    el.textContent = text;
    el.className = isError ? "message message-error" : "message";
}

if (!window.bjAuth) {
    showMessage("Auth bootstrap failed. Refresh and try again.", true);
    throw new Error("Missing auth storage module");
}

window.bjAuth.ensureSession().then(isValid => {
    if (isValid) {
        window.location.href = "menu.html";
    }
});

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authSubtitle = document.getElementById("authSubtitle");
const authSwitchButton = document.getElementById("authSwitchButton");
const rememberLoginCheckbox = document.getElementById("rememberLoginCheckbox");

let registerMode = false;

function renderAuthMode() {
    loginForm.hidden = registerMode;
    registerForm.hidden = !registerMode;

    if (registerMode) {
        authSubtitle.textContent = "Create an account to start your first run.";
        authSwitchButton.textContent = "Back to Login";
    }
    else {
        authSubtitle.textContent = "Sign in to continue your run.";
        authSwitchButton.textContent = "Need an Account?";
    }

    document.getElementById("authMessage").hidden = true;
}

authSwitchButton.addEventListener("click", () => {
    registerMode = !registerMode;
    renderAuthMode();
});

renderAuthMode();

document.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.tagName !== "BUTTON") {
        event.preventDefault();
        const activeForm = registerMode ? registerForm : loginForm;
        if (activeForm && !activeForm.hidden) {
            activeForm.dispatchEvent(new Event("submit"));
        }
    }
});

loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const username = document.getElementById("loginUsername").value.trim();
    const pin = document.getElementById("loginPin").value;
    const rememberLogin = !!rememberLoginCheckbox.checked;

    try {
        const { response: res, data } = await window.bjApi.requestJson("/api/login", {
            username,
            pin,
            rememberLogin
        });

        if (!res.ok) {
            showMessage(data.error || "Login failed.", true);
            return;
        }

        window.bjAuth.setSession(data.token, data.displayName, rememberLogin, data.rememberToken);
        window.location.href = "menu.html";
    }
    catch {
        showMessage("Network error. Please try again.", true);
    }
});

registerForm.addEventListener("submit", async event => {
    event.preventDefault();
    const username = document.getElementById("regUsername").value.trim();
    const displayName = document.getElementById("regDisplay").value.trim();
    const pin = document.getElementById("regPin").value;
    const pinConfirm = document.getElementById("regPinConfirm").value;

    if (pin !== pinConfirm) {
        showMessage("PINs do not match.", true);
        return;
    }

    try {
        const { response: res, data } = await window.bjApi.requestJson("/api/register", {
            username,
            displayName,
            pin
        });

        if (!res.ok) {
            showMessage(data.error || "Registration failed.", true);
            return;
        }

        showMessage("Account created! Signing you in...");

        const { response: loginRes, data: loginData } = await window.bjApi.requestJson("/api/login", {
            username,
            pin,
            rememberLogin: true
        });

        if (!loginRes.ok) {
            showMessage("Account created. Please log in.", false);
            return;
        }

        window.bjAuth.setSession(loginData.token, loginData.displayName, true, loginData.rememberToken);
        window.location.href = "menu.html";
    }
    catch {
        showMessage("Network error. Please try again.", true);
    }
});
