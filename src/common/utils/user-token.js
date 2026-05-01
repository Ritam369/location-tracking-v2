import JWT from "jsonwebtoken";
import { PUBLIC_KEY } from "./cert.js";

/**
 * Verifies a JWT and returns the decoded claims.
 * Throws if invalid or expired.
 *
 * Claims shape:
 * {
 *   iss, sub (userId), email, given_name (firstName),
 *   family_name (lastName), name, exp
 * }
 */
export function verifyToken(token) {
  return JWT.verify(token, PUBLIC_KEY, { algorithms: ["RS256"] });
}
