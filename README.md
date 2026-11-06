#  Worlds Mayhem Calculator & Overlay

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-⚡-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Chrome Extension](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Vitest](https://img.shields.io/badge/Tested%20with-Vitest-729B1B?logo=vitest&logoColor=white)](https://vitest.dev/)

Аналитический инструмент и real-time ассистент для драфт-режима **Worlds Mayhem** на платформе [LoLdle](https://loldle.net/worldsMayhem).

Проект состоит из двух связанных частей с общей бизнес-логикой:
1. **Веб-приложение (SPA):** Интерактивный калькулятор пиков, справочник по 2000+ игрокам, поиск комбинаций составов и модуль OCR-импорта драфтов со скриншотов.
2. **Браузерное расширение (MV3):** In-game оверлей поверх `loldle.net/worldsMayhem*`, в реальном времени анализирующий текущий драфт и рекомендующий математически оптимальный пик.

---

##  Ключевые возможности

### Веб-приложение (React + Vite + TypeScript)
- **Draft Calculator:** Расчет суммарного скора команды с учетом штрафов и бонусов за керри.
- **Player Database:** Полный каталог игроков турниров Worlds с фильтрацией по ролям, командам, сезонам и рейтингу.
- **Synergy & Combos:** Поиск оптимальных оставшихся пиков под текущий ростер.
- **OCR Screenshot Import:** Распознавание карточек драфта со скриншотов с помощью **Tesseract.js** в фоновом Web Worker (без подвисания UI).

### Расширение для браузера (Chromium Manifest V3)
- **Real-time HUD:** Ненавязчивый оверлей прямо на странице матча.
- **Автоматическая синхронизация:** Отслеживание стадий драфта через `MutationObserver` (ожидание -> выбор команды -> выбор игрока -> турнирная сетка).
- **Отказоустойчивые селекторы:** Цепочки fallback-селекторов и нечеткий парсинг текста гарантируют работу расширения даже при изменении CSS-классов на сайте.

---

##  Архитектура проекта

Бизнес-логика вынесена в общую директорию `src/shared/`, что исключает дублирование формул и эвристик между веб-приложением и расширением.

```
                     ┌─────────────────────────────┐
                     │     src/shared (Core)       │
                     │  • Scoring engine           │
                     │  • Fuzzy matching & Aliases │
                     │  • Teams & Year inference   │
                     └──────────────┬──────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│     Web App (React + TS)      │               │   Browser Extension (MV3)     │
│ • UI Tabs (Calc, Rating, OCR) │               │ • DOM Scraping & MutationObs  │
│ • Web Worker OCR Pipeline     │               │ • In-Game Overlay HUD         │
│ • LocalStorage Leaderboard    │               │ • Runtime State Machine       │
└───────────────────────────────┘               └───────────────────────────────┘
```

---

##  Алгоритмы и расчеты

### 1. Формула скоринга (`src/lib/scoring.ts` / `src/shared/scoring.ts`)
Суммарный рейтинг команды складывается из взвешенных базовых очков по ролям плюс модификаторы:

$$\text{Score} = 0.17 \cdot \text{TOP} + 0.20 \cdot \text{JUNGLE} + 0.24 \cdot \text{MID} + 0.23 \cdot \text{ADC} + 0.16 \cdot \text{SUPPORT} + B_{\text{carry}} - P_{\text{weak}}$$

- **Carry Bonus ($B_{\text{carry}}$):** Бонус за игроков с высоким индивидуальным рейтингом относительно среднего уровня команды (топ-3 позиции, кап `+2.5`).
- **Weak Penalty ($P_{\text{weak}}$):** Штраф за проседающие позиции (боттом-2 позиции ниже среднего, кап `-2.0`).

### 2. Fuzzy Matching и нормализация (`src/shared/fuzzy.ts`)
- Нормализация строк: приведение к нижнему регистру, очистка спецсимволов.
- Определение совпадений по расстоянию Левенштейна и Partial Ratio.
- База синонимов и алиасов команд: `DK` $\leftrightarrow$ `DWG`, `T1` $\leftrightarrow$ `SKT`, `RNG`, `G2`, `FNC`, `C9` и др.
- **OCR-эвристики (`pickYear`):** Исправление частых ошибок оптического распознавания цифр года (`O` $\rightarrow$ `0`, `I` $\rightarrow$ `1`, `Z` $\rightarrow$ `2`, `S` $\rightarrow$ `5`, `B` $\rightarrow$ `8`, `G` $\rightarrow$ `6`).

### 3. Фоновый OCR (`src/lib/ocr.worker.ts`)
- Движок Tesseract.js изолирован в Web Worker.
- Основной поток интерфейса остается свободным (60 FPS) во время загрузки языковых пакетов и обработки изображений.
- После холодного старта (~2-5 сек) последующие распознавания выполняются существенно быстрее за счет переиспользования инстанса.

---

##  Структура репозитория

```
├── src/
│   ├── features/               # Модули веб-интерфейса
│   │   ├── calculator/         # Драфт, ростер, выбор лучшего пика
│   │   ├── rating/             # Таблица рейтингов игроков
│   │   ├── combos/             # Поиск лучших синергий
│   │   └── screenshot/         # Загрузка и кроп скриншотов
│   ├── shared/                 # Общий код для SPA и Extension (типы, скоринг, fuzzy)
│   ├── lib/                    # Утилиты веба (Web Worker клиент, localStorage)
│   └── App.tsx                 # Корневой компонент (вкладки приложения)
├── extension/
│   ├── src/                    # Модульный исходный код расширения
│   │   ├── state.js            # State machine драфта
│   │   ├── dom.js              # DOM-селекторы и скрейпинг страниц
│   │   ├── render.js           # Отрисовка UI элементов оверлея
│   │   └── events.js           # Слушатели кликов и мутаций
│   └── manifest.json           # Манифест Chrome Extension (MV3)
├── public/data/
│   └── worlds_mayhem_ratings.json  # База рейтингов игроков (~280 KB, 2000+ записей)
├── scripts/
│   └── build-extension.mjs     # Скрипт сборки расширения с бандлингом shared-кода
├── dist-extension/             # Папка готового расширения для загрузки в браузер
└── docs/adr/                   # Документация архитектурных решений
```

---

##  Быстрый старт

### Требования
- **Node.js** `>= 18.0.0`
- **npm** `>= 9.0.0`

### Установка и локальный запуск

```bash
# 1. Клонирование репозитория
git clone https://github.com/your-username/worlds-mayhem-calc.git
cd worlds-mayhem-calc

# 2. Установка зависимостей
npm install

# 3. Запуск dev-сервера веб-приложения
npm run dev
```

Локальный адрес приложения: `http://127.0.0.1:5173`.

---

##  Сборка и установка расширения

### Команды сборки

```bash
npm run build              # Сборка веб-приложения -> dist/
npm run build:extension    # Сборка расширения -> dist-extension/
```

### Загрузка расширения в браузер (Chrome / Edge / Brave / Yandex)
1. Выполните сборку: `npm run build:extension`.
2. Перейдите по адресу `chrome://extensions` (или `edge://extensions`).
3. Включите переключатель **Developer mode** («Режим разработчика») в правом верхнем углу.
4. Нажмите кнопку **Load unpacked** («Загрузить распакованное расширение»).
5. Выберите сгенерированную директорию `dist-extension/`.
6. Откройте [LoLdle Worlds Mayhem](https://loldle.net/worldsMayhem) — панель подсказок появится автоматически.

---

##  Тестирование и проверка качества

```bash
npm run lint         # Проверка кодовой базы через oxlint
npm run check        # Валидация целостности данных в teams.ts
npx vitest           # Запуск unit-тестов (scoring, fuzzy, teams, ratings)
npx vitest --coverage# Запуск тестов с отчетом о покрытии кода
```

---

##  Формат базы данных

Рейтинги хранятся в `public/data/worlds_mayhem_ratings.json`:

```json
{
  "version": "1.0.0",
  "updatedAt": "2026-11-01",
  "player_competition_scores": [
    {
      "player": "Faker",
      "position": "MID",
      "year": 2013,
      "team": "SK Telecom T1",
      "placement": 1,
      "games": 18,
      "raw_stat_values": { "kda": 4.8 },
      "adjusted_competition_score": 98.4,
      "confidence_multiplier": 1.0
    }
  ]
}
```

Для обновления данных достаточно положить актуальный JSON-файл в `public/data/` и выполнить повторную сборку (`npm run build && npm run build:extension`).

---

##  Лицензия

Проект распространяется под лицензией **MIT**.
