(() => {
    async function requestJson(path, payload = {}) {
        const response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));
        return { response, data };
    }

    async function requestAuthedJson(path, payload = {}) {
        if (!window.bjAuth) {
            throw new Error("Missing auth storage module");
        }

        return requestJson(path, {
            token: window.bjAuth.getToken(),
            ...payload
        });
    }

    window.bjApi = {
        requestJson,
        requestAuthedJson
    };
})();