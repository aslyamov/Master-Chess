# Master Chess Game — Roadmap

> **Концепция:** Тренировка "угадай ход" — пользователь играет партию за гроссмейстера начиная с хода N и сравнивает свои ходы с ходами игрока и движка.  
> **База:** копия стека Woodpecker_method (TypeScript + Vite + chess.js + chessground + Tailwind/DaisyUI)

---

## Milestone 1 — Scaffold & Core Setup

- [ ] Инициализация проекта (Vite + TypeScript, те же версии зависимостей что в Woodpecker_method)
- [ ] Подключение chessground, chess.js, Stockfish (WASM)
- [ ] Базовая HTML-структура: экраны `upload`, `train`, `finish`, `stats`
- [ ] Стиль доски `brown` (взять из Chess-Vision-Trainer)
- [ ] Настройка PWA / service worker

---

## Milestone 2 — Загрузка партий

### 2a. PGN-файлы
- [ ] Drag-and-drop / file picker для PGN (несколько партий в одном файле)
- [ ] Парсинг PGN: заголовки (`White`, `Black`, `Date`, `Event`), ходы, вариации игнорируются
- [ ] Список загруженных PGN с кол-вом партий, кнопка удаления
- [ ] Хранение в `localStorage` (аналог Woodpecker_method)

### 2b. Lichess URL
- [ ] Поле ввода ссылки на партию (формат `lichess.org/XXXXXXXX`)
- [ ] Загрузка через Lichess API (`https://lichess.org/game/export/{id}?moves=true`) → PGN
- [ ] Обработка ошибок (партия не найдена, нет сети)

---

## Milestone 3 — Настройки перед тренировкой

- [ ] Модал настроек при выборе партии / PGN-базы:
  - Выбор конкретной партии из базы (или случайная)
  - **Начальный ход** (слайдер, по умолчанию 15) — с какого хода начинать угадывать
  - Выбор стороны: за белых / за чёрных / по цвету выбранного шахматиста
- [ ] Сохранение настроек в `localStorage`

---

## Milestone 4 — Игровой экран (Train)

- [ ] Отображение первых N ходов в боковой панели (список в нотации SAN)
- [ ] Установка позиции на ход N, ориентация доски по цвету игрока
- [ ] Ввод хода пользователем через chessground (drag & drop, click-click)
  - Блокировка нелегальных ходов через chess.js
  - Поддержка превращения пешки (overlay)
- [ ] После хода пользователя:
  1. Показать ход из партии (анимация)
  2. Визуальная обратная связь: `✓ Совпало!` / `≈ Лучший ход движка` / `✗ Другой ход`
  3. Стрелки на доске: зелёная = ход партии, синяя = топ-ход Stockfish (если отличается)
- [ ] Прогресс-бар и счётчик `ход X / всего`
- [ ] Кнопка Flip, кнопка Hint (показать ход партии, опционально)

---

## Milestone 5 — Интеграция Stockfish

> **Пакет:** `stockfish@18.0.7` (nmrugg) — Stockfish 18, встроенный NNUE, UCI через Web Worker.  
> `@lichess-org/stockfish-web` не используем: требует ручной загрузки NNUE-файлов (~25–50 MB) — излишняя сложность для данного проекта.

- [ ] Установка: `npm install stockfish@18.0.7`
- [ ] `engine.ts` — обёртка над Web Worker с UCI-протоколом:
  ```ts
  const worker = new Worker(
    new URL('stockfish/stockfish.js', import.meta.url),
    { type: 'module' }
  );
  worker.postMessage('uci');
  worker.postMessage('setoption name MultiPV value 3');
  worker.postMessage(`position fen ${fen}`);
  worker.postMessage(`go depth ${depth}`);
  // парсим ответы: "info depth ... multipv 1 score cp 34 pv e2e4 ..."
  //               "bestmove e2e4 ponder d7d5"
  ```
- [ ] Анализ запускается после хода пользователя, не блокирует UI
- [ ] Получение топ-1..3 ходов движка (настраивается через MultiPV)
- [ ] Сравнение: ход пользователя = ход партии? попадает в топ-N движка?
- [ ] Расчёт centipawn loss (cp до хода − cp после) для статистики

### Настройки движка (в модале настроек)

| Параметр | Варианты | По умолчанию |
|---|---|---|
| Глубина анализа | 10 / 14 / 18 / 22 | 16 |
| MultiPV (топ ходов) | 1 / 3 | 3 |
| Показывать оценку позиции | вкл / выкл | выкл (спойлер до хода) |
| Показывать стрелку движка | вкл / выкл | вкл (после хода пользователя) |

---

## Milestone 6 — Статистика и сохранение

### Модель данных
```ts
interface GameResult {
  gameId: string;          // hash PGN или lichess ID
  gameName: string;        // "Carlsen vs Nepomniachtchi, 2021"
  playerColor: 'w' | 'b';
  startMove: number;
  date: string;
  moves: MoveResult[];
}

interface MoveResult {
  moveNumber: number;
  userMove: string;        // UCI
  gameMove: string;        // UCI
  engineTopMove: string;   // UCI
  matchesGame: boolean;
  matchesEngine: boolean;
  cpLoss?: number;
}
```

### Сохранение
- [ ] `localStorage` — по `gameId` (по аналогии с CycleRecord в Woodpecker_method)
- [ ] Опционально: группировка по шахматисту (из заголовка PGN `White`/`Black`)

---

## Milestone 7 — Экран статистики

- [ ] **Точность по партии:** % ходов совпавших с партией
- [ ] **Точность по движку:** % ходов совпавших с топ-ходом Stockfish
- [ ] **График по ходам:** линейный — где пользователь совпал/расошёлся
- [ ] **Heatmap ходов:** какие ходовые диапазоны вызывают больше ошибок
- [ ] **История сессий:** таблица прошлых партий с accuracy
- [ ] Сравнение с предыдущим прохождением той же партии

---

## Milestone 8 — Экран завершения (Finish)

- [ ] Итоги сессии: accuracy vs партия, accuracy vs движок
- [ ] Сравнение с предыдущей попыткой (стрелки ↑↓)
- [ ] Кнопки: "Ещё раз", "Другая партия", "Посмотреть ошибки"
- [ ] Review mode: просмотр ходов где пользователь ошибся (автопроигрыш правильного хода)

---

## Milestone 9 — UX & Polish

- [ ] Адаптивная вёрстка (mobile)
- [ ] Горячие клавиши (аналог keys.ts в Woodpecker_method)
- [ ] Анимации переходов между экранами
- [ ] Тёмная тема (DaisyUI)
- [ ] Оффлайн-режим (PWA, Stockfish WASM кешируется)

---

## Milestone 10 — Расширенные функции (бэклог)

- [ ] Поддержка нескольких партий подряд (тренировка по базе)
- [ ] Фильтрация партий в PGN по игроку, эло, дебюту
- [ ] Экспорт статистики в CSV
- [ ] Таблица лидеров по шахматистам (сколько % ходов Карлсена угадано)
- [ ] Открытие конкретной партии по ссылке (`?game=lichess.org/abc123`)

---

## Стек

### Dependencies

| Пакет | Версия | Назначение |
|---|---|---|
| `chess.js` | `1.4.0` | Шахматная логика, валидация ходов, FEN |
| `@lichess-org/chessground` | `10.1.1` | Интерактивная доска |
| `stockfish` | `18.0.7` | Движок SF 18 (NNUE WASM, UCI Web Worker) |
| `chart.js` | `4.5.1` | Графики статистики |
| `@mliebelt/pgn-parser` | `1.4.19` | Парсинг PGN (заголовки, ходы, вариации) |

### DevDependencies

| Пакет | Версия | Назначение |
|---|---|---|
| `vite` | `8.0.9` | Сборка и dev-сервер |
| `typescript` | `6.0.3` | Типизация |
| `tailwindcss` | `4.2.4` | Утилитарный CSS |
| `@tailwindcss/vite` | `4.2.4` | Интеграция Tailwind с Vite |
| `daisyui` | `5.5.19` | UI-компоненты (модалы, кнопки, badges) |
| `@types/node` | `25.6.0` | Типы Node.js |

> Версии проверены на актуальность 2026-04-21. Все на последних стабильных релизах.

---

## Порядок реализации

```
M1 Scaffold → M2a PGN → M4 Train (без движка) → M6 Stats (базово)
           → M2b Lichess → M5 Stockfish → M3 Settings refinement
           → M7 Charts → M8 Finish → M9 Polish → M10 Backlog
```
