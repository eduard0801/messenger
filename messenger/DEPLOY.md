# Деплой на Render.com (бесплатно)

## Шаги

1. Зарегистрируйся на [render.com](https://render.com) (через GitHub).
2. Залей этот проект на GitHub (создай репозиторий и загрузи файлы).
3. На Render нажми **New → Web Service**.
4. Подключи свой GitHub-репозиторий.
5. Настройки:
   - **Environment**: Node
   - **Build Command**: 
     ```
     cd frontend && npm install && npm run build && cd ../backend && npm install
     ```
   - **Start Command**: 
     ```
     cd backend && NODE_ENV=production node server.js
     ```
   - **Instance Type**: Free
6. Добавь переменную окружения (Environment Variables):
   - `JWT_SECRET` = любой длинный случайный текст
7. Нажми **Create Web Service**.

Через несколько минут получишь постоянную ссылку вида `https://твой-мессенджер.onrender.com`.

Эту ссылку можно отправлять кому угодно — все смогут регистрироваться и общаться.

## Важно
- На бесплатном плане сервер засыпает после 15 минут без активности и просыпается при заходе (первый заход может быть медленным).
- Файлы и база хранятся на диске сервиса (при перезапуске могут сброситься на бесплатном плане).
