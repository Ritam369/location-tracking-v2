import "dotenv/config";
import express from "express";
import path from "node:path";
import oidcRouter from "./src/modules/oidc/routes.js";

const app = express();
const PORT = process.env.OIDC_PORT || 8000;

app.use(express.json());

// Only serve auth pages — index.html belongs to the tracker server
app.get("/signup.html", (req, res) => res.sendFile(path.resolve("public", "signup.html")));

app.get("/", (req, res) => res.json({ message: "Hello from Auth Server" }));
app.get("/health", (req, res) => res.json({ healthy: true }));

app.use(oidcRouter);

app.listen(PORT, () => {
  console.log(`OIDC server running on http://localhost:${PORT}`);
});
