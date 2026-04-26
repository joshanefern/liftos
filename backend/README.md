# LiftOS Backend

## Stack

- Express
- Prisma
- PostgreSQL
- JWT auth

## Endpoints

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/sign-in`

## Local setup

1. Copy `.env.example` to `.env`
2. Set `DATABASE_URL`
3. Set a real `JWT_SECRET`
4. Install deps:

   ```bash
   npm install
   ```

5. Run Prisma migrations:

   ```bash
   npm run prisma:migrate
   ```

6. Start the server:

   ```bash
   npm run dev
   ```

Default backend URL: `http://localhost:4000`
