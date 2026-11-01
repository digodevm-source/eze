# FORMLESS® — Beyond the Form

A one-page site for a creative studio with glass bioluminescent butterflies rendered in WebGL.
The butterflies flutter, trail glowing tendrils, and the main one flies with you from section to section as you scroll.
The page ends with a centred **dgd studio** signature.

## Запуск / Run

Просто откройте `index.html` в браузере — сборка и сервер не нужны (работает и с `file://`).
Для публикации подойдёт GitHub Pages / Netlify / Vercel: загрузите папку как есть.

Just open `index.html`. No build step, no dependencies to install.

## Структура / Structure

```
index.html            разметка и тексты (EN)
css/style.css         стили, glass-карточки, анимации появления
js/scene.js           WebGL2-сцена: бабочки, щупальца, bloom, пыль (без библиотек)
js/main.js            плавный скролл, появление блоков, курсор, HUD, прогресс
js/vendor/lenis.min.js  Lenis 1.1.13 (MIT) — мягкий плавный скролл
```

## Как настроить / Customising

- **Тексты, email, соцсети** — в `index.html` (email-заглушка `hello@dgd.studio`, ссылки соцсетей `#`).
- **Куда летит бабочка** — атрибут `data-bf="x,y,scale,yaw,pitch,roll"` у каждой секции
  (`x`,`y` — доля экрана 0…1). `data-bf-m` — то же для мобильных.
- **Маленькие бабочки-компаньоны** — элементы `<i class="bf-companion" data-companion="scale,depth,yaw,roll">`,
  позиция задаётся `left/top` в процентах внутри секции.
- **Форма крыльев** — объект `WINGS` в `js/scene.js` (длина, ширина, изгиб, волна края и т.д.).

## Notes

- Requires WebGL2 (all modern browsers). Without it the page falls back to a soft gradient background.
- Resolution adapts automatically on slower GPUs to keep motion smooth; add `?quality=high` to the URL to disable that.
- `prefers-reduced-motion` is respected: smooth scrolling is off and the flutter is calmer.
