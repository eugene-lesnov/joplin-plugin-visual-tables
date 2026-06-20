# AGENTS.md

Руководство для контрибьютеров плагина **Visual Tables** для [Joplin](https://joplinapp.org/) — рендеринг и визуальное редактирование Markdown-таблиц прямо в редакторе CodeMirror 6. Desktop only, требует Joplin **3.5+**.

## Структура проекта

- `src/index.ts` — точка входа плагина: регистрация content script, команды `visualTables.insertTable` и кнопки тулбара.
- `src/editor/visualTables.ts` — основной CodeMirror 6 content script: парсинг таблиц из синтаксического дерева Lezer, рендеринг через `StateField` + `DecorationSet`, hover-контролы и контекстное меню.
- `src/localization.ts` — строки локализации (en по умолчанию, ru); типизированы через `AppLocalization`.
- `src/manifest.json` — манифест плагина (id, версия, `app_min_version`).
- `plugin.config.json` — список `extraScripts` (content scripts, собираемые отдельно).
- `api/` — типы Joplin Plugin API (`*.d.ts`), не редактируются вручную.
- `dist/`, `publish/` — артефакты сборки, не коммитятся как исходники.
- `images/` — скриншоты для README.

## Команды сборки и разработки

- `npm install` — установка зависимостей.
- `npm run dist` — полная сборка: main bundle + extra scripts + `.jpl`/`.json` архив в `publish/`.
- `npm run updateVersion` — синхронизация версии в `manifest.json` и `package.json`.
- `npm run update` — обновление шаблона плагина через `yo joplin`.

Сборка — Webpack + `ts-loader`; конфигурация выбирается через `--env joplin-plugin-config=...`. Запускай сборку через `npm run dist`, а не вызовом webpack напрямую.

> Тесты в проекте отсутствуют; CI (`.github/workflows/release-jpl.yml`) собирает и публикует релиз.

## Стиль кода и именование

- **TypeScript**, `module: commonjs`, `target: es2015` (см. `tsconfig.json`).
- Отступы — **табы** (как в существующих файлах).
- Импорт API: `import joplin from 'api'`; типы — из `api/types`.
- CodeMirror-модули в content script подключаются через `require(...)` (требование среды Joplin), не через `import`.
- Имена: `UPPER_SNAKE_CASE` для констант (`CONTENT_SCRIPT_ID`, `TABLE_TEMPLATE`), `camelCase` для функций/переменных, `PascalCase` для интерфейсов (`ParsedTable`, `MenuItem`).
- Все пользовательские строки добавляй в `src/localization.ts` (и en, и ru), не хардкодь в коде.
- **Без комментариев и JSDoc** — код самодокументируемый.

## VCS: коммиты и pull requests

- История коротка; сообщения коммитов — краткие в нижнем регистре (`init`) или номер версии (`0.0.1`). Пиши короткие императивные сообщения по сути изменения.
- PR должен содержать: понятное описание, ссылку на связанный issue, при изменениях UI — скриншот/GIF.
- Перед PR убедись, что `npm run dist` проходит без ошибок TypeScript.
