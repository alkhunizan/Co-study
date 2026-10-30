/* Public navigation only. Existing page language/theme listeners stay attached
 * when their controls move; the study workspace never opts into this shell. */
(function attachPublicShell() {
    function boot() {
        const body = document.body;
        if (!body.hasAttribute('data-public-page') || body.hasAttribute('data-shell-ready')) return;
        body.setAttribute('data-shell-ready', '');
        const core = window.HalaCore;
        const header = document.querySelector('.topbar');
        const controls = header.querySelector('.topbar-right');
        const language = controls.querySelector('.lang-switch');
        let theme = controls.querySelector('#theme-toggle');
        if (!theme) {
            theme = document.createElement('button');
            theme.id = 'theme-toggle';
            theme.className = 'icon-btn';
            theme.setAttribute('type', 'button');
            theme.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z"/></svg>';
            theme.addEventListener('click', core.toggleTheme);
            controls.appendChild(theme);
        }
        language.setAttribute('role', 'group');

        const copy = {
            en: { home: 'Home', rooms: 'Open a room', lobby: 'Lobby', blog: 'Journal', account: 'Account', contact: 'Contact', privacy: 'Privacy', terms: 'Terms', menu: 'Menu', navigation: 'Primary navigation', language: 'Language', theme: 'Toggle theme' },
            ar: { home: 'الرئيسية', rooms: 'افتح غرفة', lobby: 'اللوبي', blog: 'المدونة', account: 'الحساب', contact: 'تواصل معنا', privacy: 'الخصوصية', terms: 'الشروط', menu: 'القائمة', navigation: 'التنقل الرئيسي', language: 'اللغة', theme: 'تبديل المظهر' }
        };
        const destinations = [
            ['rooms', '/open'], ['lobby', '/lobby'], ['blog', '/blog'],
            ['account', '/account.html'], ['contact', '/contact']
        ];
        const currentPath = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
        function link(key, href) {
            const anchor = document.createElement('a');
            anchor.href = href;
            anchor.dataset.shellCopy = key;
            if (href.replace(/\.html$/, '') === currentPath) anchor.setAttribute('aria-current', 'page');
            return anchor;
        }
        const desktop = document.createElement('nav');
        desktop.className = 'nav-links public-nav';
        const mobile = document.createElement('nav');
        mobile.className = 'mobile-menu';
        mobile.id = 'mobile-menu';
        mobile.hidden = true;
        for (const [key, href] of destinations) {
            desktop.appendChild(link(key, href));
            const item = link(key, href);
            item.className = 'menu-link';
            mobile.appendChild(item);
        }
        const menuControls = document.createElement('div');
        menuControls.className = 'mobile-menu-controls';
        mobile.appendChild(menuControls);
        header.insertBefore(desktop, controls);
        header.after(mobile);

        const burger = document.createElement('button');
        burger.id = 'nav-burger';
        burger.className = 'icon-btn nav-burger';
        burger.type = 'button';
        burger.setAttribute('aria-expanded', 'false');
        burger.setAttribute('aria-controls', mobile.id);
        burger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><g class="i-menu"><path d="M4 6h16M4 12h16M4 18h16"/></g><g class="i-close"><path d="m6 6 12 12M6 18 18 6"/></g></svg>';
        controls.appendChild(burger);

        let footer = document.querySelector('footer');
        if (!footer) {
            footer = document.createElement('footer');
            footer.className = 'footer';
            body.appendChild(footer);
        }
        const footerLinks = document.createElement('div');
        footerLinks.className = 'links';
        for (const [key, href] of [['home', '/'], ['privacy', '/privacy'], ['terms', '/terms'], ['contact', '/contact']]) {
            const existing = footer.querySelector(`a[href="${href}"]`);
            if (existing) {
                if (key !== 'home') existing.setAttribute('data-shell-copy', key);
                if (href === currentPath) existing.setAttribute('aria-current', 'page');
            } else footerLinks.appendChild(link(key, href));
        }
        if (footerLinks.childElementCount) footer.appendChild(footerLinks);

        function closeMenu(restoreFocus = false) {
            mobile.hidden = true;
            burger.setAttribute('aria-expanded', 'false');
            if (restoreFocus) burger.focus();
        }
        burger.addEventListener('click', () => {
            if (!mobile.hidden) return closeMenu();
            mobile.hidden = false;
            burger.setAttribute('aria-expanded', 'true');
            mobile.querySelector('a').focus();
        });
        mobile.addEventListener('click', (event) => {
            if (/** @type {Element} */ (event.target).closest('a')) closeMenu();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !mobile.hidden) {
                event.preventDefault();
                closeMenu(true);
            }
        });
        document.addEventListener('click', (event) => {
            const target = /** @type {Node} */ (event.target);
            if (!mobile.hidden && !mobile.contains(target) && !burger.contains(target)) closeMenu();
        });
        document.addEventListener('focusin', (event) => {
            const target = /** @type {Node} */ (event.target);
            if (!mobile.hidden && !mobile.contains(target) && !burger.contains(target)) closeMenu();
        });
        // Tab can enter browser chrome without another focusin. Check only
        // keyboard exits: Safari touch clicks need not focus their button.
        mobile.addEventListener('keydown', (event) => {
            if (event.key !== 'Tab') return;
            requestAnimationFrame(() => {
                const target = document.activeElement;
                if (!mobile.hidden && !mobile.contains(target) && !burger.contains(target)) closeMenu();
            });
        });
        const narrow = matchMedia('(max-width: 1099px)');
        let layoutIsNarrow = narrow.matches;
        let resizeFocus = null;
        // CSS can blur a newly hidden control before the media-query event.
        document.addEventListener('focusout', (event) => {
            const target = /** @type {Element} */ (event.target);
            if (narrow.matches !== layoutIsNarrow && (header.contains(target) || mobile.contains(target))) resizeFocus = target;
        });
        function placeControls() {
            const focused = document.activeElement === body && resizeFocus ? resizeFocus : document.activeElement;
            layoutIsNarrow = narrow.matches;
            resizeFocus = null;
            const movingControl = language.contains(focused) || theme === focused;
            const movingNavigation = mobile.contains(focused) || desktop.contains(focused) || burger === focused;
            closeMenu();
            const destination = narrow.matches ? menuControls : controls;
            destination.appendChild(language);
            destination.appendChild(theme);
            if (movingControl || movingNavigation) {
                if (narrow.matches) burger.focus();
                else if (movingControl) /** @type {HTMLElement} */ (focused).focus();
                else {
                    const href = focused.getAttribute('href');
                    const counterpart = [...desktop.querySelectorAll('a')].find(anchor => anchor.getAttribute('href') === href);
                    (counterpart || desktop.querySelector('a')).focus();
                }
            }
        }
        narrow.addEventListener('change', placeControls);
        placeControls();

        function translate() {
            const lang = document.documentElement.lang === 'en' ? 'en' : 'ar';
            const text = copy[lang];
            document.querySelectorAll('[data-shell-copy]').forEach((element) => {
                element.textContent = text[element.getAttribute('data-shell-copy')];
            });
            desktop.setAttribute('aria-label', text.navigation);
            mobile.setAttribute('aria-label', text.navigation);
            burger.setAttribute('aria-label', text.menu);
            language.setAttribute('aria-label', text.language);
            theme.setAttribute('aria-label', text.theme);
            theme.setAttribute('title', text.theme);
            language.querySelectorAll('button').forEach(button => {
                button.setAttribute('aria-pressed', String(button.getAttribute('data-lang-value') === lang));
                // Visible text (EN / ع) stays the accessible name; a different
                // aria-label fails label-content-name-mismatch for voice users.
                button.setAttribute('title', button.getAttribute('data-lang-value') === 'ar' ? 'العربية' : 'English');
            });
        }
        if (body.hasAttribute('data-legal-page')) core.initLang({});
        new MutationObserver(translate).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
        translate();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
