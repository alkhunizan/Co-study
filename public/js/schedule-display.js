(function attachSchedule(global) {
    const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    function format(value, language = 'en', timeZone = zone()) {
        return `${new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
            calendar: 'gregory', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            timeZone, timeZoneName: 'shortOffset'
        }).format(new Date(Number(value)))} (${timeZone})`;
    }
    const api = { zone, format };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.HalaSchedule = api;
})(typeof window === 'undefined' ? globalThis : window);
