import JWT from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const client = jwksClient({
  // Ensure this is the exact URL that returns the {"keys": [...]} array
  jwksUri: `${process.env.CHAI_AUR_AUTH_ISSUER}/o/certs`
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) {
      console.error("jwksClient Error fetching key:", err);
      return callback(err, null);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

export function verifyToken(token) {
  return new Promise((resolve, reject) => {
    // We pass algorithms, but we don't enforce 'issuer' yet to be safe
    JWT.verify(token, getKey, { algorithms: ["RS256"] }, (err, decoded) => {
      if (err) {
         console.error("JWT Verify Error:", err.message);
         return reject(err);
      }
      resolve(decoded);
    });
  });
}