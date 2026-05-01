import crypto from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import JWT from "jsonwebtoken";
import jose from "node-jose";
import { db } from "../../common/db/index.js";
import { usersTable } from "../../common/db/schema.js";
import { PRIVATE_KEY, PUBLIC_KEY } from "../../common/utils/cert.js";

const TRACKER_PORT = process.env.TRACKER_PORT || 3000;
const TRACKER_ORIGIN = `http://localhost:${TRACKER_PORT}`;

export function getOpenIdConfig(req, res) {
  const ISSUER = `${req.protocol}://${req.get("host")}`;
  return res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/o/authenticate`,
    userinfo_endpoint: `${ISSUER}/o/userinfo`,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
  });
}

export async function getJwks(req, res) {
  const key = await jose.JWK.asKey(PUBLIC_KEY, "pem");
  return res.json({ keys: [key.toJSON()] });
}

export function getAuthenticatePage(req, res) {
  return res.sendFile(path.resolve("public", "authenticate.html"));
}

export async function signIn(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const hash = crypto
    .createHash("sha256")
    .update(password + user.salt)
    .digest("hex");

  if (hash !== user.password) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const ISSUER = `${req.protocol}://${req.get("host")}`;
  const now = Math.floor(Date.now() / 1000);

  const claims = {
    iss: ISSUER,
    sub: user.userId,
    email: user.email,
    given_name: user.firstName,
    family_name: user.lastName ?? undefined,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    exp: now + 3600,
  };

  const token = JWT.sign(claims, PRIVATE_KEY, { algorithm: "RS256" });

  res.cookie("auth_token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 3600 * 1000,
  });

  return res.json({ redirect: `${TRACKER_ORIGIN}/set-cookie?token=${token}` });
}

export async function signUp(req, res) {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || !email || !password) {
    return res.status(400).json({ message: "First name, email, and password are required." });
  }

  const [existing] = await db
    .select({ userId: usersTable.userId })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing) {
    return res.status(409).json({ message: "An account with this email already exists." });
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .createHash("sha256")
    .update(password + salt)
    .digest("hex");

  await db.insert(usersTable).values({
    firstName,
    lastName: lastName ?? null,
    email,
    password: hash,
    salt,
  });

  return res.status(201).json({ ok: true });
}

export async function getUserInfo(req, res) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid Authorization header." });
  }

  const token = authHeader.slice(7);
  let claims;

  try {
    claims = JWT.verify(token, PUBLIC_KEY, { algorithms: ["RS256"] });
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.userId, claims.sub))
    .limit(1);

  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  return res.json({
    sub: user.userId,
    email: user.email,
    given_name: user.firstName,
    family_name: user.lastName,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
  });
}
