import "dotenv/config";
import http from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import { kafkaClient } from "./src/modules/location-tracker/kafka-client.js";
import { startSocketConsumer } from "./src/modules/location-tracker/socket-consumer.js";
import { startDatabaseProcessor } from "./src/modules/location-tracker/database-processor.js";
import { verifyToken } from "./src/common/utils/user-token.js";

const PORT = process.env.TRACKER_PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Auth middleware

function requireAuth(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token)
    return res.redirect(
      `http://localhost:${process.env.OIDC_PORT || 8000}/o/authenticate`,
    );
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.clearCookie("auth_token");
    return res.redirect(
      `http://localhost:${process.env.OIDC_PORT || 8000}/o/authenticate`,
    );
  }
}

// Cookie parser (inline)

app.use((req, res, next) => {
  req.cookies = Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k, decodeURIComponent(v.join("="))];
      }),
  );
  next();
});

// Set-cookie endpoint (called after OIDC redirect with token)

app.get("/set-cookie", (req, res) => {
  const { token } = req.query;
  if (!token)
    return res.redirect(
      `http://localhost:${process.env.OIDC_PORT || 8000}/o/authenticate`,
    );
  try {
    verifyToken(token);
    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 3600 * 1000,
    });
    return res.redirect("/");
  } catch {
    return res.redirect(
      `http://localhost:${process.env.OIDC_PORT || 8000}/o/authenticate`,
    );
  }
});

// Static files — protected

app.use(requireAuth, express.static(path.resolve("public")));
app.get("/health", (req, res) => res.json({ healthy: true }));

// Socket.IO auth middleware

io.use((socket, next) => {
  const cookie = socket.handshake.headers.cookie || "";
  const token = Object.fromEntries(
    cookie
      .split(";")
      .filter(Boolean)
      .map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k, decodeURIComponent(v.join("="))];
      }),
  )?.auth_token;

  if (!token) return next(new Error("Unauthorized"));
  try {
    socket.user = verifyToken(token);
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

// Kafka setup

async function main() {
  const producer = kafkaClient.producer();
  await producer.connect();

  await startSocketConsumer(io, producer, PORT);
  await startDatabaseProcessor();

  // Socket events

  io.on("connection", (socket) => {
    const { sub: userId, given_name: firstName } = socket.user;
    console.log(
      `User connected: ${firstName} (${userId}) — socket ${socket.id}`,
    );

    socket.on("client:location:update", async ({ latitude, longitude }) => {
      if (typeof latitude !== "number" || typeof longitude !== "number") return;

      //frontend theke location elo then producer side theke Kafka r system e pathiye deoa holo
      await producer.send({
        topic: "location-updates",
        messages: [
          {
            key: userId, // partition by userId for consistent ordering per user
            value: JSON.stringify({ userId, firstName, latitude, longitude }),
          },
        ],
      });
    });

    socket.on("client:whoami", () => {
      socket.emit("server:whoami", { userId });
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${firstName} (${userId})`);
      io.emit("server:user:disconnected", { userId });
    });
  });

  server.listen(PORT, () => {
    console.log(`Location tracker running on http://localhost:${PORT}`);
  });
}

main();
