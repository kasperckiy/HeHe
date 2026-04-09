const LETTERS_KEY = 'coverLetters';
const GEMINI_REWRITE_TEXT_MESSAGE = 'gemini-rewrite-text';
const GEMINI_REWRITE_PRESETS = [
    {
        id: 'grammar-fix',
        label: 'Грамматика',
        hint: 'Исправляет грамматику и пунктуацию без смены смысла.',
        busyHint: 'Исправляет грамматику и пунктуацию в Gemini.',
        icon: 'grammar'
    },
    {
        id: 'translate-close',
        label: 'Перевод RU/EN',
        hint: 'Переводит максимально близко между русским и английским без отсебятины.',
        busyHint: 'Переводит текст через Gemini без добавления новых фактов.',
        icon: 'translate'
    },
    {
        id: 'rewrite-clean',
        label: 'Чище',
        hint: 'Делает текст яснее и мягче, сохраняя факты.',
        busyHint: 'Переписывает текст мягче и чище в Gemini.',
        icon: 'clean'
    },
    {
        id: 'rewrite-strong',
        label: 'Сильнее',
        hint: 'Делает подачу увереннее без преувеличений.',
        busyHint: 'Усиливает подачу текста через Gemini.',
        icon: 'strong'
    },
    {
        id: 'rewrite-compact',
        label: 'Короче',
        hint: 'Сжимает текст без потери ключевого смысла.',
        busyHint: 'Сокращает текст через Gemini без потери смысла.',
        icon: 'compact'
    }
];

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

async function loadLetters() {
    const result = await chrome.storage.local.get({ [LETTERS_KEY]: [] });
    return asArray(result[LETTERS_KEY]);
}

async function saveLetters(letters) {
    await chrome.storage.local.set({ [LETTERS_KEY]: letters });
}

function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `letter-${Date.now()}`;
}

function formatDate(timestamp) {
    if (!timestamp) {
        return 'без даты';
    }

    return new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date(timestamp));
}

function shortText(text, maxLength = 160) {
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

function getFormNodes() {
    return {
        form: document.getElementById('letter-form'),
        actions: document.querySelector('.form-actions'),
        id: document.getElementById('letter-id'),
        title: document.getElementById('letter-title'),
        body: document.getElementById('letter-body'),
        status: document.getElementById('form-status'),
        total: document.getElementById('letters-total'),
        list: document.getElementById('letters-list'),
        template: document.getElementById('letter-card-template')
    };
}

function setStatus(message, tone = 'muted') {
    const { status } = getFormNodes();
    status.textContent = message;
    status.title = message || 'Показывает результат действия.';
    status.style.color = tone === 'danger' ? '#b64c43' : '#59738d';
}

function getGeminiRewritePresetDefinition(presetId) {
    return GEMINI_REWRITE_PRESETS.find((preset) => preset.id === presetId) || null;
}

function getGeminiRewriteIconMarkup(icon) {
    const icons = {
        grammar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M4 12h7M4 17h9"></path><path d="M14 13.5 16.5 16 21 11.5"></path></svg>',
        translate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h11"></path><path d="m12 3 3.5 4L12 11"></path><path d="M20 17H9"></path><path d="m12 13-3.5 4 3.5 4"></path></svg>',
        clean: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 18 7-7"></path><path d="m10 7 2-2"></path><path d="m13 4 1-1"></path><path d="m14 10 6-6"></path><path d="M13 11 6 18"></path><path d="m15 13 1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z"></path></svg>',
        strong: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17 10 12 13 15 19 9"></path><path d="M15 9h4v4"></path><path d="M5 5v14h14"></path></svg>',
        compact: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h7"></path><path d="m9 4 5 5-5 5"></path><path d="M20 15h-7"></path><path d="m15 10-5 5 5 5"></path></svg>'
    };

    return icons[icon] || icons.clean;
}

function getGeminiRewriteControlNodes() {
    const { actions } = getFormNodes();
    if (!(actions instanceof HTMLElement)) {
        return null;
    }

    const root = actions.querySelector('.hh-gemini-rewrite-control');
    if (!(root instanceof HTMLElement)) {
        return null;
    }

    const buttons = Array.from(root.querySelectorAll('.hh-gemini-rewrite-control__button')).filter(
        (button) => button instanceof HTMLButtonElement
    );
    const progress = root.querySelector('.hh-gemini-rewrite-control__progress');
    const status = root.querySelector('.hh-gemini-rewrite-control__status');
    if (!(progress instanceof HTMLElement) || !(status instanceof HTMLElement) || !buttons.length) {
        return null;
    }

    return { root, buttons, progress, status };
}

function setGeminiRewriteControlState(state, statusText = '', statusHint = statusText, activePresetId = '') {
    const nodes = getGeminiRewriteControlNodes();
    if (!nodes) {
        return;
    }

    if (state) {
        nodes.root.dataset.state = state;
    } else {
        delete nodes.root.dataset.state;
    }

    nodes.root.setAttribute('aria-busy', state === 'busy' ? 'true' : 'false');

    if (activePresetId) {
        nodes.root.dataset.activePresetId = activePresetId;
    } else {
        delete nodes.root.dataset.activePresetId;
    }

    nodes.progress.hidden = state !== 'busy';

    nodes.buttons.forEach((button) => {
        const isActive = !!activePresetId && button.dataset.presetId === activePresetId;
        button.disabled = state === 'busy';

        if (isActive && state) {
            button.dataset.state = state;
        } else {
            delete button.dataset.state;
        }

        if (state === 'busy' && isActive) {
            setHint(button, button.dataset.busyHint || button.dataset.defaultHint || 'Отправляет текст в Gemini.');
            return;
        }

        if (state === 'error' && isActive) {
            setHint(button, statusHint || button.dataset.defaultHint || 'Не удалось переписать текст.');
            return;
        }

        if (state === 'success' && isActive) {
            setHint(button, statusHint || button.dataset.successHint || button.dataset.defaultHint || 'Текст обновлён.');
            return;
        }

        setHint(button, button.dataset.defaultHint || 'Отправляет текст в Gemini.');
    });

    if (statusText) {
        nodes.status.hidden = false;
        setTextWithHint(nodes.status, statusText, statusHint);
        return;
    }

    nodes.status.hidden = true;
    setTextWithHint(nodes.status, '', '');
}

function clearGeminiRewriteControlState() {
    const nodes = getGeminiRewriteControlNodes();
    if (nodes && nodes.root.dataset.state !== 'busy') {
        setGeminiRewriteControlState('', '', '', '');
    }
}

function getGeminiRewriteFieldLabel() {
    const { title } = getFormNodes();
    const noteTitle = title instanceof HTMLInputElement ? title.value.trim() : '';
    return noteTitle ? `Текст заметки «${shortText(noteTitle, 60)}»` : 'Текст заметки';
}

function setNativeTextValue(textarea, value) {
    textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
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

async function rewriteLetterBodyWithGemini(presetId) {
    const { body } = getFormNodes();
    const preset = getGeminiRewritePresetDefinition(presetId);
    const text = body instanceof HTMLTextAreaElement ? body.value.trim() : '';

    if (!(body instanceof HTMLTextAreaElement)) {
        return;
    }

    if (!text) {
        setGeminiRewriteControlState('error', 'Сначала введи текст заметки.', 'Поле текста заметки пустое.', presetId);
        body.focus();
        return;
    }

    setGeminiRewriteControlState(
        'busy',
        `Применяю режим «${preset?.label || 'Gemini'}»...`,
        preset?.busyHint || 'Отправляет текст в Gemini.',
        presetId
    );

    try {
        const response = await sendRuntimeMessage({
            type: GEMINI_REWRITE_TEXT_MESSAGE,
            text: body.value,
            presetId,
            fieldLabel: getGeminiRewriteFieldLabel(),
            vacancyTitle: '',
            vacancyId: ''
        });

        if (!response?.ok || typeof response?.text !== 'string') {
            setGeminiRewriteControlState(
                'error',
                response?.reason || 'Не удалось переписать текст. Попробуй ещё раз.',
                response?.reason || 'Gemini rewrite failed.',
                presetId
            );
            return;
        }

        setNativeTextValue(body, response.text);
        body.focus();
        setGeminiRewriteControlState(
            'success',
            `Готово: ${response.presetLabel || preset?.label || 'Gemini'}.`,
            `Модель: ${response.modelLabel || response.modelId || 'Gemini'}. Режим: ${response.presetLabel || response.presetId || 'rewrite'}.`,
            presetId
        );
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        setGeminiRewriteControlState('error', reason || 'Не удалось переписать текст.', reason, presetId);
    }
}

function ensureGeminiRewriteControl() {
    const nodes = getFormNodes();
    if (!(nodes.actions instanceof HTMLElement) || !(nodes.body instanceof HTMLTextAreaElement) || !(nodes.status instanceof HTMLElement)) {
        return;
    }

    const existing = getGeminiRewriteControlNodes();
    if (existing) {
        return;
    }

    const root = document.createElement('div');
    root.className = 'hh-gemini-rewrite-control';
    root.dataset.position = 'inline';
    root.setAttribute('aria-busy', 'false');

    const row = document.createElement('div');
    row.className = 'hh-gemini-rewrite-control__row';

    GEMINI_REWRITE_PRESETS.forEach((preset) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hh-gemini-rewrite-control__button';
        button.dataset.presetId = preset.id;
        button.dataset.defaultHint = preset.hint;
        button.dataset.busyHint = preset.busyHint;
        button.dataset.successHint = `${preset.label}: текст обновлён.`;
        button.setAttribute('aria-label', preset.label);
        setHint(button, preset.hint);

        const icon = document.createElement('span');
        icon.className = 'hh-gemini-rewrite-control__button-icon';
        icon.innerHTML = getGeminiRewriteIconMarkup(preset.icon);

        const loader = document.createElement('span');
        loader.className = 'hh-gemini-rewrite-control__button-loader';
        loader.setAttribute('aria-hidden', 'true');

        button.append(icon, loader);
        button.addEventListener('click', () => {
            void rewriteLetterBodyWithGemini(preset.id);
        });
        row.appendChild(button);
    });

    const progress = document.createElement('span');
    progress.className = 'hh-gemini-rewrite-control__progress';
    progress.hidden = true;

    const status = document.createElement('p');
    status.className = 'hh-gemini-rewrite-control__status';
    status.hidden = true;
    status.setAttribute('aria-live', 'polite');

    if (!nodes.body.dataset.geminiRewriteBound) {
        nodes.body.addEventListener('input', () => {
            clearGeminiRewriteControlState();
        });
        nodes.body.dataset.geminiRewriteBound = 'true';
    }

    root.append(row, progress, status);
    nodes.actions.insertBefore(root, nodes.status);
}

function fillForm(letter) {
    const { id, title, body } = getFormNodes();
    id.value = letter?.id || '';
    title.value = letter?.title || '';
    body.value = letter?.body || '';
    clearGeminiRewriteControlState();
    title.focus();
}

function resetForm() {
    fillForm(null);
    setStatus('Готово к добавлению новой заметки.');
}

function sortLetters(letters) {
    return letters.slice().sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0));
}

async function renderLetters() {
    const nodes = getFormNodes();
    const letters = sortLetters(await loadLetters());
    nodes.total.textContent = String(letters.length);
    nodes.list.replaceChildren();

    if (!letters.length) {
        nodes.list.dataset.empty = 'true';
        const empty = document.createElement('p');
        empty.className = 'letters-empty';
        empty.textContent = 'Пока пусто. Добавь первую заметку, и она сохранится в памяти расширения.';
        nodes.list.appendChild(empty);
        return;
    }

    delete nodes.list.dataset.empty;

    letters.forEach((letter) => {
        const fragment = nodes.template.content.cloneNode(true);
        const mainButton = fragment.querySelector('.letter-card__main');
        const titleNode = fragment.querySelector('.letter-card__title');
        const metaNode = fragment.querySelector('.letter-card__meta');
        const previewNode = fragment.querySelector('.letter-card__preview');
        const deleteButton = fragment.querySelector('.letter-card__delete');

        titleNode.textContent = letter.title;
        metaNode.textContent = `Обновлено ${formatDate(letter.updatedAt)}`;
        previewNode.textContent = shortText(letter.body);
        mainButton.title = `Открывает заметку «${shortText(letter.title || 'Без названия', 60)}» в редакторе.`;
        deleteButton.title = `Удаляет заметку «${shortText(letter.title || 'Без названия', 60)}».`;

        mainButton.addEventListener('click', () => {
            fillForm(letter);
            setStatus('Заметка загружена в редактор.');
        });

        deleteButton.addEventListener('click', async () => {
            const nextLetters = asArray(await loadLetters()).filter((item) => item.id !== letter.id);
            await saveLetters(nextLetters);

            const { id } = getFormNodes();
            if (id.value === letter.id) {
                resetForm();
            }

            await renderLetters();
            setStatus('Заметка удалена из памяти.');
        });

        nodes.list.appendChild(fragment);
    });
}

async function handleSubmit(event) {
    event.preventDefault();

    const nodes = getFormNodes();
    const title = nodes.title.value.trim();
    const body = nodes.body.value.trim();

    if (!title || !body) {
        setStatus('Заполни название и текст заметки.', 'danger');
        return;
    }

    const letters = asArray(await loadLetters());
    const currentId = nodes.id.value || createId();
    const now = Date.now();
    const nextLetter = {
        id: currentId,
        title,
        body,
        updatedAt: now
    };

    const nextLetters = letters.some((letter) => letter.id === currentId)
        ? letters.map((letter) => (letter.id === currentId ? nextLetter : letter))
        : [...letters, nextLetter];

    await saveLetters(nextLetters);
    nodes.id.value = currentId;
    await renderLetters();
    setStatus('Заметка сохранена в памяти расширения.');
}

function attachEvents() {
    const nodes = getFormNodes();
    nodes.form.addEventListener('submit', (event) => {
        void handleSubmit(event);
    });

    document.getElementById('reset-form').addEventListener('click', () => {
        resetForm();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    attachEvents();
    ensureGeminiRewriteControl();
    resetForm();
    void renderLetters();
});