# Messenger

Современный мессенджер с чатами в реальном времени.

## Функции
- Регистрация и авторизация (JWT)
- Личные и групповые чаты
- Отправка текста, фото, файлов и голосовых сообщений
- Статусы онлайн
- Индикатор «печатает»
- Современный UI с анимациями (Framer Motion)
- Тёмная тема

## Запуск

### 1. Бэкенд
```bash
cd backend
npm install
npm start
```
Сервер запустится на http://localhost:3001

### 2. Фронтенд
```bash
cd frontend
npm install
npm run dev
```
Откроется на http://localhost:5173

## Стек
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Framer Motion + Socket.io-client
- **Backend**: Node.js + Express + Socket.io + better-sqlite3 + JWT + bcrypt

## Дальнейшее развитие
- Мобильная версия (React Native)
- Десктоп (Electron / Tauri)
- Push-уведомления
- Видеозвонки
- Групповые чаты с управлением участниками
- Поиск по сообщениям

База данных создаётся автоматически (`messenger.db`).
