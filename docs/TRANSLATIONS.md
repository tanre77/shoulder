# Translations

English is the source of truth for shoulder documentation.

Each translation opens with a short note that the text is machine-assisted and that English is authoritative. Keep that note. When English and a translation disagree, follow the English file.

## Layout

User-facing English documents live at the repository root or under `docs/`. Translations use the same words, in the reader's language.

| English file | Translation |
| --- | --- |
| `README.md` | `README.<lang>.md` beside it |
| A future guide at `docs/some-guide.md` | `docs/<lang>/some-guide.md` |
| This file, `docs/TRANSLATIONS.md` | English only. It is the maintainer note. |

Language codes, in switcher order:

`es`, `fr`, `de`, `pt-BR`, `it`, `zh-CN`, `zh-TW`, `ja`, `ko`, `ar`, `hi`, `ru`, `vi`, `tr`, `id`, `pl`, `nl`, `uk`, `fil`, `sw`.

`pt-BR` is Brazilian Portuguese. `zh-CN` is Simplified Chinese. `zh-TW` is Traditional Chinese. `fil` is Filipino. `sw` is Swahili.

## Language switcher

`README.md` and every `README.<lang>.md` start with the same line of languages. Use the native name. Link English to `README.md` and each other language to `README.<lang>.md`, including the language of the file itself. Bold the language of the current file. When a language is added or removed, update that line in every README.

## When English changes

1. Edit the English document first.
2. Update every translation of that document in the same change. Translate only what the English text says.
3. Leave code blocks, commands, file paths, URLs, product names (`shoulder`, `iOS`), and badges unchanged and working.
4. Point relative links at the right place from the translated file. A `README.<lang>.md` sits next to `README.md`, so links to `src/`, `ios/`, and `docs/TRANSLATIONS.md` stay the same. A file under `docs/<lang>/` needs extra `../` segments to reach the repository root.
5. For Arabic, leave the language switcher as Markdown above the translation so it stays left to right. Wrap the translated prose in `<div dir="rtl">` and write that prose as HTML, because Markdown inside a raw HTML block is not rendered. Put `shoulder`, paths, and URLs in `<span dir="ltr">` or `<code dir="ltr">` so they do not reverse.
6. Leave code comments, in-app interface strings, `LICENSE` text, and legal, privacy, or medical disclaimers in English. Link to those English documents from the translation.

## What this repository translates

`README.md` is the only user-facing document. It restates the repository description ("Mobile app for tows") and the description already published by the app ("shoulder calls nearby shops, then holds an ETA and a price. Insurance-covered dollars are left alone."), and it points at the web tree (`src/`) and the iOS tree (`ios/`).

These stay in English:

- `AGENTS.md`, which is instructions for the coding agent.
- In-app interface strings and code comments.
- `ios/Towy/PrivacyInfo.xcprivacy`, Apple's privacy manifest. It is a property list, not a disclaimer. The repository has no legal, privacy, or medical disclaimer document. If one is added later, link it from the translations and leave its text in English.

There is no `CONTRIBUTING` guide and no other setup or usage guide to translate.
