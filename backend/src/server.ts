import "dotenv/config";

import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { ZodError, z } from "zod";

import { prisma } from "./lib/prisma.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:8080";
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  }),
);
app.use(express.json());

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().min(1).max(50).optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const toUserResponse = (user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
}) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  createdAt: user.createdAt,
});

const createToken = (userId: string, email: string) =>
  jwt.sign({ sub: userId, email }, jwtSecret, {
    expiresIn: "7d",
  });

app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);
    const normalizedEmail = payload.email.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: payload.firstName,
        lastName: payload.lastName,
      },
    });

    const token = createToken(user.id, user.email);

    return res.status(201).json({
      token,
      user: toUserResponse(user),
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/auth/sign-in", async (req, res, next) => {
  try {
    const payload = signInSchema.parse(req.body);
    const normalizedEmail = payload.email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const passwordMatches = await bcrypt.compare(payload.password, user.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = createToken(user.id, user.email);

    return res.json({
      token,
      user: toUserResponse(user),
    });
  } catch (error) {
    return next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Invalid request payload.",
      details: error.flatten(),
    });
  }

  console.error(error);
  return res.status(500).json({ error: "Internal server error." });
});

app.listen(port, () => {
  console.log(`LiftOS backend listening on http://localhost:${port}`);
});
