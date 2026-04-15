# Privacy Policy For HeHe

Effective date: 2026-04-15

HeHe is a browser extension for HH sites, including hh.ru, hh.kz, hh.uz, hh.by, and rabota.by. It helps users hide vacancies, save response notes, and optionally rewrite response text through Gemini after an explicit user action.

## What Data The Extension Processes

- content visible on supported HH pages opened by the user
- text entered by the user into response forms on supported HH pages
- notes explicitly saved by the user inside the extension
- extension settings, including the Gemini API key provided by the user

## How The Data Is Used

- notes and settings are stored locally using the browser extension storage API
- the Gemini API key is stored locally and used only to authenticate requests initiated by the user
- response text is sent to the Google Gemini API only when the user explicitly clicks one of the Gemini rewrite buttons next to a field
- requests to the current supported HH domain are used only to perform hide actions requested by the user and to check their state

## What The Extension Does Not Do

- it does not run its own backend server
- it does not sell user data
- it does not use analytics or advertising trackers
- it does not automatically send response text to Gemini in the background

## Third-Party Services

- hh.ru, hh.kz, hh.uz, hh.by, rabota.by
- Google Gemini API

## Data Retention

- notes remain in local browser storage until the user changes or deletes them
- the Gemini API key remains in local browser storage until the user removes it

## Contact

Support URL: <https://github.com/kasperckiy/HeHe/issues>
