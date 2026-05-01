import { Router } from "express";
import {
  getOpenIdConfig,
  getJwks,
  getAuthenticatePage,
  signIn,
  signUp,
  getUserInfo,
} from "./controllers.js";

const router = Router();

router.get("/.well-known/openid-configuration", getOpenIdConfig);
router.get("/.well-known/jwks.json", getJwks);

router.get("/o/authenticate", getAuthenticatePage);
router.post("/o/authenticate/sign-in", signIn);
router.post("/o/authenticate/sign-up", signUp);

router.get("/o/userinfo", getUserInfo);

export default router;
