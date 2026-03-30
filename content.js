(() => {
    const AUTO_HIDE_STATUS_STORAGE_KEY = 'autoHideStatusCards';
    const DEBUG_LOGGING_STORAGE_KEY = 'debugLoggingEnabled';
    const SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY = 'saveCustomResponseFields';
    const LETTERS_STORAGE_KEY = 'coverLetters';
    const LOG_PREFIX = '[HeHe]';
    const CARD_SELECTOR = '[data-qa="vacancy-serp__vacancy"], [data-qa="serp-item"]';
    const APPLY_SELECTOR = '[data-qa="vacancy-serp__vacancy_response"]';
    const HIDE_VACANCY_API_PATH = '/applicant/blacklist/vacancy/add';
    const HIDE_EMPLOYER_API_PATH = '/applicant/blacklist/employer/add';
    const BLACKLIST_STATE_API_PATH = '/applicant/blacklist/state';
    const VACANCY_PAGE_MORE_ACTIONS_SELECTOR = 'button[data-qa="vacancy__more-actions"]';
    const VACANCY_PAGE_STATE_MARKER = 'data-hh-vacancy-page-state';
    const HIDE_BUTTON_MARKER = 'data-hh-hide-button';
    const VACANCY_PAGE_HIDE_BUTTON_MARKER = 'data-hh-vacancy-page-hide-button';
    const AUTO_HIDDEN_CARD_MARKER = 'data-hh-auto-hidden-card';
    const HIDDEN_CARD_MARKER = 'data-hh-hidden-card';
    const HIDE_POPUP_SUPPRESSION_MARKER = 'data-hh-hide-popup-suppressed';
    const LETTER_PICKER_MARKER = 'data-hh-cover-letter-picker';
    const RESPONSE_FORM_SELECTOR = 'form[name="vacancy_response"]';
    const COVER_LETTER_FORM_SELECTOR = 'form[id^="cover-letter-"]';
    const RESPONSE_NOTE_FORM_SELECTOR = `${RESPONSE_FORM_SELECTOR}, ${COVER_LETTER_FORM_SELECTOR}`;
    const RESPONSE_NOTE_CONTROL_MARKER = 'data-hh-response-note-control';
    const COVER_LETTER_TEXTAREA_SELECTORS = [
        'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
        '[data-qa="vacancy-response-letter-informer"] textarea[name="text"]',
        'form[id^="cover-letter-"] textarea[name="text"]'
    ];
    const RESPONSE_CUSTOM_FIELD_NAME_PATTERN = /^task_\d+_text$/i;
    const AUTO_HIDE_STATUS_SELECTORS = [
        '[data-qa="vacancy-serp__vacancy_responded"]',
        '[data-qa="vacancy-serp__vacancy_invited"]',
        '[data-qa="vacancy-serp__vacancy_discard"]'
    ];
    const AUTO_HIDE_STATUS_LABELS = ['вы откликнулись', 'вас пригласили', 'вам отказали'];
    const HIDE_MENU_LABELS = ['скрыть эту вакансию', 'не интересно'];
    const DIRECT_HIDE_CONTROL_SELECTORS = [
        '[data-qa="vacancy__blacklist-show-add"]',
        'button[aria-label="Скрыть"]'
    ];
    const VACANCY_PAGE_HIDE_MENU_LABELS = ['скрыть эту вакансию', 'скрыть вакансии компании'];
    const VACANCY_PAGE_SHOW_MENU_LABELS = ['показывать эту вакансию', 'показывать вакансии компании'];
    const IGNORE_CONTROL_LABELS = ['откликнуться', 'контакты', 'избранное', 'в избранное'];
    const COVER_LETTER_HINTS = ['сопроводительное письмо', 'сопроводительное', 'cover letter'];
    const MENU_TRIGGER_SELECTORS = [
        '[data-qa*="blacklist"]',
        '[data-qa*="black-list"]',
        '[data-qa*="hide"]',
        '[data-qa*="menu"]',
        'button[aria-haspopup="menu"]',
        '[role="button"][aria-haspopup="menu"]',
        'button[aria-expanded="false"]',
        'button[aria-expanded="true"]'
    ];

    let renderTimer = 0;
    let autoHideStatusCards = false;
    let debugLoggingEnabled = false;
    let saveCustomResponseFields = false;
    let vacancyPageStateDirty = true;
    let vacancyPageState = null;
    let vacancyPageStateInspection = null;
    let vacancyPageStateVersion = 0;
    const responseNoteControls = new WeakMap();

    function normalizeText(value) {
        return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function shortText(text, maxLength = 140) {
        const compact = (text || '').replace(/\s+/g, ' ').trim();
        if (compact.length <= maxLength) {
            return compact;
        }

        return `${compact.slice(0, maxLength).trimEnd()}...`;
    }

    function setHint(element, hint) {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        if (hint) {
            element.title = hint;
        } else {
            element.removeAttribute('title');
        }
    }

    function setTextWithHint(element, text, hint = text) {
        if (!(element instanceof HTMLElement)) {
            return;
        }

        element.textContent = text;
        setHint(element, hint);
    }

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function getCookieValue(name) {
        const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : null;
    }

    function getXsrfToken() {
        const input = document.querySelector('input[name="_xsrf"]');
        if (input instanceof HTMLInputElement && input.value) {
            return input.value;
        }

        return getCookieValue('_xsrf');
    }

    function extractVacancyIdFromUrl(value) {
        if (!value) {
            return null;
        }

        try {
            const url = new URL(value, window.location.origin);
            const pathMatch = url.pathname.match(/\/vacancy\/(\d+)/);
            if (pathMatch) {
                return pathMatch[1];
            }

            const queryVacancyId = url.searchParams.get('vacancyId');
            if (queryVacancyId) {
                return queryVacancyId;
            }
        } catch {
            const pathMatch = String(value).match(/\/vacancy\/(\d+)/);
            if (pathMatch) {
                return pathMatch[1];
            }

            const queryMatch = String(value).match(/[?&]vacancyId=(\d+)/);
            if (queryMatch) {
                return queryMatch[1];
            }
        }

        return null;
    }

    function extractEmployerIdFromUrl(value) {
        if (!value) {
            return null;
        }

        try {
            const url = new URL(value, window.location.origin);
            const pathMatch = url.pathname.match(/\/employer\/(\d+)/);
            if (pathMatch) {
                return pathMatch[1];
            }

            const queryEmployerId = url.searchParams.get('employerId');
            if (queryEmployerId) {
                return queryEmployerId;
            }
        } catch {
            const pathMatch = String(value).match(/\/employer\/(\d+)/);
            if (pathMatch) {
                return pathMatch[1];
            }

            const queryMatch = String(value).match(/[?&]employerId=(\d+)/);
            if (queryMatch) {
                return queryMatch[1];
            }
        }

        return null;
    }

    function getCurrentVacancyId() {
        return extractVacancyIdFromUrl(window.location.href);
    }

    function getCurrentEmployerId() {
        const queryEmployerId = extractEmployerIdFromUrl(window.location.href);
        if (queryEmployerId) {
            return queryEmployerId;
        }

        const selectorCandidates = [
            '[data-qa="vacancy-company-name"]',
            '[data-qa="vacancy-company-logo"]',
            '[data-qa="vacancy-serp__vacancy-employer"]',
            '[data-qa="vacancy-serp__vacancy-employer-logo"]'
        ];

        for (const selector of selectorCandidates) {
            const candidate = document.querySelector(selector);
            if (!(candidate instanceof HTMLElement)) {
                continue;
            }

            const employerId = extractEmployerIdFromUrl(candidate.getAttribute('href'));
            if (employerId) {
                return employerId;
            }
        }

        return null;
    }

    function getVacancyIdFromCard(card) {
        if (!(card instanceof HTMLElement)) {
            return null;
        }

        const directId = card.getAttribute('data-vacancy-id') || card.dataset.vacancyId;
        if (directId) {
            return directId;
        }

        if (/^\d+$/.test(card.id || '')) {
            return card.id;
        }

        const linkCandidates = Array.from(card.querySelectorAll('[href]'));
        for (const candidate of linkCandidates) {
            if (!(candidate instanceof HTMLElement)) {
                continue;
            }

            const vacancyId = extractVacancyIdFromUrl(candidate.getAttribute('href'));
            if (vacancyId) {
                return vacancyId;
            }
        }

        return null;
    }

    function getEmployerIdFromCard(card) {
        if (!(card instanceof HTMLElement)) {
            return null;
        }

        const directId = card.getAttribute('data-employer-id') || card.dataset.employerId;
        if (directId) {
            return directId;
        }

        const linkCandidates = Array.from(card.querySelectorAll('[href]'));
        for (const candidate of linkCandidates) {
            if (!(candidate instanceof HTMLElement)) {
                continue;
            }

            const employerId = extractEmployerIdFromUrl(candidate.getAttribute('href'));
            if (employerId) {
                return employerId;
            }
        }

        return null;
    }

    function getVacancyIdFromContext(context) {
        if (context instanceof Element) {
            const card = context.matches(CARD_SELECTOR) ? context : context.closest(CARD_SELECTOR);
            const cardVacancyId = getVacancyIdFromCard(card);
            if (cardVacancyId) {
                return cardVacancyId;
            }
        }

        return getCurrentVacancyId();
    }

    function getElementVacancyId(element) {
        if (!(element instanceof Element)) {
            return null;
        }

        const card = element.matches(CARD_SELECTOR) ? element : element.closest(CARD_SELECTOR);
        return getVacancyIdFromCard(card);
    }

    function isExpectedVacancyTarget(expectedVacancyId, element) {
        if (!expectedVacancyId || !(element instanceof Element)) {
            return true;
        }

        const elementVacancyId = getElementVacancyId(element);
        return !elementVacancyId || elementVacancyId === expectedVacancyId;
    }

    function logAction(action, details = {}, context = null) {
        if (!debugLoggingEnabled) {
            return;
        }

        const payload = {
            action,
            page: window.location.pathname,
            ...details
        };

        const vacancyId = getVacancyIdFromContext(context);
        if (vacancyId) {
            payload.vacancyId = vacancyId;
        }

        console.log(LOG_PREFIX, payload);
    }

    function logSettingChange(setting, enabled, context = null) {
        if (!debugLoggingEnabled && !enabled) {
            return;
        }

        const payload = {
            action: 'setting-changed',
            setting,
            enabled,
            page: window.location.pathname
        };

        const vacancyId = getVacancyIdFromContext(context);
        if (vacancyId) {
            payload.vacancyId = vacancyId;
        }

        console.log(LOG_PREFIX, payload);
    }

    function isVisible(element) {
        if (!element || !(element instanceof HTMLElement)) {
            return false;
        }

        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function getControlLabel(element) {
        const label = [
            element.textContent,
            element.getAttribute('aria-label'),
            element.getAttribute('title')
        ]
            .filter(Boolean)
            .join(' ');

        return normalizeText(label);
    }

    function matchesAnyLabel(element, labels) {
        const label = getControlLabel(element);
        return labels.some((item) => label.includes(item));
    }

    function clickElement(element) {
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        element.click();
    }

    function getHideButtonFromEventTarget(target) {
        if (!(target instanceof Element)) {
            return null;
        }

        const button = target.closest(`[${HIDE_BUTTON_MARKER}]`);
        return button instanceof HTMLElement ? button : null;
    }

    function getVacancyPageHideButtonFromEventTarget(target) {
        if (!(target instanceof Element)) {
            return null;
        }

        const button = target.closest(`[${VACANCY_PAGE_HIDE_BUTTON_MARKER}]`);
        return button instanceof HTMLButtonElement ? button : null;
    }

    function stopCardNavigation(event) {
        event.preventDefault();
        event.stopPropagation();

        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }
    }

    function beginTransientHidePopupSuppression(context = null) {
        const root = document.documentElement;
        if (!(root instanceof HTMLElement)) {
            return () => { };
        }

        let finished = false;
        root.setAttribute(HIDE_POPUP_SUPPRESSION_MARKER, 'true');
        logAction('hide-popup-suppression-started', {}, context);

        const dismissTimer = window.setTimeout(() => {
            const eventInit = {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true
            };

            document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            document.dispatchEvent(new KeyboardEvent('keyup', eventInit));

            const outsideTarget = document.body || document.documentElement;
            if (outsideTarget instanceof HTMLElement) {
                outsideTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                outsideTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                outsideTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
        }, 80);

        const cleanup = () => {
            if (finished) {
                return;
            }

            finished = true;
            window.clearTimeout(dismissTimer);
            root.removeAttribute(HIDE_POPUP_SUPPRESSION_MARKER);
            logAction('hide-popup-suppression-finished', {}, context);
        };

        window.setTimeout(cleanup, 900);
        return cleanup;
    }

    function triggerHideButtonAction(button) {
        if (!(button instanceof HTMLElement)) {
            return;
        }

        const card = button.closest(CARD_SELECTOR);
        if (!(card instanceof HTMLElement)) {
            return;
        }

        logAction('hide-button-click-captured', {
            buttonLabel: button.dataset.defaultLabel || button.textContent || 'hide'
        }, card);
        void handleHideClick(card, button, button.dataset.vacancyId || null);
    }

    function triggerVacancyPageHideButtonAction(button) {
        if (!(button instanceof HTMLButtonElement)) {
            return;
        }

        const vacancyId = getCurrentVacancyId();
        const employerId = getCurrentEmployerId();
        const target = button.dataset.hideTarget;

        if (target === 'vacancy') {
            logAction('vacancy-page-hide-button-click-captured', { target, vacancyId }, button);
            void handleVacancyPageHideClick(button, {
                target: 'vacancy',
                defaultLabel: 'Скрыть вакансию',
                successLabel: 'Скрыто',
                patchState: { vacancyHidden: true },
                onHide: () => hideVacancyViaApi(null, vacancyId)
            });
            return;
        }

        if (target === 'employer') {
            logAction('vacancy-page-hide-button-click-captured', { target, vacancyId, employerId }, button);
            void handleVacancyPageHideClick(button, {
                target: 'employer',
                defaultLabel: 'Скрыть компанию',
                successLabel: 'Компания скрыта',
                patchState: { employerHidden: true },
                onHide: () => hideEmployerFromVacancyPage(employerId, vacancyId, button)
            });
        }
    }

    function bindHideButton(button, card) {
        button.addEventListener('pointerdown', stopCardNavigation);
        button.addEventListener('mousedown', stopCardNavigation);
    }

    async function readLetters() {
        if (!chrome?.storage?.local) {
            return [];
        }

        const result = await chrome.storage.local.get({ [LETTERS_STORAGE_KEY]: [] });
        return asArray(result[LETTERS_STORAGE_KEY]).sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
    }

    async function writeLetters(letters) {
        if (!chrome?.storage?.local) {
            return;
        }

        await chrome.storage.local.set({ [LETTERS_STORAGE_KEY]: letters });
    }

    function createLetterId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }

        return `letter-${Date.now()}`;
    }

    async function readAutoHideStatusSetting() {
        if (!chrome?.storage?.local) {
            return false;
        }

        const result = await chrome.storage.local.get({ [AUTO_HIDE_STATUS_STORAGE_KEY]: false });
        return result[AUTO_HIDE_STATUS_STORAGE_KEY] === true;
    }

    async function readDebugLoggingSetting() {
        if (!chrome?.storage?.local) {
            return false;
        }

        const result = await chrome.storage.local.get({ [DEBUG_LOGGING_STORAGE_KEY]: false });
        return result[DEBUG_LOGGING_STORAGE_KEY] === true;
    }

    async function readSaveCustomResponseFieldsSetting() {
        if (!chrome?.storage?.local) {
            return true;
        }

        const result = await chrome.storage.local.get({ [SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY]: true });
        return result[SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY] === true;
    }

    function waitFor(getValue, timeout = 2500, interval = 100) {
        return new Promise((resolve) => {
            const startedAt = Date.now();
            const timerId = window.setInterval(() => {
                const value = getValue();
                if (value) {
                    window.clearInterval(timerId);
                    resolve(value);
                    return;
                }

                if (Date.now() - startedAt >= timeout) {
                    window.clearInterval(timerId);
                    resolve(null);
                }
            }, interval);
        });
    }

    function getVacancyCards() {
        return Array.from(document.querySelectorAll(CARD_SELECTOR));
    }

    function getVacancyPageMoreActionsButton() {
        return Array.from(document.querySelectorAll(VACANCY_PAGE_MORE_ACTIONS_SELECTOR)).find(
            (element) => element instanceof HTMLElement && isVisible(element)
        ) || null;
    }

    function getVisibleVacancyPageActionContainer() {
        const selectorCandidates = [
            '[data-qa="primary-actions"]',
            '.vacancy-actions',
            '[data-qa="vacancy-actions"]'
        ];

        for (const selector of selectorCandidates) {
            const match = Array.from(document.querySelectorAll(selector)).find(
                (element) => element instanceof HTMLElement && isVisible(element)
            );

            if (match instanceof HTMLElement) {
                return match;
            }
        }

        return null;
    }

    function getVacancyPageStateAnchor() {
        const trigger = getVacancyPageMoreActionsButton();
        if (trigger instanceof HTMLElement) {
            return trigger.closest('[data-qa="primary-actions"]') || trigger.closest('.vacancy-actions') || trigger.parentElement;
        }

        return getVisibleVacancyPageActionContainer();
    }

    function getVacancyPageStateLayout(anchor) {
        if (!(anchor instanceof HTMLElement) || !(anchor.parentElement instanceof HTMLElement)) {
            return null;
        }

        const layout = anchor.parentElement;
        layout.classList.add('hh-vacancy-page-state-layout');
        layout.setAttribute('data-hh-vacancy-page-state-layout', 'true');
        return layout;
    }

    function hasKnownWorkflowStatus(card) {
        for (const selector of AUTO_HIDE_STATUS_SELECTORS) {
            const match = card.querySelector(selector);
            if (match instanceof HTMLElement && isVisible(match)) {
                return true;
            }
        }

        const cardText = normalizeText(card.textContent);
        return AUTO_HIDE_STATUS_LABELS.some((label) => cardText.includes(label));
    }

    function findWorkflowStatusControl(card) {
        for (const selector of AUTO_HIDE_STATUS_SELECTORS) {
            const match = card.querySelector(selector);
            if (match instanceof HTMLElement && isVisible(match)) {
                return match;
            }
        }

        return Array.from(card.querySelectorAll('div, span')).find((element) => {
            if (!(element instanceof HTMLElement) || !isVisible(element)) {
                return false;
            }

            const label = normalizeText(element.textContent);
            return AUTO_HIDE_STATUS_LABELS.includes(label);
        }) || null;
    }

    function getWorkflowStatusLabel(card) {
        const statusControl = findWorkflowStatusControl(card);
        if (statusControl instanceof HTMLElement) {
            return shortText(statusControl.textContent, 80) || 'workflow-status';
        }

        const cardText = normalizeText(card.textContent);
        return AUTO_HIDE_STATUS_LABELS.find((label) => cardText.includes(label)) || null;
    }

    function getCardListBlock(card) {
        return card.closest('.magritte-redesign')?.parentElement || card;
    }

    function hideCardBlock(card, marker) {
        const block = getCardListBlock(card);
        if (!(block instanceof HTMLElement) || block.hasAttribute(marker)) {
            return false;
        }

        block.setAttribute(marker, 'true');
        block.style.display = 'none';

        const nextSibling = block.nextElementSibling;
        if (nextSibling instanceof HTMLElement && nextSibling.className.includes('magritte-v-spacing')) {
            nextSibling.setAttribute(marker, 'true');
            nextSibling.style.display = 'none';
        }

        return true;
    }

    function hideCardListBlock(card) {
        if (!hideCardBlock(card, AUTO_HIDDEN_CARD_MARKER)) {
            return false;
        }

        logAction('status-card-auto-hidden', {
            status: getWorkflowStatusLabel(card)
        }, card);
        return true;
    }

    function markCardAsHidden(card) {
        if (!(card instanceof HTMLElement)) {
            return false;
        }

        const block = getCardListBlock(card);
        let changed = false;

        if (block instanceof HTMLElement && !block.hasAttribute(HIDDEN_CARD_MARKER)) {
            block.setAttribute(HIDDEN_CARD_MARKER, 'true');
            changed = true;
        }

        if (!card.hasAttribute(HIDDEN_CARD_MARKER)) {
            card.setAttribute(HIDDEN_CARD_MARKER, 'true');
            changed = true;
        }

        return changed;
    }

    function syncHiddenCardButton(card) {
        if (!(card instanceof HTMLElement)) {
            return;
        }

        const button = card.querySelector(`[${HIDE_BUTTON_MARKER}]`);
        if (!(button instanceof HTMLButtonElement)) {
            return;
        }

        setButtonState(button, 'success', 'Скрыто');
    }

    function restoreAutoHiddenCards() {
        document.querySelectorAll(`[${AUTO_HIDDEN_CARD_MARKER}]`).forEach((node) => {
            if (!(node instanceof HTMLElement)) {
                return;
            }

            node.removeAttribute(AUTO_HIDDEN_CARD_MARKER);
            node.style.removeProperty('display');
        });
    }

    function collectVacancyPageMenuLabels(root = document, includeHidden = false) {
        const relevantLabels = [...VACANCY_PAGE_HIDE_MENU_LABELS, ...VACANCY_PAGE_SHOW_MENU_LABELS];
        const candidates = Array.from(
            root.querySelectorAll('button, a, [role="button"], [role="menuitem"], li, div[tabindex]')
        );

        return candidates
            .filter((element) => element instanceof HTMLElement && (includeHidden || isVisible(element)))
            .map(getControlLabel)
            .filter((label) => relevantLabels.some((item) => label.includes(item)));
    }

    function collectVacancyPageMenuTreeLabels(root, includeHidden = false) {
        if (!(root instanceof HTMLElement)) {
            return [];
        }

        const relevantLabels = [...VACANCY_PAGE_HIDE_MENU_LABELS, ...VACANCY_PAGE_SHOW_MENU_LABELS];
        const labels = new Set();
        const elements = [root, ...root.querySelectorAll('*')];

        elements.forEach((element) => {
            if (!(element instanceof HTMLElement) || (!includeHidden && !isVisible(element))) {
                return;
            }

            if (['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(element.tagName)) {
                return;
            }

            const label = normalizeText([
                element.textContent,
                element.getAttribute('aria-label'),
                element.getAttribute('title')
            ].filter(Boolean).join(' '));

            relevantLabels.forEach((item) => {
                if (label.includes(item)) {
                    labels.add(item);
                }
            });
        });

        return Array.from(labels);
    }

    function findVacancyPageMenuLabelElement(root = document.body, includeHidden = false) {
        const searchRoot = root instanceof HTMLElement ? root : document.body;
        if (!(searchRoot instanceof HTMLElement)) {
            return null;
        }

        const relevantLabels = [...VACANCY_PAGE_HIDE_MENU_LABELS, ...VACANCY_PAGE_SHOW_MENU_LABELS];
        const elements = [searchRoot, ...searchRoot.querySelectorAll('*')];

        return elements.find((element) => {
            if (!(element instanceof HTMLElement) || (!includeHidden && !isVisible(element))) {
                return false;
            }

            if (['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(element.tagName)) {
                return false;
            }

            const label = normalizeText([
                element.textContent,
                element.getAttribute('aria-label'),
                element.getAttribute('title')
            ].filter(Boolean).join(' '));

            return relevantLabels.some((item) => label.includes(item));
        }) || null;
    }

    function findVacancyPageMenuAction(root, labels, includeHidden = false) {
        const searchRoot = root instanceof HTMLElement ? root : document.body;
        if (!(searchRoot instanceof HTMLElement)) {
            return null;
        }

        const normalizedLabels = labels.map((label) => normalizeText(label));
        const candidates = [searchRoot, ...searchRoot.querySelectorAll('button, a, [role="button"], [role="menuitem"], li, div[tabindex]')];

        return candidates.find((element) => {
            if (!(element instanceof HTMLElement) || (!includeHidden && !isVisible(element))) {
                return false;
            }

            const label = getControlLabel(element);
            if (!label || label.length > 160) {
                return false;
            }

            return normalizedLabels.some((item) => label === item || label.includes(item));
        }) || null;
    }

    function mergeVacancyPageLabels(...groups) {
        return Array.from(new Set(groups.flat().filter(Boolean)));
    }

    function getVacancyPageMenuPopupRoot(node, trigger) {
        if (!(node instanceof HTMLElement)) {
            return null;
        }

        let current = node;
        let fallback = node;

        while (current && current !== document.body) {
            if (current === trigger || current.contains(trigger)) {
                break;
            }

            if (
                current.matches('[role="menu"], [role="dialog"], [data-qa*="popup"], [data-qa*="popover"], [data-qa*="dropdown"]')
            ) {
                return current;
            }

            const style = window.getComputedStyle(current);
            if (
                current.parentElement === document.body ||
                ((style.position === 'fixed' || style.position === 'absolute') && style.zIndex !== 'auto')
            ) {
                fallback = current;
            }

            current = current.parentElement;
        }

        return fallback;
    }

    function suppressVacancyPageMenuPopup(element) {
        if (!(element instanceof HTMLElement)) {
            return () => { };
        }

        const properties = ['position', 'left', 'top', 'opacity', 'visibility', 'pointer-events'];
        const previous = properties.map((property) => ({
            property,
            value: element.style.getPropertyValue(property),
            priority: element.style.getPropertyPriority(property)
        }));

        element.style.setProperty('position', 'fixed', 'important');
        element.style.setProperty('left', '-200vw', 'important');
        element.style.setProperty('top', '0', 'important');
        element.style.setProperty('opacity', '0', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');

        return () => {
            previous.forEach(({ property, value, priority }) => {
                if (value) {
                    element.style.setProperty(property, value, priority);
                } else {
                    element.style.removeProperty(property);
                }
            });
        };
    }

    function findVacancyPageMenuPopup(trigger, root = document, includeHidden = false) {
        const action = findVacancyPageMenuLabelElement(
            root instanceof HTMLElement ? root : document.body,
            includeHidden
        );

        if (!(action instanceof HTMLElement)) {
            return null;
        }

        const popup = getVacancyPageMenuPopupRoot(action, trigger);
        if (!(popup instanceof HTMLElement)) {
            return null;
        }

        return {
            popup,
            labels: collectVacancyPageMenuTreeLabels(popup, true)
        };
    }

    function waitForVacancyPageMenuPopup(trigger, timeout = 1800) {
        const existing = findVacancyPageMenuPopup(trigger, document, true);
        if (existing) {
            return Promise.resolve(existing);
        }

        return new Promise((resolve) => {
            let settled = false;
            const finish = (result) => {
                if (settled) {
                    return;
                }

                settled = true;
                observer.disconnect();
                window.clearTimeout(timerId);
                resolve(result);
            };

            const inspectNode = (node) => {
                if (!(node instanceof HTMLElement)) {
                    return null;
                }

                return findVacancyPageMenuPopup(trigger, node, true) || findVacancyPageMenuPopup(trigger, document, true);
            };

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        const popup = inspectNode(node);
                        if (popup) {
                            finish(popup);
                            return;
                        }
                    }
                }
            });

            const timerId = window.setTimeout(() => finish(null), timeout);
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    async function closeVacancyPageMenu(trigger, popup) {
        if (!(trigger instanceof HTMLElement) || !trigger.isConnected) {
            return true;
        }

        const isClosed = () => {
            if (!trigger.isConnected) {
                return true;
            }

            if (trigger.getAttribute('aria-expanded') === 'false') {
                return true;
            }

            if (popup instanceof HTMLElement && !popup.isConnected) {
                return true;
            }

            return !findVacancyPageMenuPopup(trigger, document, true);
        };

        const dispatchEscape = (target) => {
            const eventInit = {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true
            };

            target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
            target.dispatchEvent(new KeyboardEvent('keyup', eventInit));
            document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
        };

        if (isClosed()) {
            return true;
        }

        dispatchEscape(popup instanceof HTMLElement ? popup : trigger);

        let closed = await waitFor(() => (isClosed() ? true : null), 240, 40);
        if (closed) {
            return true;
        }

        if (trigger.getAttribute('aria-expanded') === 'true') {
            clickElement(trigger);
        }

        closed = await waitFor(() => (isClosed() ? true : null), 320, 40);
        if (closed) {
            return true;
        }

        const outsideTarget = document.body || document.documentElement;
        if (outsideTarget instanceof HTMLElement) {
            outsideTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            outsideTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            outsideTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }

        closed = await waitFor(() => (isClosed() ? true : null), 320, 40);
        return !!closed;
    }

    function markVacancyPageStateDirty() {
        vacancyPageStateDirty = true;
    }

    async function inspectVacancyPageState() {
        if (vacancyPageStateInspection) {
            return vacancyPageStateInspection;
        }

        const vacancyId = getCurrentVacancyId();
        const expectedStateVersion = vacancyPageStateVersion;
        if (!vacancyId) {
            vacancyPageState = null;
            vacancyPageStateDirty = false;
            return null;
        }

        vacancyPageStateInspection = (async () => {
            const employerId = getCurrentEmployerId();
            const state = await fetchVacancyBlacklistState(vacancyId, employerId);

            if (expectedStateVersion !== vacancyPageStateVersion) {
                logAction('vacancy-page-state-ignored-stale', {
                    vacancyId,
                    employerId,
                    source: 'api'
                });
                return vacancyPageState;
            }

            if (!state) {
                vacancyPageState = null;
                vacancyPageStateDirty = false;
                logAction('vacancy-page-state-unresolved', {
                    vacancyId,
                    employerId
                });
                return null;
            }

            vacancyPageState = {
                vacancyHidden: !!state.vacancyIsBlacklisted,
                employerHidden: !!state.employerIsBlacklisted
            };
            vacancyPageStateDirty = false;
            logAction('vacancy-page-state-detected', {
                vacancyId,
                employerId,
                vacancyHidden: vacancyPageState.vacancyHidden,
                employerHidden: vacancyPageState.employerHidden,
                source: 'api'
            });
            return vacancyPageState;
        })();

        try {
            return await vacancyPageStateInspection;
        } finally {
            vacancyPageStateInspection = null;
        }
    }

    function renderVacancyPageStateIndicator(state) {
        const anchor = getVacancyPageStateAnchor();
        const layout = getVacancyPageStateLayout(anchor);
        const roots = Array.from(document.querySelectorAll(`[${VACANCY_PAGE_STATE_MARKER}]`)).filter(
            (element) => element instanceof HTMLElement
        );
        const vacancyId = getCurrentVacancyId();
        const employerId = getCurrentEmployerId();
        const hasState = !!state && (state.vacancyHidden || state.employerHidden);
        const hasActions = !!vacancyId || !!employerId;

        if ((!hasState && !hasActions) || !(anchor instanceof HTMLElement) || !(layout instanceof HTMLElement)) {
            roots.forEach((root) => root.remove());
            return;
        }

        let root = roots.find((element) => element.parentElement === layout) || null;

        roots.forEach((element) => {
            if (element !== root) {
                element.remove();
            }
        });

        if (!(root instanceof HTMLElement)) {
            root = document.createElement('div');
            root.className = 'hh-vacancy-page-state';
            root.setAttribute(VACANCY_PAGE_STATE_MARKER, 'true');
        }

        if (root.parentElement !== layout) {
            layout.appendChild(root);
        }

        const renderKey = [
            vacancyId || '',
            employerId || '',
            state?.vacancyHidden ? '1' : '0',
            state?.employerHidden ? '1' : '0'
        ].join(':');

        if (root.dataset.renderKey === renderKey) {
            return;
        }

        root.dataset.renderKey = renderKey;

        root.replaceChildren();

        if (state?.employerHidden) {
            const badges = document.createElement('div');
            badges.className = 'hh-vacancy-page-state__badges';

            const badge = document.createElement('span');
            badge.className = 'hh-vacancy-page-state__badge hh-vacancy-page-state__badge--company';
            badge.textContent = 'Компания скрыта';
            setHint(badge, 'Вакансии этой компании скрыты.');
            badges.appendChild(badge);

            root.appendChild(badges);
            return;
        }

        if (state?.vacancyHidden) {
            const badges = document.createElement('div');
            badges.className = 'hh-vacancy-page-state__badges';

            const badge = document.createElement('span');
            badge.className = 'hh-vacancy-page-state__badge';
            badge.textContent = 'Вакансия скрыта';
            setHint(badge, 'Эта вакансия уже скрыта.');
            badges.appendChild(badge);

            root.appendChild(badges);
            return;
        }

        const badges = document.createElement('div');
        badges.className = 'hh-vacancy-page-state__badges';

        if (badges.childElementCount > 0) {
            root.appendChild(badges);
        }

        if (hasActions) {
            const actions = document.createElement('div');
            actions.className = 'hh-vacancy-page-state__actions';

            if (vacancyId) {
                const vacancyButton = createHideButton('Скрыть вакансию');
                vacancyButton.setAttribute(VACANCY_PAGE_HIDE_BUTTON_MARKER, 'true');
                vacancyButton.dataset.hideTarget = 'vacancy';
                if (state?.vacancyHidden) {
                    setButtonState(vacancyButton, 'success', 'Скрыто');
                }
                actions.appendChild(vacancyButton);
            }

            if (employerId) {
                const employerButton = createHideButton('Скрыть компанию');
                employerButton.setAttribute(VACANCY_PAGE_HIDE_BUTTON_MARKER, 'true');
                employerButton.dataset.hideTarget = 'employer';
                if (state?.employerHidden) {
                    setButtonState(employerButton, 'success', 'Компания скрыта');
                }
                actions.appendChild(employerButton);
            }

            if (actions.childElementCount > 0) {
                root.appendChild(actions);
            }
        }
    }

    async function renderVacancyPageState() {
        const anchor = getVacancyPageStateAnchor();
        if (!(anchor instanceof HTMLElement)) {
            renderVacancyPageStateIndicator(null);
            return;
        }

        const state = vacancyPageStateDirty ? await inspectVacancyPageState() : vacancyPageState;
        renderVacancyPageStateIndicator(state);
    }

    function getCoverLetterContext(textarea) {
        const pieces = [
            textarea.placeholder,
            textarea.getAttribute('aria-label'),
            textarea.getAttribute('name'),
            textarea.id,
            textarea.className
        ];

        const closestLabel = textarea.closest('label');
        if (closestLabel) {
            pieces.push(closestLabel.textContent);
        }

        if (textarea.parentElement) {
            pieces.push(textarea.parentElement.textContent?.slice(0, 250));
        }

        const previousSibling = textarea.previousElementSibling;
        if (previousSibling) {
            pieces.push(previousSibling.textContent);
        }

        return normalizeText(pieces.filter(Boolean).join(' '));
    }

    function isKnownCoverLetterTextarea(textarea) {
        return COVER_LETTER_TEXTAREA_SELECTORS.some((selector) => {
            try {
                return textarea.matches(selector);
            } catch {
                return false;
            }
        });
    }

    function isResponseCustomFieldTextarea(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement) || !isVisible(textarea)) {
            return false;
        }

        return RESPONSE_CUSTOM_FIELD_NAME_PATTERN.test(textarea.name || '');
    }

    function isCoverLetterTextarea(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement) || !isVisible(textarea)) {
            return false;
        }

        if (isResponseCustomFieldTextarea(textarea)) {
            return false;
        }

        if (isKnownCoverLetterTextarea(textarea)) {
            return true;
        }

        const context = getCoverLetterContext(textarea);
        return COVER_LETTER_HINTS.some((hint) => context.includes(hint));
    }

    function getCoverLetterTextareas() {
        return Array.from(document.querySelectorAll('textarea')).filter(isCoverLetterTextarea);
    }

    function setNativeTextValue(textarea, value) {
        const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        if (descriptor?.set) {
            descriptor.set.call(textarea, value);
        } else {
            textarea.value = value;
        }

        textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function getResponseFormFieldLabel(field) {
        if (!(field instanceof HTMLElement)) {
            return '';
        }

        const labelledBy = (field.getAttribute('aria-labelledby') || '')
            .split(/\s+/)
            .map((id) => document.getElementById(id))
            .filter((node) => node instanceof HTMLElement)
            .map((node) => node.textContent || '')
            .join(' ');

        const explicitLabel = field.id
            ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`)
            : null;

        const candidates = [
            field.getAttribute('aria-label'),
            labelledBy,
            explicitLabel instanceof HTMLElement ? explicitLabel.textContent : '',
            field.closest('label')?.textContent,
            field.getAttribute('placeholder'),
            field.getAttribute('name')
        ];

        return shortText(candidates.filter(Boolean).join(' ').trim(), 120);
    }

    function getResponseFormVacancyTitle(form) {
        if (!(form instanceof HTMLFormElement)) {
            return '';
        }

        const container = form.closest('[role="dialog"]') || form.parentElement || form;
        const candidates = Array.from(container.querySelectorAll('[data-qa="vacancy-title"], h1, h2, h3, h4'));

        for (const candidate of candidates) {
            if (!(candidate instanceof HTMLElement)) {
                continue;
            }

            const text = shortText(candidate.textContent || '', 140);
            const normalized = normalizeText(text);
            if (!text || normalized === 'отклик на вакансию' || normalized === 'писать тут') {
                continue;
            }

            return text;
        }

        return shortText(document.title.replace(/\s*\|.*$/, ''), 140);
    }

    function isResponseNoteEligible(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement) || !isVisible(textarea)) {
            return false;
        }

        if (!(textarea.form instanceof HTMLFormElement) || !textarea.form.matches(RESPONSE_NOTE_FORM_SELECTOR)) {
            return false;
        }

        if (isCoverLetterTextarea(textarea)) {
            return true;
        }

        return saveCustomResponseFields && isResponseCustomFieldTextarea(textarea);
    }

    function getResponseNoteDefaultTitle(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement)) {
            return 'Заметка';
        }

        if (isCoverLetterTextarea(textarea)) {
            return 'Сопроводительное письмо';
        }

        const label = shortText(getResponseFormFieldLabel(textarea), 120);
        const normalized = normalizeText(label);
        if (!label || normalized === 'писать тут' || normalized === 'текст') {
            return 'Ответ работодателю';
        }

        return label;
    }

    function getResponseNoteAnchor(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement)) {
            return null;
        }

        return textarea.closest('[data-qa="textarea-wrapper"]') || textarea.parentElement;
    }

    function getResponseNoteControlRoot(textarea) {
        const storedRoot = responseNoteControls.get(textarea);
        if (storedRoot instanceof HTMLElement && storedRoot.isConnected) {
            return storedRoot;
        }

        const anchor = getResponseNoteAnchor(textarea);
        if (!(anchor instanceof HTMLElement)) {
            return null;
        }

        const sibling = anchor.nextElementSibling;
        if (sibling instanceof HTMLElement && sibling.hasAttribute(RESPONSE_NOTE_CONTROL_MARKER)) {
            responseNoteControls.set(textarea, sibling);
            return sibling;
        }

        return null;
    }

    function getResponseNoteControlNodes(textarea) {
        const root = getResponseNoteControlRoot(textarea);
        if (!(root instanceof HTMLElement)) {
            return null;
        }

        const checkbox = root.querySelector('.hh-response-note-control__checkbox');
        const details = root.querySelector('.hh-response-note-control__details');
        const input = root.querySelector('.hh-response-note-control__input');
        const error = root.querySelector('.hh-response-note-control__error');
        if (
            !(checkbox instanceof HTMLInputElement) ||
            !(details instanceof HTMLElement) ||
            !(input instanceof HTMLInputElement) ||
            !(error instanceof HTMLElement)
        ) {
            return null;
        }

        return { root, checkbox, details, input, error };
    }

    function clearResponseNoteControlError(textarea) {
        const nodes = getResponseNoteControlNodes(textarea);
        if (!nodes) {
            return;
        }

        nodes.error.hidden = true;
        setTextWithHint(nodes.error, '', '');
        nodes.input.removeAttribute('aria-invalid');
    }

    function setResponseNoteControlError(textarea, message) {
        const nodes = getResponseNoteControlNodes(textarea);
        if (!nodes) {
            return;
        }

        nodes.error.hidden = false;
        setTextWithHint(nodes.error, message, message);
        nodes.input.setAttribute('aria-invalid', 'true');
    }

    function syncResponseNoteControlState(textarea) {
        const nodes = getResponseNoteControlNodes(textarea);
        if (!nodes) {
            return;
        }

        const defaultTitle = getResponseNoteDefaultTitle(textarea);
        nodes.input.placeholder = `Например: ${defaultTitle}`;
        setHint(nodes.input, 'Название заметки.');
        nodes.root.dataset.expanded = nodes.checkbox.checked ? 'true' : 'false';
        nodes.details.hidden = !nodes.checkbox.checked;
        nodes.details.style.display = nodes.checkbox.checked ? 'grid' : 'none';

        if (nodes.checkbox.checked && !nodes.input.value.trim()) {
            nodes.input.value = defaultTitle;
        }

        if (!nodes.checkbox.checked) {
            clearResponseNoteControlError(textarea);
        }
    }

    function removeResponseNoteControl(textarea) {
        const root = getResponseNoteControlRoot(textarea);
        if (root instanceof HTMLElement) {
            root.remove();
        }

        responseNoteControls.delete(textarea);
    }

    function ensureResponseNoteControl(textarea) {
        if (!(textarea instanceof HTMLTextAreaElement)) {
            return false;
        }

        if (!isResponseNoteEligible(textarea)) {
            removeResponseNoteControl(textarea);
            return false;
        }

        const anchor = getResponseNoteAnchor(textarea);
        if (!(anchor instanceof HTMLElement) || !(anchor.parentElement instanceof HTMLElement)) {
            return false;
        }

        let root = getResponseNoteControlRoot(textarea);
        if (!(root instanceof HTMLElement)) {
            root = document.createElement('div');
            root.className = 'hh-response-note-control';
            root.setAttribute(RESPONSE_NOTE_CONTROL_MARKER, 'true');
            root.dataset.expanded = 'false';

            const toggle = document.createElement('label');
            toggle.className = 'hh-response-note-control__toggle';
            setHint(toggle, 'Отмечает поле для сохранения.');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'hh-response-note-control__checkbox';
            checkbox.checked = false;
            setHint(checkbox, 'Отмечает поле для сохранения.');

            const toggleText = document.createElement('span');
            toggleText.className = 'hh-response-note-control__toggle-label';
            toggleText.textContent = 'Сохранить на потом';
            setHint(toggleText, 'Сохраняет текст в заметки после отклика.');

            toggle.append(checkbox, toggleText);

            const details = document.createElement('div');
            details.className = 'hh-response-note-control__details';
            details.hidden = true;

            const fieldLabel = document.createElement('label');
            fieldLabel.className = 'hh-response-note-control__field';

            const titleLabel = document.createElement('span');
            titleLabel.className = 'hh-response-note-control__field-label';
            titleLabel.textContent = 'Название';
            setHint(titleLabel, 'Название заметки.');

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'hh-response-note-control__input';
            input.maxLength = 120;
            setHint(input, 'Название заметки.');

            const error = document.createElement('p');
            error.className = 'hh-response-note-control__error';
            error.hidden = true;

            fieldLabel.append(titleLabel, input);
            details.append(fieldLabel, error);
            root.append(toggle, details);

            checkbox.addEventListener('change', () => {
                syncResponseNoteControlState(textarea);
            });

            input.addEventListener('input', () => {
                clearResponseNoteControlError(textarea);
            });

            textarea.addEventListener('input', () => {
                clearResponseNoteControlError(textarea);
            });

            anchor.insertAdjacentElement('afterend', root);
            responseNoteControls.set(textarea, root);
        }

        syncResponseNoteControlState(textarea);
        return true;
    }

    function getResponseNoteTextareas() {
        return Array.from(document.querySelectorAll('textarea')).filter(
            (field) => field instanceof HTMLTextAreaElement && field.form instanceof HTMLFormElement && field.form.matches(RESPONSE_NOTE_FORM_SELECTOR)
        );
    }

    function collectSelectedResponseNotes(form) {
        if (!(form instanceof HTMLFormElement)) {
            return null;
        }

        const notes = [];
        let invalidElement = null;

        Array.from(form.querySelectorAll('textarea')).forEach((field) => {
            if (!(field instanceof HTMLTextAreaElement) || !isResponseNoteEligible(field)) {
                return;
            }

            clearResponseNoteControlError(field);
            const nodes = getResponseNoteControlNodes(field);
            if (!nodes || !nodes.checkbox.checked) {
                return;
            }

            const body = field.value.trim();
            if (!body) {
                setResponseNoteControlError(field, 'Заполни текст или сними галочку.');
                invalidElement = invalidElement || field;
                return;
            }

            const title = (nodes.input.value.trim() || getResponseNoteDefaultTitle(field)).trim();
            if (!title) {
                setResponseNoteControlError(field, 'Укажи название заметки.');
                invalidElement = invalidElement || nodes.input;
                return;
            }

            notes.push({
                title,
                name: field.name || field.id || '',
                label: getResponseFormFieldLabel(field) || getResponseNoteDefaultTitle(field),
                body,
                kind: isCoverLetterTextarea(field) ? 'cover-letter' : 'custom-field',
                field
            });
        });

        if (invalidElement) {
            return {
                vacancyId: getCurrentVacancyId(),
                vacancyTitle: getResponseFormVacancyTitle(form),
                notes,
                invalidElement,
                hasErrors: true
            };
        }

        if (!notes.length) {
            return null;
        }

        return {
            vacancyId: getCurrentVacancyId(),
            vacancyTitle: getResponseFormVacancyTitle(form),
            notes,
            invalidElement: null,
            hasErrors: false
        };
    }

    async function saveResponseFormSnapshot(note, snapshot) {
        const letters = asArray(await readLetters());
        const now = Date.now();
        const nextLetter = {
            id: createLetterId(),
            title: note.title,
            body: note.body,
            fields: [{
                name: note.name,
                label: note.label,
                type: note.kind || 'textarea',
                value: note.body
            }],
            sourceFieldType: note.kind || 'textarea',
            sourceFieldName: note.name,
            sourceFieldLabel: note.label,
            vacancyId: snapshot.vacancyId || null,
            vacancyTitle: snapshot.vacancyTitle || '',
            updatedAt: now
        };

        await writeLetters([...letters, nextLetter]);
        return nextLetter;
    }

    function submitVacancyResponseForm(form, submitter) {
        if (!(form instanceof HTMLFormElement)) {
            return;
        }

        form.dataset.hhBypassSaveNotePrompt = 'true';
        window.setTimeout(() => {
            if (form.isConnected) {
                delete form.dataset.hhBypassSaveNotePrompt;
            }
        }, 1500);

        if (typeof form.requestSubmit === 'function') {
            if (submitter instanceof HTMLElement) {
                form.requestSubmit(submitter);
            } else {
                form.requestSubmit();
            }
            return;
        }

        form.submit();
    }

    function openSaveNotePrompt(form, submitter, snapshot) {
        closeSaveNotePrompt();

        const root = document.createElement('div');
        root.className = 'hh-save-note-prompt';
        root.setAttribute(SAVE_NOTE_PROMPT_MARKER, 'true');

        const backdrop = document.createElement('button');
        backdrop.type = 'button';
        backdrop.className = 'hh-save-note-prompt__backdrop';
        backdrop.setAttribute('aria-label', 'Закрыть окно сохранения заметки');
        setHint(backdrop, 'Закрывает окно.');

        const dialog = document.createElement('div');
        dialog.className = 'hh-save-note-prompt__dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const title = document.createElement('h3');
        title.className = 'hh-save-note-prompt__title';
        title.textContent = 'Сохранить заметку перед откликом?';

        const description = document.createElement('p');
        description.className = 'hh-save-note-prompt__description';
        description.textContent = `Нашел заполненные текстовые поля: ${snapshot.notes.length}. Для каждого поля укажи название заметки, и после этого форма будет отправлена.`;

        const error = document.createElement('p');
        error.className = 'hh-save-note-prompt__error';
        error.hidden = true;

        const list = document.createElement('div');
        list.className = 'hh-save-note-prompt__list';

        const titleInputs = snapshot.notes.map((note, index) => {
            const item = document.createElement('div');
            item.className = 'hh-save-note-prompt__item';

            const label = document.createElement('div');
            label.className = 'hh-save-note-prompt__item-label';
            label.textContent = note.label || `Заметка ${index + 1}`;

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'hh-save-note-prompt__input';
            input.maxLength = 120;
            input.placeholder = `Например: ${note.label || `Заметка ${index + 1}`}`;

            const preview = document.createElement('div');
            preview.className = 'hh-save-note-prompt__preview';
            preview.textContent = shortText(note.body, 220);

            item.append(label, input, preview);
            list.appendChild(item);

            return { note, input };
        });

        const actions = document.createElement('div');
        actions.className = 'hh-save-note-prompt__actions';

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'hh-save-note-prompt__button hh-save-note-prompt__button--primary';
        saveButton.textContent = 'Сохранить';
        setHint(saveButton, 'Сохраняет заметки и отправляет отклик.');

        const skipButton = document.createElement('button');
        skipButton.type = 'button';
        skipButton.className = 'hh-save-note-prompt__button';
        skipButton.textContent = 'Пропустить';
        setHint(skipButton, 'Отправляет отклик без сохранения.');

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'hh-save-note-prompt__button';
        cancelButton.textContent = 'Отмена';
        setHint(cancelButton, 'Закрывает окно без отклика.');

        const setBusy = (busy) => {
            saveButton.disabled = busy;
            skipButton.disabled = busy;
            cancelButton.disabled = busy;
            titleInputs.forEach(({ input }) => {
                input.disabled = busy;
            });
        };

        const closePrompt = () => {
            root.remove();
        };

        backdrop.addEventListener('click', closePrompt);
        cancelButton.addEventListener('click', closePrompt);

        skipButton.addEventListener('click', () => {
            logAction('response-note-save-skipped', {
                notesCount: snapshot.notes.length,
                vacancyId: snapshot.vacancyId || null
            }, form);
            closePrompt();
            submitVacancyResponseForm(form, submitter);
        });

        saveButton.addEventListener('click', async () => {
            const emptyEntry = titleInputs.find(({ input }) => !input.value.trim());
            if (emptyEntry) {
                error.hidden = false;
                setTextWithHint(error, 'Заполни название для каждой заметки.', 'Нужно заполнить все названия.');
                emptyEntry.input.focus();
                return;
            }

            error.hidden = true;
            setBusy(true);

            try {
                const savedNotes = [];
                for (const entry of titleInputs) {
                    const saved = await saveResponseFormSnapshot(entry.input.value.trim(), entry.note, snapshot);
                    savedNotes.push(saved);
                }

                logAction('response-note-saved', {
                    letterTitles: savedNotes.map((note) => note.title),
                    notesCount: savedNotes.length,
                    vacancyId: snapshot.vacancyId || null
                }, form);
                closePrompt();
                submitVacancyResponseForm(form, submitter);
            } catch (saveError) {
                setBusy(false);
                error.hidden = false;
                setTextWithHint(error, 'Не удалось сохранить заметку. Попробуй еще раз.', 'Сохранение не удалось.');
                logAction('response-note-save-failed', {
                    reason: saveError instanceof Error ? saveError.message : String(saveError),
                    notesCount: snapshot.notes.length,
                    vacancyId: snapshot.vacancyId || null
                }, form);
            }
        });

        titleInputs.forEach(({ input }) => {
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    saveButton.click();
                }

                if (event.key === 'Escape') {
                    event.preventDefault();
                    closePrompt();
                }
            });
        });

        dialog.append(title, description, error, list, actions);
        actions.append(saveButton, skipButton, cancelButton);
        root.append(backdrop, dialog);
        document.body.appendChild(root);
        titleInputs[0]?.input.focus();
    }

    function handleVacancyResponseSubmit(event) {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !form.matches(RESPONSE_NOTE_FORM_SELECTOR)) {
            return;
        }

        if (form.dataset.hhBypassSaveNotePrompt === 'true') {
            return;
        }

        const snapshot = collectSelectedResponseNotes(form);
        if (!snapshot) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }

        if (snapshot.hasErrors) {
            logAction('response-note-save-validation-failed', {
                notesCount: snapshot.notes.length,
                vacancyId: snapshot.vacancyId || null
            }, form);

            if (snapshot.invalidElement instanceof HTMLElement) {
                snapshot.invalidElement.focus();
                snapshot.invalidElement.scrollIntoView({ block: 'center', inline: 'nearest' });
            }
            return;
        }

        void (async () => {
            try {
                const savedNotes = [];
                for (const note of snapshot.notes) {
                    const saved = await saveResponseFormSnapshot(note, snapshot);
                    savedNotes.push(saved);
                }

                logAction('response-note-saved', {
                    letterTitles: savedNotes.map((note) => note.title),
                    notesCount: savedNotes.length,
                    vacancyId: snapshot.vacancyId || null
                }, form);
                submitVacancyResponseForm(form, event.submitter);
            } catch (saveError) {
                const firstNote = snapshot.notes[0];
                if (firstNote?.field instanceof HTMLTextAreaElement) {
                    setResponseNoteControlError(firstNote.field, 'Не удалось сохранить заметки. Попробуй еще раз.');
                }

                logAction('response-note-save-failed', {
                    reason: saveError instanceof Error ? saveError.message : String(saveError),
                    notesCount: snapshot.notes.length,
                    vacancyId: snapshot.vacancyId || null
                }, form);
            }
        })();
    }

    function closeAllLetterPickers(exceptRoot) {
        document.querySelectorAll(`[${LETTER_PICKER_MARKER}]`).forEach((root) => {
            if (root !== exceptRoot) {
                root.dataset.open = 'false';
            }
        });
    }

    function sendRuntimeMessage(message) {
        return new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(message, (response) => {
                    const error = chrome.runtime.lastError;
                    if (error) {
                        reject(new Error(error.message));
                        return;
                    }

                    resolve(response);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async function openLettersPage(context = null, source = 'unknown') {
        logAction('letters-page-open-requested', { source }, context);

        try {
            const response = await sendRuntimeMessage({ type: 'open-letters-page', source });
            if (!response?.ok) {
                throw new Error(response?.reason || 'open-letters-page failed');
            }

            logAction('letters-page-opened', {
                source,
                method: response?.method || 'runtime-message'
            }, context);
            return;
        } catch (error) {
            logAction('letters-page-open-failed', {
                source,
                reason: error instanceof Error ? error.message : String(error)
            }, context);
        }
    }

    function renderLetterPanel(panel, textarea, statusNode, root, letters) {
        panel.replaceChildren();

        if (!letters.length) {
            const empty = document.createElement('p');
            empty.className = 'hh-cover-letter-picker__empty';
            empty.textContent = 'Список пуст. Сначала сохрани шаблон на экране памяти расширения.';
            setHint(empty, 'Сохранённых заметок пока нет.');
            panel.appendChild(empty);
        } else {
            letters.forEach((letter) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'hh-cover-letter-picker__item';
                setHint(item, `Подставляет заметку «${shortText(letter.title || 'Без названия', 60)}».`);

                const title = document.createElement('span');
                title.className = 'hh-cover-letter-picker__item-title';
                title.textContent = letter.title || 'Без названия';

                const preview = document.createElement('span');
                preview.className = 'hh-cover-letter-picker__item-preview';
                preview.textContent = shortText(letter.body);

                item.append(title, preview);
                item.addEventListener('click', () => {
                    setNativeTextValue(textarea, letter.body || '');
                    setTextWithHint(statusNode, `Шаблон «${letter.title || 'Без названия'}» вставлен.`, 'Заметка вставлена в поле.');
                    root.dataset.open = 'false';
                    logAction('cover-letter-applied', {
                        letterTitle: letter.title || 'Без названия',
                        bodyLength: (letter.body || '').length
                    }, textarea);
                    textarea.focus();
                });

                panel.appendChild(item);
            });
        }

        const footer = document.createElement('div');
        footer.className = 'hh-cover-letter-picker__panel-footer';

        const openPageButton = document.createElement('button');
        openPageButton.type = 'button';
        openPageButton.className = 'hh-cover-letter-picker__link hh-cover-letter-picker__panel-link';
        openPageButton.textContent = 'Посмотреть все';
        setHint(openPageButton, 'Открывает все заметки.');
        openPageButton.addEventListener('click', () => {
            void openLettersPage(textarea, 'picker-panel');
        });

        footer.appendChild(openPageButton);
        panel.appendChild(footer);
    }

    function getLetterPickerAnchor(textarea) {
        return textarea.closest('[data-qa="textarea-wrapper"]') || textarea.parentElement;
    }

    function ensureLetterPicker(textarea) {
        const anchor = getLetterPickerAnchor(textarea);
        if (!(anchor instanceof HTMLElement) || !anchor.parentElement) {
            return false;
        }

        if (anchor.parentElement.querySelector(`[${LETTER_PICKER_MARKER}]`)) {
            return false;
        }

        const root = document.createElement('div');
        root.className = 'hh-cover-letter-picker';
        root.setAttribute(LETTER_PICKER_MARKER, 'true');
        root.dataset.open = 'false';

        const controls = document.createElement('div');
        controls.className = 'hh-cover-letter-picker__controls';

        const chooseButton = document.createElement('button');
        chooseButton.type = 'button';
        chooseButton.className = 'hh-cover-letter-picker__button';
        chooseButton.textContent = 'Выбрать из моих заметок';
        setHint(chooseButton, 'Открывает список сохранённых заметок.');

        const statusNode = document.createElement('div');
        statusNode.className = 'hh-cover-letter-picker__status';
        setTextWithHint(statusNode, '', '');

        const panel = document.createElement('div');
        panel.className = 'hh-cover-letter-picker__panel';

        chooseButton.addEventListener('click', async () => {
            const isOpen = root.dataset.open === 'true';
            if (isOpen) {
                root.dataset.open = 'false';
                logAction('cover-letter-picker-closed', {}, textarea);
                return;
            }

            closeAllLetterPickers(root);
            setTextWithHint(statusNode, 'Загружаю шаблоны...', 'Загружает сохранённые заметки.');
            const letters = await readLetters();
            renderLetterPanel(panel, textarea, statusNode, root, letters);
            root.dataset.open = 'true';
            logAction('cover-letter-picker-opened', {
                templatesCount: letters.length
            }, textarea);

            if (letters.length) {
                setTextWithHint(statusNode, 'Выбери шаблон из списка ниже.', 'Можно выбрать заметку для вставки.');
            } else {
                setTextWithHint(statusNode, 'Список пуст. Открой память расширения и сохрани шаблон.', 'Сначала нужно сохранить заметку.');
            }
        });

        controls.append(chooseButton);
        root.append(controls, panel, statusNode);
        anchor.insertAdjacentElement('beforebegin', root);
        logAction('cover-letter-picker-injected', {}, textarea);
        return true;
    }

    function findApplyControl(card) {
        const directMatch = card.querySelector(APPLY_SELECTOR);
        if (directMatch instanceof HTMLElement) {
            return directMatch;
        }

        return Array.from(card.querySelectorAll('a, button')).find(
            (element) => isVisible(element) && normalizeText(element.textContent) === 'откликнуться'
        );
    }

    function findDirectHideControl(card) {
        for (const selector of DIRECT_HIDE_CONTROL_SELECTORS) {
            const match = card.querySelector(selector);
            if (!(match instanceof HTMLElement) || !isVisible(match)) {
                continue;
            }

            if (match.hasAttribute(HIDE_BUTTON_MARKER)) {
                continue;
            }

            return match;
        }

        return null;
    }

    function findHideMenuItem(root = document) {
        const candidates = Array.from(
            root.querySelectorAll('button, a, [role="button"], [role="menuitem"], li, div[tabindex]')
        );

        return candidates.find((element) => {
            if (!(element instanceof HTMLElement) || !isVisible(element)) {
                return false;
            }

            if (element.hasAttribute(HIDE_BUTTON_MARKER)) {
                return false;
            }

            if (element.matches(CARD_SELECTOR)) {
                return false;
            }

            const label = getControlLabel(element);
            if (!label || label.length > 120) {
                return false;
            }

            return HIDE_MENU_LABELS.some((item) => label === item || label.startsWith(item));
        });
    }

    function findExplicitTrigger(card) {
        for (const selector of MENU_TRIGGER_SELECTORS) {
            const match = card.querySelector(selector);
            if (match instanceof HTMLElement && isVisible(match) && !matchesAnyLabel(match, IGNORE_CONTROL_LABELS)) {
                return match;
            }
        }

        return null;
    }

    function findHeaderIconButtons(card) {
        const cardRect = card.getBoundingClientRect();

        return Array.from(card.querySelectorAll('button, [role="button"]')).filter((element) => {
            if (!(element instanceof HTMLElement) || !isVisible(element)) {
                return false;
            }

            if (element.hasAttribute(HIDE_BUTTON_MARKER) || matchesAnyLabel(element, IGNORE_CONTROL_LABELS)) {
                return false;
            }

            const rect = element.getBoundingClientRect();
            const isTopArea = rect.top <= cardRect.top + 110;
            const isRightArea = rect.left >= cardRect.left + cardRect.width * 0.58;
            const isCompact = rect.width <= 56 && rect.height <= 56;
            const hasOnlyIcon = normalizeText(element.textContent).length === 0 && !!element.querySelector('svg');

            return isTopArea && isRightArea && isCompact && hasOnlyIcon;
        });
    }

    function findMenuTrigger(card) {
        const explicitTrigger = findExplicitTrigger(card);
        if (explicitTrigger) {
            return explicitTrigger;
        }

        const iconButtons = findHeaderIconButtons(card).sort(
            (left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left
        );

        if (iconButtons.length >= 2) {
            return iconButtons[0];
        }

        return null;
    }

    function setButtonState(button, state, label) {
        if (state) {
            button.dataset.state = state;
        } else {
            delete button.dataset.state;
        }

        button.textContent = label;
        button.disabled = state === 'busy' || state === 'success';

        if (state === 'busy') {
            setHint(button, button.dataset.busyHint || 'Выполняет действие.');
            return;
        }

        if (state === 'success') {
            setHint(button, button.dataset.successHint || button.dataset.defaultHint || label);
            return;
        }

        if (state === 'error') {
            setHint(button, button.dataset.errorHint || 'Действие не удалось.');
            return;
        }

        setHint(button, button.dataset.defaultHint || label);
    }

    function isCardEffectivelyHidden(card) {
        if (!(card instanceof HTMLElement)) {
            return true;
        }

        if (!card.isConnected) {
            return true;
        }

        const block = getCardListBlock(card);
        if (
            block instanceof HTMLElement &&
            (block.hasAttribute(AUTO_HIDDEN_CARD_MARKER) || block.hasAttribute(HIDDEN_CARD_MARKER))
        ) {
            return true;
        }

        return !isVisible(card);
    }

    function createHideButton(label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hh-hide-vacancy-button';
        button.textContent = label;
        button.dataset.defaultLabel = label;

        if (label === 'Скрыть компанию') {
            button.dataset.defaultHint = 'Скрывает вакансии этой компании.';
            button.dataset.successHint = 'Вакансии компании уже скрыты.';
        } else {
            button.dataset.defaultHint = 'Скрывает эту вакансию.';
            button.dataset.successHint = 'Вакансия уже скрыта.';
        }

        button.dataset.busyHint = 'Отправляет команду в hh.';
        button.dataset.errorHint = 'Не получилось скрыть. Можно попробовать снова.';
        setHint(button, button.dataset.defaultHint);
        return button;
    }

    async function fetchVacancyBlacklistState(vacancyId, employerId = null, context = null) {
        if (!vacancyId) {
            return null;
        }

        const url = new URL(BLACKLIST_STATE_API_PATH, window.location.origin);
        url.searchParams.set('vacancyId', vacancyId);
        if (employerId) {
            url.searchParams.set('employerId', employerId);
        }

        try {
            const response = await fetch(url.toString(), {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json, text/plain, */*'
                }
            });

            if (!response.ok) {
                logAction('hide-api-state-request-failed', {
                    vacancyId,
                    employerId,
                    status: response.status
                }, context);
                return null;
            }

            return await response.json();
        } catch (error) {
            logAction('hide-api-state-request-error', {
                vacancyId,
                employerId,
                reason: error instanceof Error ? error.message : String(error)
            }, context);
            return null;
        }
    }

    async function waitForEmployerHiddenState(vacancyId, employerId, context = null, timeout = 2200, interval = 220) {
        if (!vacancyId || !employerId) {
            return false;
        }

        const startedAt = Date.now();
        while (Date.now() - startedAt <= timeout) {
            const state = await fetchVacancyBlacklistState(vacancyId, employerId, context);
            if (state?.employerIsBlacklisted) {
                return true;
            }

            await new Promise((resolve) => window.setTimeout(resolve, interval));
        }

        return false;
    }

    async function hideEmployerFromVacancyPage(employerId, vacancyId = null, context = null) {
        const hiddenViaApi = await hideEmployerViaApi(employerId, vacancyId, context);
        if (!hiddenViaApi) {
            return false;
        }

        const confirmed = vacancyId
            ? await waitForEmployerHiddenState(vacancyId, employerId, context)
            : true;

        if (!confirmed) {
            logAction('hide-employer-api-state-not-confirmed', {
                vacancyId,
                employerId
            }, context);
        }

        return confirmed;
    }

    async function hideEmployerViaApi(employerId, vacancyId = null, context = null) {
        if (!employerId) {
            logAction('hide-employer-api-missing-employer-id', { vacancyId }, context);
            return false;
        }

        const xsrfToken = getXsrfToken();
        if (!xsrfToken) {
            logAction('hide-employer-api-missing-xsrf', {
                vacancyId,
                employerId
            }, context);
            return false;
        }

        const body = new URLSearchParams();
        body.set('employerId', employerId);
        body.set('_xsrf', xsrfToken);

        logAction('hide-employer-api-request-started', {
            vacancyId,
            employerId,
            path: HIDE_EMPLOYER_API_PATH
        }, context);

        try {
            const response = await fetch(new URL(HIDE_EMPLOYER_API_PATH, window.location.origin).toString(), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json, text/plain, */*',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Xsrftoken': xsrfToken,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: body.toString()
            });

            if (response.ok) {
                logAction('hide-employer-api-request-finished', {
                    vacancyId,
                    employerId,
                    status: response.status,
                    result: 'hidden'
                }, context);
                return true;
            }

            const state = vacancyId ? await fetchVacancyBlacklistState(vacancyId, employerId, context) : null;
            if (state?.employerIsBlacklisted) {
                logAction('hide-employer-api-state-confirmed', {
                    vacancyId,
                    employerId,
                    status: response.status,
                    result: 'hidden'
                }, context);
                return true;
            }

            const responseText = shortText(await response.text(), 220);
            logAction('hide-employer-api-request-failed', {
                vacancyId,
                employerId,
                status: response.status,
                responseText
            }, context);
            return false;
        } catch (error) {
            logAction('hide-employer-api-request-error', {
                vacancyId,
                employerId,
                reason: error instanceof Error ? error.message : String(error)
            }, context);
            return false;
        }
    }

    async function hideVacancyViaApi(card, vacancyId) {
        if (!vacancyId) {
            logAction('hide-api-missing-vacancy-id', {}, card);
            return false;
        }

        const xsrfToken = getXsrfToken();
        if (!xsrfToken) {
            logAction('hide-api-missing-xsrf', { vacancyId }, card);
            return false;
        }

        const employerId = getEmployerIdFromCard(card);
        const body = new URLSearchParams();
        body.set('vacancyId', vacancyId);
        body.set('_xsrf', xsrfToken);

        logAction('hide-api-request-started', {
            vacancyId,
            employerId,
            path: HIDE_VACANCY_API_PATH
        }, card);

        try {
            const response = await fetch(new URL(HIDE_VACANCY_API_PATH, window.location.origin).toString(), {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json, text/plain, */*',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Xsrftoken': xsrfToken,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: body.toString()
            });

            if (response.ok) {
                markCardAsHidden(card);
                syncHiddenCardButton(card);
                logAction('hide-api-request-finished', {
                    vacancyId,
                    employerId,
                    status: response.status,
                    result: 'hidden'
                }, card);
                return true;
            }

            const state = await fetchVacancyBlacklistState(vacancyId, employerId, card);
            if (state?.vacancyIsBlacklisted) {
                markCardAsHidden(card);
                syncHiddenCardButton(card);
                logAction('hide-api-state-confirmed', {
                    vacancyId,
                    employerId,
                    status: response.status,
                    result: 'hidden'
                }, card);
                return true;
            }

            const responseText = shortText(await response.text(), 220);
            logAction('hide-api-request-failed', {
                vacancyId,
                employerId,
                status: response.status,
                responseText
            }, card);
            return false;
        } catch (error) {
            logAction('hide-api-request-error', {
                vacancyId,
                employerId,
                reason: error instanceof Error ? error.message : String(error)
            }, card);
            return false;
        }
    }

    async function hideVacancy(card, expectedVacancyId = null) {
        const currentCardVacancyId = getVacancyIdFromCard(card);
        const targetVacancyId = expectedVacancyId || currentCardVacancyId || getCurrentVacancyId();

        if (expectedVacancyId && currentCardVacancyId && expectedVacancyId !== currentCardVacancyId) {
            logAction('hide-target-card-mismatch', {
                expectedVacancyId,
                cardVacancyId: currentCardVacancyId
            }, card);
            return false;
        }

        return hideVacancyViaApi(card, targetVacancyId);
    }

    async function handleVacancyPageHideClick(button, options) {
        if (!(button instanceof HTMLButtonElement)) {
            return;
        }

        if (button.dataset.state === 'busy' || button.dataset.state === 'success') {
            return;
        }

        const {
            target,
            defaultLabel,
            successLabel,
            onHide,
            patchState
        } = options;

        setButtonState(button, 'busy', 'Скрываю...');
        logAction('vacancy-page-hide-request-started', {
            target,
            vacancyId: getCurrentVacancyId(),
            employerId: getCurrentEmployerId()
        }, button);

        try {
            const hidden = await onHide();
            if (!hidden) {
                logAction('vacancy-page-hide-request-failed', {
                    target,
                    reason: 'hide-action-not-found'
                }, button);
                setButtonState(button, 'error', 'Не удалось');
                window.setTimeout(() => setButtonState(button, '', defaultLabel), 1800);
                return;
            }

            setButtonState(button, 'success', successLabel);
            vacancyPageStateVersion += 1;
            vacancyPageState = {
                vacancyHidden: false,
                employerHidden: false,
                ...(vacancyPageState || {}),
                ...patchState
            };
            vacancyPageStateDirty = false;
            renderVacancyPageStateIndicator(vacancyPageState);
            logAction('vacancy-page-hide-request-finished', {
                target,
                result: 'hidden'
            }, button);
            markVacancyPageStateDirty();
            window.setTimeout(scheduleRender, 240);
        } catch (error) {
            logAction('vacancy-page-hide-request-error', {
                target,
                reason: error instanceof Error ? error.message : String(error)
            }, button);
            setButtonState(button, 'error', 'Ошибка');
            window.setTimeout(() => setButtonState(button, '', defaultLabel), 1800);
        }
    }

    async function handleHideClick(card, button, expectedVacancyId = null) {
        if (button.dataset.state === 'busy') {
            logAction('hide-request-ignored-busy', {
                buttonLabel: button.dataset.defaultLabel || button.textContent || 'hide'
            }, card);
            return;
        }

        const defaultLabel = button.dataset.defaultLabel || 'Не интересно';

        setButtonState(button, 'busy', 'Скрываю...');
        logAction('hide-request-started', {
            buttonLabel: defaultLabel,
            expectedVacancyId: expectedVacancyId || null,
            cardVacancyId: getVacancyIdFromCard(card)
        }, card);

        try {
            const hidden = await hideVacancy(card, expectedVacancyId);
            if (!hidden) {
                logAction('hide-request-failed', {
                    buttonLabel: defaultLabel,
                    reason: 'hide-action-not-found'
                }, card);
                setButtonState(button, 'error', 'Не удалось');
                window.setTimeout(() => setButtonState(button, '', defaultLabel), 1800);
                return;
            }

            setButtonState(button, 'success', 'Скрыто');
            markVacancyPageStateDirty();
            logAction('hide-request-finished', {
                buttonLabel: defaultLabel,
                result: 'hidden'
            }, card);
            window.setTimeout(scheduleRender, 240);
        } catch (error) {
            logAction('hide-request-error', {
                buttonLabel: defaultLabel,
                reason: error instanceof Error ? error.message : String(error)
            }, card);
            setButtonState(button, 'error', 'Ошибка');
            window.setTimeout(() => setButtonState(button, '', defaultLabel), 1800);
        }
    }

    function ensureButton(card) {
        if (card.querySelector(`[${HIDE_BUTTON_MARKER}]`)) {
            return false;
        }

        const applyControl = findApplyControl(card);
        if (!applyControl || !(applyControl.parentElement instanceof HTMLElement)) {
            return false;
        }

        applyControl.parentElement.classList.add('hh-hide-vacancy-actions');

        const button = createHideButton('Не интересно');
        button.setAttribute(HIDE_BUTTON_MARKER, 'true');
        button.dataset.vacancyId = getVacancyIdFromCard(card) || '';
        bindHideButton(button, card);

        applyControl.insertAdjacentElement('afterend', button);
        if (card.hasAttribute(HIDDEN_CARD_MARKER)) {
            syncHiddenCardButton(card);
        }
        return true;
    }

    function ensureStatusHideButton(card) {
        if (card.querySelector(`[${HIDE_BUTTON_MARKER}]`)) {
            return false;
        }

        const statusControl = findWorkflowStatusControl(card);
        const actionsContainer = statusControl?.parentElement;
        if (!(statusControl instanceof HTMLElement) || !(actionsContainer instanceof HTMLElement)) {
            return false;
        }

        actionsContainer.classList.add('hh-hide-vacancy-actions');

        const button = createHideButton('Скрыть');
        button.setAttribute(HIDE_BUTTON_MARKER, 'true');
        button.dataset.vacancyId = getVacancyIdFromCard(card) || '';
        bindHideButton(button, card);

        actionsContainer.appendChild(button);
        if (card.hasAttribute(HIDDEN_CARD_MARKER)) {
            syncHiddenCardButton(card);
        }
        return true;
    }

    function renderCoverLetterPickers() {
        for (const textarea of getCoverLetterTextareas()) {
            ensureLetterPicker(textarea);
        }
    }

    function renderResponseNoteControls() {
        for (const textarea of getResponseNoteTextareas()) {
            ensureResponseNoteControl(textarea);
        }
    }

    function renderButtons() {
        if (!autoHideStatusCards) {
            restoreAutoHiddenCards();
        }

        for (const card of getVacancyCards()) {
            const hasWorkflowStatus = hasKnownWorkflowStatus(card);

            if (autoHideStatusCards && hasWorkflowStatus) {
                hideCardListBlock(card);
                continue;
            }

            if (hasWorkflowStatus) {
                ensureStatusHideButton(card);
                continue;
            }

            ensureButton(card);
        }

        renderCoverLetterPickers();
        renderResponseNoteControls();
        void renderVacancyPageState();
    }

    function scheduleRender() {
        window.clearTimeout(renderTimer);
        renderTimer = window.setTimeout(renderButtons, 120);
    }

    async function initializeSettings() {
        const [nextAutoHideStatusCards, nextDebugLoggingEnabled, nextSaveCustomResponseFields] = await Promise.all([
            readAutoHideStatusSetting(),
            readDebugLoggingSetting(),
            readSaveCustomResponseFieldsSetting()
        ]);

        autoHideStatusCards = nextAutoHideStatusCards;
        debugLoggingEnabled = nextDebugLoggingEnabled;
        saveCustomResponseFields = nextSaveCustomResponseFields;
        logAction('settings-initialized', {
            autoHideStatusCards,
            debugLoggingEnabled,
            saveCustomResponseFields
        });
        renderButtons();
    }

    void initializeSettings();

    const observer = new MutationObserver(() => {
        scheduleRender();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    const guardedHideButtonEvents = ['pointerdown', 'mousedown', 'mouseup', 'touchstart', 'touchend'];
    guardedHideButtonEvents.forEach((eventName) => {
        document.addEventListener(eventName, (event) => {
            if (getHideButtonFromEventTarget(event.target) || getVacancyPageHideButtonFromEventTarget(event.target)) {
                stopCardNavigation(event);
            }
        }, true);
    });

    document.addEventListener('click', (event) => {
        const vacancyPageButton = getVacancyPageHideButtonFromEventTarget(event.target);
        if (vacancyPageButton) {
            stopCardNavigation(event);
            triggerVacancyPageHideButtonAction(vacancyPageButton);
            return;
        }

        const button = getHideButtonFromEventTarget(event.target);
        if (button) {
            stopCardNavigation(event);
            triggerHideButtonAction(button);
            return;
        }

        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const root = target.closest(`[${LETTER_PICKER_MARKER}]`);
        closeAllLetterPickers(root);

        const actionable = target.closest('button, a, [role="button"], [role="menuitem"], li, div[tabindex]');
        if (!(actionable instanceof HTMLElement)) {
            return;
        }

        if (matchesAnyLabel(actionable, [...VACANCY_PAGE_HIDE_MENU_LABELS, ...VACANCY_PAGE_SHOW_MENU_LABELS])) {
            logAction('vacancy-page-menu-action-clicked', {
                label: getControlLabel(actionable)
            }, actionable);
            markVacancyPageStateDirty();
            window.setTimeout(scheduleRender, 240);
        }
    }, true);

    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const root = target.closest(`[${LETTER_PICKER_MARKER}]`);
        closeAllLetterPickers(root);

        const actionable = target.closest('button, a, [role="button"], [role="menuitem"], li, div[tabindex]');
        if (!(actionable instanceof HTMLElement)) {
            return;
        }

        if (matchesAnyLabel(actionable, [...VACANCY_PAGE_HIDE_MENU_LABELS, ...VACANCY_PAGE_SHOW_MENU_LABELS])) {
            markVacancyPageStateDirty();
            window.setTimeout(scheduleRender, 240);
        }
    });

    document.addEventListener('submit', handleVacancyResponseSubmit, true);

    chrome.storage?.onChanged?.addListener((changes, areaName) => {
        if (areaName !== 'local') {
            return;
        }

        let shouldRender = false;

        if (changes[DEBUG_LOGGING_STORAGE_KEY]) {
            const nextEnabled = changes[DEBUG_LOGGING_STORAGE_KEY].newValue === true;
            logSettingChange(DEBUG_LOGGING_STORAGE_KEY, nextEnabled);
            debugLoggingEnabled = nextEnabled;
        }

        if (changes[AUTO_HIDE_STATUS_STORAGE_KEY]) {
            autoHideStatusCards = changes[AUTO_HIDE_STATUS_STORAGE_KEY].newValue === true;
            logAction('auto-hide-setting-applied', {
                enabled: autoHideStatusCards
            });
            shouldRender = true;
        }

        if (changes[SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY]) {
            saveCustomResponseFields = changes[SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY].newValue === true;
            logSettingChange(SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY, saveCustomResponseFields);
            shouldRender = true;
        }

        if (shouldRender) {
            scheduleRender();
        }
    });

    window.addEventListener('pageshow', scheduleRender);
})();