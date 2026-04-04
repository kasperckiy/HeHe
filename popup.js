const AUTO_HIDE_STATUS_STORAGE_KEY = 'autoHideStatusCards';
const SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY = 'saveCustomResponseFields';
const LETTERS_STORAGE_KEY = 'coverLetters';
const GEMINI_API_KEY_STORAGE_KEY = 'geminiApiKey';
const GEMINI_MODEL_STORAGE_KEY = 'geminiModelId';
const GEMINI_PRESET_STORAGE_KEY = 'geminiRewritePreset';
const GEMINI_REWRITE_CONFIG_PATH = 'prompts/gemini-rewrite.json';

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
        [SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY]: true,
        [GEMINI_API_KEY_STORAGE_KEY]: '',
        [GEMINI_MODEL_STORAGE_KEY]: '',
        [GEMINI_PRESET_STORAGE_KEY]: ''
    });
}

async function writeSetting(key, value) {
    await chrome.storage.local.set({ [key]: value });
}

async function loadGeminiRewriteConfig() {
    const response = await fetch(chrome.runtime.getURL(GEMINI_REWRITE_CONFIG_PATH));
    if (!response.ok) {
        throw new Error(`Failed to load Gemini config: ${response.status}`);
    }

    return response.json();
}

function findConfigEntry(items, id, fallbackId) {
    if (!Array.isArray(items) || !items.length) {
        return null;
    }

    return items.find((item) => item?.id === id)
        || items.find((item) => item?.id === fallbackId)
        || items[0]
        || null;
}

function populateSelect(selectNode, items, selectedId, fallbackId) {
    selectNode.replaceChildren();

    const resolvedEntry = findConfigEntry(items, selectedId, fallbackId);
    items.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.label;
        option.title = item.description || item.label;
        if (resolvedEntry?.id === item.id) {
            option.selected = true;
        }
        selectNode.appendChild(option);
    });

    if (resolvedEntry?.id) {
        selectNode.value = resolvedEntry.id;
    }

    return resolvedEntry;
}

function setNodeTextAndHint(node, text) {
    node.textContent = text;
    if (text) {
        node.title = text;
    } else {
        node.removeAttribute('title');
    }
}

function updateGeminiApiKeyStatus(input, node) {
    const hasKey = input.value.trim().length > 0;
    setNodeTextAndHint(
        node,
        hasKey ? 'Ключ сохранён локально в браузере.' : 'Ключ не задан. Без него переписывание не сработает.'
    );
}

function updateConfigEntryHint(selectNode, items, node) {
    const selected = items.find((item) => item?.id === selectNode.value);
    setNodeTextAndHint(node, selected?.description || '');
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
    const [letters, settings, geminiConfig] = await Promise.all([
        readLetters(),
        readSettings(),
        loadGeminiRewriteConfig()
    ]);
    renderPreview(letters);

    const autoHideToggle = document.getElementById('auto-hide-statuses');
    const saveCustomFieldsToggle = document.getElementById('save-custom-response-fields');
    const geminiApiKeyInput = document.getElementById('gemini-api-key');
    const geminiApiKeyStatus = document.getElementById('gemini-api-key-status');
    const geminiModelSelect = document.getElementById('gemini-model');
    const geminiModelHint = document.getElementById('gemini-model-hint');
    const geminiPresetSelect = document.getElementById('gemini-preset');
    const geminiPresetHint = document.getElementById('gemini-preset-hint');

    autoHideToggle.checked = settings[AUTO_HIDE_STATUS_STORAGE_KEY] === true;
    saveCustomFieldsToggle.checked = settings[SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY] === true;
    geminiApiKeyInput.value = String(settings[GEMINI_API_KEY_STORAGE_KEY] || '');

    const selectedModel = populateSelect(
        geminiModelSelect,
        geminiConfig.models || [],
        settings[GEMINI_MODEL_STORAGE_KEY],
        geminiConfig.defaultModelId
    );
    const selectedPreset = populateSelect(
        geminiPresetSelect,
        geminiConfig.presets || [],
        settings[GEMINI_PRESET_STORAGE_KEY],
        geminiConfig.defaultPresetId
    );

    updateGeminiApiKeyStatus(geminiApiKeyInput, geminiApiKeyStatus);
    updateConfigEntryHint(geminiModelSelect, geminiConfig.models || [], geminiModelHint);
    updateConfigEntryHint(geminiPresetSelect, geminiConfig.presets || [], geminiPresetHint);

    if (selectedModel?.id && settings[GEMINI_MODEL_STORAGE_KEY] !== selectedModel.id) {
        void writeSetting(GEMINI_MODEL_STORAGE_KEY, selectedModel.id);
    }

    if (selectedPreset?.id && settings[GEMINI_PRESET_STORAGE_KEY] !== selectedPreset.id) {
        void writeSetting(GEMINI_PRESET_STORAGE_KEY, selectedPreset.id);
    }

    autoHideToggle.addEventListener('change', () => {
        void writeSetting(AUTO_HIDE_STATUS_STORAGE_KEY, autoHideToggle.checked);
    });

    saveCustomFieldsToggle.addEventListener('change', () => {
        void writeSetting(SAVE_CUSTOM_RESPONSE_FIELDS_STORAGE_KEY, saveCustomFieldsToggle.checked);
    });

    geminiApiKeyInput.addEventListener('input', () => {
        const nextValue = geminiApiKeyInput.value.trim();
        updateGeminiApiKeyStatus(geminiApiKeyInput, geminiApiKeyStatus);
        void writeSetting(GEMINI_API_KEY_STORAGE_KEY, nextValue);
    });

    geminiModelSelect.addEventListener('change', () => {
        updateConfigEntryHint(geminiModelSelect, geminiConfig.models || [], geminiModelHint);
        void writeSetting(GEMINI_MODEL_STORAGE_KEY, geminiModelSelect.value);
    });

    geminiPresetSelect.addEventListener('change', () => {
        updateConfigEntryHint(geminiPresetSelect, geminiConfig.presets || [], geminiPresetHint);
        void writeSetting(GEMINI_PRESET_STORAGE_KEY, geminiPresetSelect.value);
    });

    document.getElementById('open-letters').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
        window.close();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    void bootstrapPopup();
});