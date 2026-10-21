(() => {
    const global = /** @type {any} */ (window);
    document.getElementById('theme-toggle')?.addEventListener('click', global.HalaCore.toggleTheme);
})();
