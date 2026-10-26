# Cacl Worlds Mayhem extension

Сборка:

```sh
npm run build:extension
```

В Chrome/Edge открой `chrome://extensions`, включи Developer mode и выбери
`Load unpacked` → `dist-extension`.

Расширение работает только на `https://loldle.net/worldsMayhem` и показывает
панель поверх страницы. Оно читает видимый текст страницы, локальный рейтинг и
пересчитывает рекомендации после изменений DOM или клика по карточке.

Текущий адаптер намеренно эвристический: если LoLdle изменит разметку, нужно
обновить `optionGroups` и обработчик кликов в `content.js`. OCR из основного
приложения пока остается резервом для следующего шага.
