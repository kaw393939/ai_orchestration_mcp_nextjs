import { describe, it, expect } from "vitest";
import { SessionDataMapper } from "./SessionDataMapper";
import Database from "better-sqlite3";
import { ensureSchema } from "../lib/db/schema";

function createDb() {
  const db = new Database(":memory:");
  ensureSchema(db);
  return db;
}

describe("SessionDataMapper", () => {
  it("create → findByToken → delete lifecycle", async () => {
    const db = createDb();
    const mapper = new SessionDataMapper(db);

    const session = {
      id: "tok_123",
      userId: "usr_admin",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    await mapper.create(session);

    const found = await mapper.findByToken("tok_123");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("tok_123");
    expect(found!.userId).toBe("usr_admin");

    await mapper.delete("tok_123");

    const deleted = await mapper.findByToken("tok_123");
    expect(deleted).toBeNull();

    db.close();
  });

  it("findByToken returns null for nonexistent token", async () => {
    const db = createDb();
    const mapper = new SessionDataMapper(db);

    const result = await mapper.findByToken("nonexistent");
    expect(result).toBeNull();

    db.close();
  });

  it("deleteExpired removes only expired sessions", async () => {
    const db = createDb();
    const mapper = new SessionDataMapper(db);

    const now = new Date();
    const expired = {
      id: "tok_expired",
      userId: "usr_admin",
      createdAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const valid = {
      id: "tok_valid",
      userId: "usr_admin",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    await mapper.create(expired);
    await mapper.create(valid);

    await mapper.deleteExpired();

    expect(await mapper.findByToken("tok_expired")).toBeNull();
    expect(await mapper.findByToken("tok_valid")).not.toBeNull();

    db.close();
  });
});
