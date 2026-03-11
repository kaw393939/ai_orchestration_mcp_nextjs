import { describe, it, expect } from "vitest";
import { UserDataMapper } from "./UserDataMapper";
import Database from "better-sqlite3";
import { ensureSchema } from "../lib/db/schema";

describe("UserDataMapper", () => {
  it("should retrieve a user by active role", () => {
    const db = new Database(":memory:");
    ensureSchema(db);

    const mapper = new UserDataMapper(db);
    const user = mapper.findByActiveRole("ADMIN");

    expect(user).toBeDefined();
    expect(user?.email).toBe("admin@example.com");
    expect(user?.roles).toContain("ADMIN");

    db.close();
  });

  it("should return null for unknown role", () => {
    const db = new Database(":memory:");
    ensureSchema(db);

    const mapper = new UserDataMapper(db);
    const user = mapper.findByActiveRole("UNKNOWN" as "ADMIN");

    expect(user).toBeNull();

    db.close();
  });

  it("create → findByEmail → findById chain", async () => {
    const db = new Database(":memory:");
    ensureSchema(db);
    const mapper = new UserDataMapper(db);

    const user = await mapper.create({
      email: "test@example.com",
      name: "Test User",
      passwordHash: "$2a$12$testhash",
    });

    expect(user.email).toBe("test@example.com");
    expect(user.name).toBe("Test User");
    expect(user.roles).toEqual(["AUTHENTICATED"]);

    const byEmail = await mapper.findByEmail("test@example.com");
    expect(byEmail).not.toBeNull();
    expect(byEmail!.id).toBe(user.id);
    expect(byEmail!.passwordHash).toBe("$2a$12$testhash");

    const byId = await mapper.findById(user.id);
    expect(byId).not.toBeNull();
    expect(byId!.email).toBe("test@example.com");
    // Public User type should NOT include passwordHash
    expect(byId).not.toHaveProperty("passwordHash");

    db.close();
  });

  it("duplicate email throws UNIQUE constraint error", async () => {
    const db = new Database(":memory:");
    ensureSchema(db);
    const mapper = new UserDataMapper(db);

    await mapper.create({
      email: "dup@example.com",
      name: "First",
      passwordHash: "$2a$12$hash1",
    });

    await expect(
      mapper.create({
        email: "dup@example.com",
        name: "Second",
        passwordHash: "$2a$12$hash2",
      }),
    ).rejects.toThrow(/UNIQUE/);

    db.close();
  });

  it("findByEmail returns null for nonexistent email", async () => {
    const db = new Database(":memory:");
    ensureSchema(db);
    const mapper = new UserDataMapper(db);

    const result = await mapper.findByEmail("nobody@example.com");
    expect(result).toBeNull();

    db.close();
  });

  it("findById returns null for nonexistent id", async () => {
    const db = new Database(":memory:");
    ensureSchema(db);
    const mapper = new UserDataMapper(db);

    const result = await mapper.findById("usr_nonexistent");
    expect(result).toBeNull();

    db.close();
  });
});
