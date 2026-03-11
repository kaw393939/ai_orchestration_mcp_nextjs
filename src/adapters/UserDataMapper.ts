import type Database from "better-sqlite3";
import type { User, RoleName } from "../core/entities/user";
import type { UserRepository, UserRecord } from "../core/use-cases/UserRepository";

export class UserDataMapper implements UserRepository {
  constructor(private db: Database.Database) {}

  async create(input: {
    email: string;
    name: string;
    passwordHash: string;
  }): Promise<User> {
    const id = `usr_${crypto.randomUUID()}`;
    this.db
      .prepare(`INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)`)
      .run(id, input.email, input.name, input.passwordHash);

    // Assign AUTHENTICATED role
    this.db
      .prepare(`INSERT INTO user_roles (user_id, role_id) VALUES (?, 'role_authenticated')`)
      .run(id);

    return {
      id,
      email: input.email,
      name: input.name,
      roles: ["AUTHENTICATED"],
    };
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = this.db
      .prepare(`SELECT id, email, name, password_hash FROM users WHERE email = ?`)
      .get(email) as
      | { id: string; email: string; name: string; password_hash: string | null }
      | undefined;

    if (!row) return null;

    const roles = this.getRoles(row.id);

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      roles,
    };
  }

  async findById(id: string): Promise<User | null> {
    const row = this.db
      .prepare(`SELECT id, email, name FROM users WHERE id = ?`)
      .get(id) as
      | { id: string; email: string; name: string }
      | undefined;

    if (!row) return null;

    const roles = this.getRoles(row.id);

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      roles,
    };
  }

  /** Adapter-specific method for mock auth — NOT part of UserRepository port */
  public findByActiveRole(activeRoleName: RoleName): User | null {
    const mockUserRow = this.db
      .prepare(
        `
            SELECT u.id, u.email, u.name 
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE r.name = ?
        `,
      )
      .get(activeRoleName) as
      | { id: string; email: string; name: string }
      | undefined;

    if (!mockUserRow) return null;

    const roles = this.getRoles(mockUserRow.id);

    return {
      id: mockUserRow.id,
      email: mockUserRow.email,
      name: mockUserRow.name,
      roles,
    };
  }

  private getRoles(userId: string): RoleName[] {
    const rolesRows = this.db
      .prepare(
        `SELECT r.name
         FROM roles r
         JOIN user_roles ur ON r.id = ur.role_id
         WHERE ur.user_id = ?`,
      )
      .all(userId) as { name: RoleName }[];

    return rolesRows.map((r) => r.name);
  }
}
