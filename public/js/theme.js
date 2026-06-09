(() => {
    const THEME_KEY = "smackjackTheme";

    function applyTheme(theme) {
        const next = theme === "dark" ? "dark" : "light";
        document.documentElement.classList.toggle("theme-dark", next === "dark");
        localStorage.setItem(THEME_KEY, next);
        return next;
    }

    const savedTheme = localStorage.getItem(THEME_KEY) || "light";
    const activeTheme = applyTheme(savedTheme);

    window.bjTheme = {
        THEME_KEY,
        getTheme: () => localStorage.getItem(THEME_KEY) || activeTheme,
        setTheme: applyTheme
    };
})();
