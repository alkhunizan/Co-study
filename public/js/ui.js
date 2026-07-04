/* Halastudy shared UI primitives — toast, confirm/modal, avatar chip.
 * Self-contained: injects its own CSS (design tokens only) so pages need a
 * single <script> tag and no extra stylesheet link. Modals build on native
 * <dialog>.showModal() — focus trap, Escape, and top-layer come free; focus
 * returns to the opener on close. */
(function attachHalastudyUI(global) {
    

    var CSS = [
        '#hala-toast-region{position:fixed;inset-block-end:20px;inset-inline-end:20px;display:flex;flex-direction:column;gap:10px;z-index:2147483000;pointer-events:none;max-inline-size:min(360px,calc(100vw - 40px));}',
        '.hala-toast{pointer-events:auto;display:flex;align-items:center;gap:10px;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding-block:10px;padding-inline:18px 8px;box-shadow:0 6px 24px rgba(28,24,20,0.14);font:500 var(--t-body-sm)/1.4 var(--font-body);opacity:1;transform:none;transition:opacity 220ms ease,transform 220ms ease;}',
        '.hala-toast[data-entering]{opacity:0;transform:translateY(8px);}',
        '.hala-toast[data-leaving]{opacity:0;transform:translateY(4px);}',
        '@media (prefers-reduced-motion: reduce){.hala-toast,.hala-toast[data-entering],.hala-toast[data-leaving]{transform:none;transition:opacity 150ms ease;}}',
        '.hala-toast--success{border-color:var(--success);}',
        '.hala-toast--error{border-color:var(--danger);}',
        '.hala-toast__dot{inline-size:8px;block-size:8px;border-radius:50%;flex:none;background:var(--ink-3);}',
        '.hala-toast--success .hala-toast__dot{background:var(--success);}',
        '.hala-toast--error .hala-toast__dot{background:var(--danger);}',
        '.hala-toast__msg{flex:1;min-inline-size:0;}',
        '.hala-toast__close{flex:none;inline-size:44px;block-size:44px;display:grid;place-items:center;border:0;background:transparent;color:var(--ink-3);border-radius:50%;cursor:pointer;font-size:16px;line-height:1;}',
        '.hala-toast__close:hover{color:var(--ink);background:var(--inset);}',
        '.hala-toast__close:focus-visible{outline:none;box-shadow:0 0 0 3px var(--accent-glow);}',
        'dialog.hala-modal{border:1px solid var(--line);border-radius:24px;background:var(--card);color:var(--ink);padding:28px;inline-size:min(560px,calc(100vw - 32px));box-shadow:0 24px 64px rgba(28,24,20,0.22);}',
        'dialog.hala-modal::backdrop{background:var(--overlay);}',
        '.hala-modal__title{margin:0;font:600 var(--t-h4)/1.3 var(--font-body);padding-block-end:12px;border-block-end:1px solid var(--line-2);}',
        '.hala-modal__body{margin-block:16px 20px;font:400 var(--t-body-sm)/1.6 var(--font-body);color:var(--ink-2);white-space:pre-line;}',
        '.hala-modal__input{inline-size:100%;margin-block-end:20px;padding-block:12px;padding-inline:16px;border:1px solid var(--line);border-radius:16px;background:var(--inset);color:var(--ink);font:400 var(--t-body)/1.4 var(--font-body);}',
        '.hala-modal__input:focus{outline:none;background:var(--card);box-shadow:0 0 0 3px var(--accent-glow);border-color:var(--accent);}',
        '.hala-modal__actions{display:flex;gap:10px;justify-content:flex-start;}',
        '.hala-modal__btn{min-block-size:44px;padding-block:10px;padding-inline:22px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:600 var(--t-body-sm)/1 var(--font-body);cursor:pointer;}',
        '.hala-modal__btn:active{transform:scale(0.98);}',
        '.hala-modal__btn:focus-visible{outline:none;box-shadow:0 0 0 3px var(--accent-glow);}',
        '.hala-modal__btn[disabled]{opacity:0.45;cursor:default;}',
        '.hala-modal__btn--confirm{background:var(--accent);border-color:var(--accent);color:var(--ink);}',
        '.hala-modal__btn--danger{background:var(--danger);border-color:var(--danger);color:var(--ink-inv);}',
        '.hala-chip{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;background:transparent;cursor:pointer;padding:6px;border-radius:999px;min-inline-size:44px;min-block-size:44px;}',
        '.hala-chip:focus-visible{outline:none;box-shadow:0 0 0 3px var(--accent-glow);}',
        '.hala-chip__avatar{inline-size:32px;block-size:32px;border-radius:50%;display:grid;place-items:center;font:600 var(--t-body-sm)/1 var(--font-body);color:var(--ink);background:var(--member-accent,var(--accent-soft));border:1px solid var(--line);}',
        '.hala-chip__menu{position:absolute;inset-block-start:calc(100% + 8px);inset-inline-end:0;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 12px 32px rgba(28,24,20,0.16);padding:6px;display:flex;flex-direction:column;min-inline-size:180px;z-index:1000;}',
        '.hala-chip__wrap{position:relative;display:inline-flex;}',
        '.hala-chip__item{display:block;text-align:start;border:0;background:transparent;color:var(--ink);padding-block:10px;padding-inline:14px;border-radius:10px;font:500 var(--t-body-sm)/1.2 var(--font-body);cursor:pointer;text-decoration:none;}',
        '.hala-chip__item:hover{background:var(--inset);}',
        '.hala-chip__item:focus-visible{outline:none;box-shadow:0 0 0 3px var(--accent-glow);}',
        '.hala-chip__item--danger{color:var(--danger);}'
    ].join('\n');

    function ensureCss() {
        if (document.getElementById('hala-ui-css')) return;
        var style = document.createElement('style');
        style.id = 'hala-ui-css';
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    /* ---------- toast ---------- */
    var TOAST_LIMIT = 3;

    function toastRegion() {
        var region = document.getElementById('hala-toast-region');
        if (!region) {
            region = document.createElement('div');
            region.id = 'hala-toast-region';
            document.body.appendChild(region);
        }
        return region;
    }

    function toast(message, options) {
        ensureCss();
        var opts = options || {};
        var kind = opts.kind === 'success' || opts.kind === 'error' ? opts.kind : 'info';
        var duration = typeof opts.duration === 'number' ? opts.duration : 4000;
        var region = toastRegion();

        while (region.children.length >= TOAST_LIMIT) {
            region.removeChild(region.firstChild);
        }

        var el = document.createElement('div');
        el.className = `hala-toast hala-toast--${kind}`;
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
        el.setAttribute('data-entering', '');

        var dot = document.createElement('span');
        dot.className = 'hala-toast__dot';
        dot.setAttribute('aria-hidden', 'true');
        var msg = document.createElement('span');
        msg.className = 'hala-toast__msg';
        msg.textContent = String(message);
        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'hala-toast__close';
        var hcore = (/** @type {any} */ (global)).HalaCore;
        close.setAttribute('aria-label', hcore && hcore.getLang() === 'ar' ? 'إغلاق' : 'Dismiss');
        close.textContent = '×';

        el.appendChild(dot);
        el.appendChild(msg);
        el.appendChild(close);
        region.appendChild(el);
        requestAnimationFrame(() => { el.removeAttribute('data-entering'); });

        var timer = null;
        function dismiss() {
            if (timer) clearTimeout(timer);
            if (!el.parentNode) return;
            el.setAttribute('data-leaving', '');
            setTimeout(() => {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 240);
        }
        function arm() {
            if (duration > 0) timer = setTimeout(dismiss, duration);
        }
        close.addEventListener('click', dismiss);
        el.addEventListener('mouseenter', () => { if (timer) clearTimeout(timer); });
        el.addEventListener('mouseleave', arm);
        arm();
        return { dismiss: dismiss };
    }

    /* ---------- confirm modal ---------- */
    function confirmDialog(options) {
        ensureCss();
        var opts = options || {};
        return new Promise((resolve) => {
            var dialog = document.createElement('dialog');
            dialog.className = 'hala-modal';

            var title = document.createElement('h2');
            title.className = 'hala-modal__title';
            title.id = `hala-modal-title-${Date.now()}`;
            title.textContent = opts.title || '';
            dialog.setAttribute('aria-labelledby', title.id);

            var body = document.createElement('p');
            body.className = 'hala-modal__body';
            body.textContent = opts.body || '';

            var input = null;
            if (opts.typedConfirmation) {
                input = document.createElement('input');
                input.className = 'hala-modal__input';
                input.type = 'text';
                input.setAttribute('autocomplete', 'off');
                input.setAttribute('dir', 'auto');
                input.setAttribute('aria-label', opts.typedConfirmation);
                input.placeholder = opts.typedConfirmation;
            }

            var actions = document.createElement('div');
            actions.className = 'hala-modal__actions';
            var confirmBtn = document.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.className = `hala-modal__btn ${opts.destructive ? 'hala-modal__btn--danger' : 'hala-modal__btn--confirm'}`;
            confirmBtn.textContent = opts.confirmLabel || 'OK';
            var cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'hala-modal__btn';
            cancelBtn.textContent = opts.cancelLabel || 'Cancel';
            actions.appendChild(confirmBtn);
            actions.appendChild(cancelBtn);

            dialog.appendChild(title);
            dialog.appendChild(body);
            if (input) dialog.appendChild(input);
            dialog.appendChild(actions);
            document.body.appendChild(dialog);

            if (input) {
                confirmBtn.disabled = true;
                input.addEventListener('input', () => {
                    confirmBtn.disabled = input.value.trim() !== opts.typedConfirmation;
                });
            }

            var settled = false;
            function finish(result) {
                if (settled) return;
                settled = true;
                dialog.close();
                resolve(result);
            }
            confirmBtn.addEventListener('click', () => { finish(true); });
            cancelBtn.addEventListener('click', () => { finish(false); });
            dialog.addEventListener('cancel', () => { finish(false); });
            dialog.addEventListener('close', () => {
                if (!settled) { settled = true; resolve(false); }
                dialog.remove();
            });

            dialog.showModal();
            if (input) input.focus();
        });
    }

    /* ---------- avatar chip ---------- */
    var AVATAR_COLORS = {
        amber: 'rgba(224, 176, 139, 0.35)',
        sage: 'rgba(90, 140, 92, 0.25)',
        terracotta: 'rgba(199, 85, 69, 0.22)',
        dusk: 'rgba(108, 143, 173, 0.25)',
        sand: 'rgba(212, 162, 86, 0.28)',
        stone: 'rgba(154, 160, 164, 0.28)'
    };

    /* Replaces `entry` (the #auth-entry link) with an avatar chip + popover
     * menu. menuItems: [{label, href}] or [{label, onSelect, danger}]. */
    function renderAuthChip(entry, user, options) {
        ensureCss();
        var opts = options || {};
        var wrap = document.createElement('span');
        wrap.className = 'hala-chip__wrap';

        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'hala-chip';
        chip.setAttribute('aria-haspopup', 'true');
        chip.setAttribute('aria-expanded', 'false');
        chip.setAttribute('aria-label', user.displayName || 'Account');

        var avatar = document.createElement('span');
        avatar.className = 'hala-chip__avatar';
        avatar.style.setProperty('--member-accent', AVATAR_COLORS[user.avatarColor] || AVATAR_COLORS.amber);
        avatar.textContent = (user.displayName || '?').trim().charAt(0).toUpperCase() || '?';
        chip.appendChild(avatar);
        wrap.appendChild(chip);

        var menu = null;
        function closeMenu() {
            if (menu) { menu.remove(); menu = null; chip.setAttribute('aria-expanded', 'false'); }
        }
        function openMenu() {
            if (menu) return closeMenu();
            menu = document.createElement('div');
            menu.className = 'hala-chip__menu';
            menu.setAttribute('role', 'menu');
            var items = opts.menuItems || [
                { label: opts.accountLabel || 'Account', href: '/account.html' }
            ];
            items.forEach((item) => {
                var node;
                if (item.href) {
                    node = document.createElement('a');
                    node.href = item.href;
                } else {
                    node = document.createElement('button');
                    node.type = 'button';
                    node.addEventListener('click', () => {
                        closeMenu();
                        if (item.onSelect) item.onSelect();
                    });
                }
                node.className = `hala-chip__item${item.danger ? ' hala-chip__item--danger' : ''}`;
                node.setAttribute('role', 'menuitem');
                node.textContent = item.label;
                menu.appendChild(node);
            });
            wrap.appendChild(menu);
            chip.setAttribute('aria-expanded', 'true');
            const first = /** @type {HTMLElement|null} */ (menu.querySelector('a,button'));
            if (first) first.focus();
        }
        chip.addEventListener('click', openMenu);
        document.addEventListener('click', (event) => {
            if (menu && !wrap.contains(/** @type {Node} */ (event.target))) closeMenu();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeMenu();
        });

        entry.replaceWith(wrap);
        return wrap;
    }

    (/** @type {any} */ (global)).HalaUI = {
        toast: toast,
        confirm: confirmDialog,
        renderAuthChip: renderAuthChip,
        avatarColors: AVATAR_COLORS
    };
})(window);
