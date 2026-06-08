(() => {
    const TOKEN_KEY = "blackjackToken";
    const DISPLAY_NAME_KEY = "blackjackDisplayName";
    const REMEMBER_TOKEN_KEY = "blackjackRememberToken";

    function storageForRead() {
        return localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage;
    }

    function hasPersistentSession() {
        return !!localStorage.getItem(REMEMBER_TOKEN_KEY);
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY)
            || sessionStorage.getItem(TOKEN_KEY)
            || "";
    }

    function getDisplayName() {
        return localStorage.getItem(DISPLAY_NAME_KEY)
            || sessionStorage.getItem(DISPLAY_NAME_KEY)
            || "";
    }

    function getRememberToken() {
        return localStorage.getItem(REMEMBER_TOKEN_KEY) || "";
    }

    function setSession(token, displayName, rememberLogin, rememberToken = "") {
        const target = rememberLogin ? localStorage : sessionStorage;
        const other = rememberLogin ? sessionStorage : localStorage;

        other.removeItem(TOKEN_KEY);
        other.removeItem(DISPLAY_NAME_KEY);

        target.setItem(TOKEN_KEY, String(token || ""));
        target.setItem(DISPLAY_NAME_KEY, String(displayName || ""));

        if (rememberLogin) {
            if (rememberToken) {
                localStorage.setItem(REMEMBER_TOKEN_KEY, String(rememberToken));
            }
        }
        else {
            localStorage.removeItem(REMEMBER_TOKEN_KEY);
        }
    }

    function clearAuth() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(DISPLAY_NAME_KEY);
        localStorage.removeItem(REMEMBER_TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(DISPLAY_NAME_KEY);
    }

    async function restoreSessionFromRememberToken() {
        const rememberToken = getRememberToken();

        if (!rememberToken) {
            return false;
        }

        try {
            const response = await fetch("/api/remember-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rememberToken })
            });

            if (!response.ok) {
                localStorage.removeItem(REMEMBER_TOKEN_KEY);
                return false;
            }

            const data = await response.json();
            setSession(data.token, data.displayName, true, data.rememberToken || rememberToken);
            return true;
        }
        catch {
            return false;
        }
    }

    async function ensureSession() {
        const token = getToken();

        if (token) {
            try {
                const response = await fetch("/api/session", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token })
                });

                if (response.ok) {
                    return true;
                }
            }
            catch {
                // Ignore and attempt remember recovery below.
            }
        }

        return restoreSessionFromRememberToken();
    }

    // Allows legacy code to update display name without changing session persistence.
    function setDisplayName(name) {
        const target = storageForRead();
        target.setItem(DISPLAY_NAME_KEY, String(name || ""));
    }

    window.bjAuth = {
        TOKEN_KEY,
        DISPLAY_NAME_KEY,
        REMEMBER_TOKEN_KEY,
        getToken,
        getDisplayName,
        getRememberToken,
        setSession,
        clearAuth,
        hasPersistentSession,
        setDisplayName,
        restoreSessionFromRememberToken,
        ensureSession
    };
})();
