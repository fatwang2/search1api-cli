import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  authorizationServerMetadataUrl,
  createPkcePair,
} from "../dist/auth.js";

test("builds RFC 8414 metadata URLs for root and path issuers", () => {
  assert.equal(
    authorizationServerMetadataUrl("https://clerk.search1api.com"),
    "https://clerk.search1api.com/.well-known/oauth-authorization-server"
  );
  assert.equal(
    authorizationServerMetadataUrl("https://example.com/tenant"),
    "https://example.com/.well-known/oauth-authorization-server/tenant"
  );
});

test("creates an S256 PKCE verifier and matching challenge", () => {
  const { codeVerifier, codeChallenge } = createPkcePair();
  assert.match(codeVerifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(
    codeChallenge,
    createHash("sha256").update(codeVerifier).digest("base64url")
  );
});
