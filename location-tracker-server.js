import "dotenv/config";
import http from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import { kafkaClient } from "./src/modules/location-tracker/kafka-client.js";
import { startSocketConsumer } from "./src/modules/location-tracker/socket-consumer.js";
import { startDatabaseProcessor } from "./src/modules/location-tracker/database-processor.js";
import { verifyToken } from "./src/common/utils/user-token.js";
import oidcRoutes from "./src/modules/oidc/routes.js";

const PORT = process.env.TRACKER_PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Auth middleware

async function requireAuth(req, res, next) {
  const token = req.cookies?.access_token; 
  
  if (!token) {
     console.log("No access_token cookie found. Redirecting to login.");
     return res.redirect("/oidc/login");
  }
  
  try {
    req.user = await verifyToken(token); 
    next();
  } catch (err) {
    console.error("Token verification failed in middleware:", err);
    res.clearCookie("access_token");
    
    // TEMPORARY DEBUG: Stop the redirect loop and show the error in the browser
    return res.status(401).send(`Authentication Failed: ${err.message}. Check server console for details.`);
    
    // Once fixed, revert back to:
    // return res.redirect("/oidc/login");
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

// Static files — protected

app.use("/oidc", oidcRoutes);

app.use(requireAuth, express.static(path.resolve("public")));
app.get("/health", (req, res) => res.json({ healthy: true }));

// Socket.IO auth middleware

io.use(async (socket, next) => {
  const cookie = socket.handshake.headers.cookie || "";
  const cookiesObj = Object.fromEntries(
    cookie
      .split(";")
      .filter(Boolean)
      .map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k, decodeURIComponent(v.join("="))];
      }),
  );

  // Look for access_token instead of auth_token
  const token = cookiesObj?.access_token;

  if (!token) return next(new Error("Unauthorized"));
  
  try {
    // verifyToken is now async
    socket.user = await verifyToken(token);
    next();
  } catch (err) {
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
    const { sub: userId, name: firstName } = socket.user;
    
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
