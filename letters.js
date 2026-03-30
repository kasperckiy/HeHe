const LETTERS_KEY = 'coverLetters';

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

function getFormNodes() {
    return {
        form: document.getElementById('letter-form'),
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

function fillForm(letter) {
    const { id, title, body } = getFormNodes();
    id.value = letter?.id || '';
    title.value = letter?.title || '';
    body.value = letter?.body || '';
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
    resetForm();
    void renderLetters();
});