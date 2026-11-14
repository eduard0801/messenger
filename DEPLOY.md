# Deploy to Render.com

1. Connect this repo on Render.
2. Build Command:
```
cd frontend && npm install && npm run build && cd ../backend && npm install
```
3. Start Command:
```
cd backend && NODE_ENV=production node server.js
```
4. Add env var JWT_SECRET=any-long-secret
