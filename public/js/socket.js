(() => {
    if (!window.bjAuth) {
        throw new Error("Missing auth storage module");
    }

    let recoveringSession = false;

    async function logout() {
        const token = window.bjAuth.getToken();

        if (token) {
            await fetch("/api/logout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token })
            }).catch(() => {});
        }

        window.bjAuth.clearAuth();
        window.location.href = "index.html";
    }

    function formatMoney(value) {
        const amount = Number(value || 0);
        return `$${amount.toLocaleString()}`;
    }

    window.bj = {
        getToken: window.bjAuth.getToken,
        getDisplayName: window.bjAuth.getDisplayName,
        setDisplayName: window.bjAuth.setDisplayName,
        clearAuth: window.bjAuth.clearAuth,
        logout,
        formatMoney
    };

    window.socket = io({ auth: { token: window.bjAuth.getToken() } });

    window.socket.on("connect_error", async err => {
        if (err.message === "AUTH_REQUIRED" || err.message === "AUTH_EXPIRED") {
            if (recoveringSession) {
                return;
            }

            recoveringSession = true;
            const restored = await window.bjAuth.restoreSessionFromRememberToken();

            if (restored) {
                window.socket.auth = { token: window.bjAuth.getToken() };
                window.socket.connect();
                recoveringSession = false;
                return;
            }

            window.bjAuth.clearAuth();
            window.location.href = "index.html";
        }
    });
})();
