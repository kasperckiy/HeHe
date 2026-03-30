const AUTO_HIDE_STATUS_STORAGE_KEY = 'autoHideStatusCards';
const DEBUG_LOGGING_STORAGE_KEY = 'debugLoggingEnabled';
const SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY = 'saveCustomResponseFields';
const LETTERS_STORAGE_KEY = 'coverLetters';
const POPUP_LOG_PREFIX = '[HeHe][popup]';

let debugLoggingEnabled = false;

function normalizeLetters(value) {
    return Array.isArray(value) ? value : [];
}

async function readLetters() {
    const result = await chrome.storage.local.get({ [LETTERS_STORAGE_KEY]: [] });
    return normalizeLetters(result[LETTERS_STORAGE_KEY]);
}

async function readSettings() {
    return chrome.storage.local.get({
        [AUTO_HIDE_STATUS_STORAGE_KEY]: false,
        [DEBUG_LOGGING_STORAGE_KEY]: false,
        [SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY]: true
    });
}

async function writeSetting(key, value) {
    await chrome.storage.local.set({ [key]: value });
}

function logPopupAction(action, details = {}) {
    if (!debugLoggingEnabled && !(action === 'debug-logging-changed' && details.enabled === true)) {
        return;
    }

    console.log(POPUP_LOG_PREFIX, {
        action,
        ...details
    });
}

function renderPreview(letters) {
    const countNode = document.getElementById('letters-count');
    const previewNode = document.getElementById('letters-preview');

    countNode.textContent = String(letters.length);
    previewNode.replaceChildren();

    letters
        .slice()
        .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
        .slice(0, 3)
        .forEach((letter) => {
            const item = document.createElement('li');
            item.className = 'popup-list__item';
            item.textContent = letter.title || 'Без названия';
            item.title = `Сохранённая заметка «${letter.title || 'Без названия'}».`;
            previewNode.appendChild(item);
        });
}

async function bootstrapPopup() {
    const [letters, settings] = await Promise.all([readLetters(), readSettings()]);
    renderPreview(letters);

    const autoHideToggle = document.getElementById('auto-hide-statuses');
    const debugToggle = document.getElementById('debug-logging');
    const saveCustomFieldsToggle = document.getElementById('save-custom-response-fields');
    autoHideToggle.checked = settings[AUTO_HIDE_STATUS_STORAGE_KEY] === true;
    debugToggle.checked = settings[DEBUG_LOGGING_STORAGE_KEY] === true;
    saveCustomFieldsToggle.checked = settings[SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY] === true;
    debugLoggingEnabled = debugToggle.checked;

    autoHideToggle.addEventListener('change', () => {
        logPopupAction('auto-hide-changed', { enabled: autoHideToggle.checked });
        void writeSetting(AUTO_HIDE_STATUS_STORAGE_KEY, autoHideToggle.checked);
    });

    debugToggle.addEventListener('change', () => {
        const nextEnabled = debugToggle.checked;
        logPopupAction('debug-logging-changed', { enabled: nextEnabled });
        debugLoggingEnabled = nextEnabled;
        void writeSetting(DEBUG_LOGGING_STORAGE_KEY, nextEnabled);
    });

    saveCustomFieldsToggle.addEventListener('change', () => {
        logPopupAction('save-custom-response-fields-changed', { enabled: saveCustomFieldsToggle.checked });
        void writeSetting(SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY, saveCustomFieldsToggle.checked);
    });

    document.getElementById('open-letters').addEventListener('click', () => {
        logPopupAction('letters-page-opened', { source: 'popup-button' });
        chrome.runtime.openOptionsPage();
        window.close();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    void bootstrapPopup();
});