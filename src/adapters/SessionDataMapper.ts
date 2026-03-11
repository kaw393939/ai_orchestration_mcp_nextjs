import type Database from "better-sqlite3";
import type { Session } from "@/core/entities/session";
import type { SessionRepository } from "@/core/use-cases/SessionRepository";

export class SessionDataMapper implements SessionRepository {
  constructor(private db: Database.Database) {}

  async create(session: Session): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(session.id, session.userId, session.createdAt, session.expiresAt);
  }

  async findByToken(id: string): Promise<Session | null> {
    const row = this.db
      .prepare(`SELECT id, user_id, created_at, expires_at FROM sessions WHERE id = ?`)
      .get(id) as
      | { id: string; user_id: string; created_at: string; expires_at: string }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  async delete(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  }

  async deleteExpired(): Promise<void> {
    this.db
      .prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`)
      .run();
  }
}
