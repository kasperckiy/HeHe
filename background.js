const OPEN_LETTERS_PAGE_MESSAGE = 'open-letters-page';
const GEMINI_REWRITE_TEXT_MESSAGE = 'gemini-rewrite-text';
const GEMINI_GENERATE_NOTE_TITLE_MESSAGE = 'gemini-generate-note-title';
const GEMINI_API_KEY_STORAGE_KEY = 'geminiApiKey';
const GEMINI_MODEL_STORAGE_KEY = 'geminiModelId';
const GEMINI_REWRITE_CONFIG_PATH = 'prompts/gemini-rewrite.json';

let geminiRewriteConfigPromise = null;

async function loadGeminiRewriteConfig() {
    if (!geminiRewriteConfigPromise) {
        geminiRewriteConfigPromise = fetch(chrome.runtime.getURL(GEMINI_REWRITE_CONFIG_PATH))
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load Gemini config: ${response.status}`);
                }

                return response.json();
            })
            .catch((error) => {
                geminiRewriteConfigPromise = null;
                throw error;
            });
    }

    return geminiRewriteConfigPromise;
}

async function readGeminiSettings() {
    return chrome.storage.local.get({
        [GEMINI_API_KEY_STORAGE_KEY]: '',
        [GEMINI_MODEL_STORAGE_KEY]: ''
    });
}

function findGeminiConfigEntry(items, id, fallbackId) {
    if (!Array.isArray(items) || !items.length) {
        return null;
    }

    return items.find((item) => item?.id === id)
        || items.find((item) => item?.id === fallbackId)
        || items[0]
        || null;
}

function buildGeminiRewritePrompt(payload, preset) {
    const context = [];
    const preserveAllContent = preset?.id !== 'rewrite-compact';

    if (payload?.fieldLabel) {
        context.push(`Поле формы: ${payload.fieldLabel}`);
    }

    if (payload?.vacancyTitle) {
        context.push(`Вакансия: ${payload.vacancyTitle}`);
    }

    return [
        preset?.instruction || '',
        context.length ? context.join('\n') : '',
        preserveAllContent
            ? 'Сохрани все абзацы, предложения, ссылки, списки и смысловые блоки исходного текста. Ничего не пропускай и не выбрасывай, если режим явно не просит сокращать текст.'
            : '',
        'Исходный текст:',
        payload?.text || '',
        'Верни только переписанный текст без пояснений.'
    ].filter(Boolean).join('\n\n');
}

function buildGeminiNoteTitlePrompt(payload) {
    const context = [];

    if (payload?.currentTitle) {
        context.push(`Текущее название: ${payload.currentTitle}`);
    }

    return [
        'Придумай короткое и конкретное название заметки на основе её текста.',
        'Название должно отражать суть заметки, быть полезным для поиска и не выглядеть как заголовок статьи.',
        'Сохраняй основной язык исходного текста.',
        'Ограничения: до 70 символов, без кавычек, без завершающей точки, одна строка.',
        context.length ? context.join('\n') : '',
        'Текст заметки:',
        payload?.text || '',
        'Верни только готовое название.'
    ].filter(Boolean).join('\n\n');
}

function extractGeminiText(responseData) {
    const candidate = responseData?.candidates?.[0];
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
        return '';
    }

    return parts
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim();
}

function getGeminiFailureReason(responseData, fallbackReason) {
    if (responseData?.error?.message) {
        return responseData.error.message;
    }

    if (responseData?.promptFeedback?.blockReason) {
        return `Запрос отклонён Gemini: ${responseData.promptFeedback.blockReason}`;
    }

    return fallbackReason;
}

async function handleOpenLettersPage() {
    try {
        await chrome.runtime.openOptionsPage();
        return { ok: true, method: 'openOptionsPage' };
    } catch {
        try {
            await chrome.tabs.create({ url: chrome.runtime.getURL('letters.html') });
            return { ok: true, method: 'tabs.create' };
        } catch (fallbackError) {
            return {
                ok: false,
                reason: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            };
        }
    }
}

async function handleGeminiRewriteText(message) {
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    if (!text) {
        return { ok: false, reason: 'Сначала введи текст в поле.' };
    }

    const [config, settings] = await Promise.all([
        loadGeminiRewriteConfig(),
        readGeminiSettings()
    ]);

    const apiKey = String(settings[GEMINI_API_KEY_STORAGE_KEY] || '').trim();
    if (!apiKey) {
        return { ok: false, reason: 'Добавь Gemini API key в настройках расширения.' };
    }

    const model = findGeminiConfigEntry(
        config?.models,
        settings[GEMINI_MODEL_STORAGE_KEY],
        config?.defaultModelId
    );
    if (!model?.id) {
        return { ok: false, reason: 'Не выбрана поддерживаемая Gemini-модель.' };
    }

    const preset = findGeminiConfigEntry(
        config?.presets,
        typeof message?.presetId === 'string' ? message.presetId.trim() : '',
        config?.defaultPresetId
    );
    if (!preset?.id) {
        return { ok: false, reason: 'Не выбран режим переписывания.' };
    }

    const requestBody = {
        contents: [{
            role: 'user',
            parts: [{ text: buildGeminiRewritePrompt(message, preset) }]
        }],
        systemInstruction: {
            parts: [{ text: config?.systemInstruction || '' }]
        },
        generationConfig: {
            responseMimeType: 'text/plain',
            candidateCount: 1,
            maxOutputTokens: 4096,
            thinkingConfig: {
                thinkingLevel: 'low'
            }
        },
        store: false
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const responseData = await response.json().catch(() => null);
        if (!response.ok) {
            return {
                ok: false,
                reason: getGeminiFailureReason(responseData, `Gemini вернул ошибку ${response.status}.`)
            };
        }

        const rewrittenText = extractGeminiText(responseData);
        if (!rewrittenText) {
            return { ok: false, reason: 'Gemini не вернул текст для вставки.' };
        }

        return {
            ok: true,
            text: rewrittenText,
            modelId: model.id,
            modelLabel: model.label || model.id,
            presetId: preset.id,
            presetLabel: preset.label || preset.id
        };
    } catch (error) {
        return {
            ok: false,
            reason: error instanceof Error ? error.message : String(error)
        };
    }
}

async function handleGeminiGenerateNoteTitle(message) {
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    if (!text) {
        return { ok: false, reason: 'Сначала введи текст заметки.' };
    }

    const [config, settings] = await Promise.all([
        loadGeminiRewriteConfig(),
        readGeminiSettings()
    ]);

    const apiKey = String(settings[GEMINI_API_KEY_STORAGE_KEY] || '').trim();
    if (!apiKey) {
        return { ok: false, reason: 'Добавь Gemini API key в настройках расширения.' };
    }

    const model = findGeminiConfigEntry(
        config?.models,
        settings[GEMINI_MODEL_STORAGE_KEY],
        config?.defaultModelId
    );
    if (!model?.id) {
        return { ok: false, reason: 'Не выбрана поддерживаемая Gemini-модель.' };
    }

    const requestBody = {
        contents: [{
            role: 'user',
            parts: [{ text: buildGeminiNoteTitlePrompt(message) }]
        }],
        systemInstruction: {
            parts: [{ text: config?.systemInstruction || '' }]
        },
        generationConfig: {
            responseMimeType: 'text/plain',
            candidateCount: 1,
            maxOutputTokens: 256
        },
        store: false
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.id)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const responseData = await response.json().catch(() => null);
        if (!response.ok) {
            return {
                ok: false,
                reason: getGeminiFailureReason(responseData, `Gemini вернул ошибку ${response.status}.`)
            };
        }

        const generatedTitle = extractGeminiText(responseData).replace(/\s+/g, ' ').trim().replace(/[.。]+$/u, '').slice(0, 70).trim();
        if (!generatedTitle) {
            return { ok: false, reason: 'Gemini не вернул название заметки.' };
        }

        return {
            ok: true,
            title: generatedTitle,
            modelId: model.id,
            modelLabel: model.label || model.id
        };
    } catch (error) {
        return {
            ok: false,
            reason: error instanceof Error ? error.message : String(error)
        };
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === OPEN_LETTERS_PAGE_MESSAGE) {
        void handleOpenLettersPage().then(sendResponse);
        return true;
    }

    if (message?.type === GEMINI_REWRITE_TEXT_MESSAGE) {
        void handleGeminiRewriteText(message).then(sendResponse).catch((error) => {
            sendResponse({
                ok: false,
                reason: error instanceof Error ? error.message : String(error)
            });
        });
        return true;
    }

    if (message?.type === GEMINI_GENERATE_NOTE_TITLE_MESSAGE) {
        void handleGeminiGenerateNoteTitle(message).then(sendResponse).catch((error) => {
            sendResponse({
                ok: false,
                reason: error instanceof Error ? error.message : String(error)
            });
        });
        return true;
    }

    return false;
});