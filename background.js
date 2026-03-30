chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'open-letters-page') {
        return false;
    }

    (async () => {
        try {
            await chrome.runtime.openOptionsPage();
            sendResponse({ ok: true, method: 'openOptionsPage' });
        } catch (error) {
            try {
                await chrome.tabs.create({ url: chrome.runtime.getURL('letters.html') });
                sendResponse({ ok: true, method: 'tabs.create' });
            } catch (fallbackError) {
                sendResponse({
                    ok: false,
                    reason: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
                });
            }
        }
    })();

    return true;
});