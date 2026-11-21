import { db } from '../db/index.js';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: 'training_centre' | 'district_officer' | 'quality_team' | 'state_office';
  district_id: string | null;
  district_name?: string | null;
  centre_id: string | null;
  centre_name?: string | null;
  created_at: string;
}

export class UserRepository {
  /**
   * Fetch all switchable demo users with their associated district and centre names.
   */
  static async findAllUsers(): Promise<UserRecord[]> {
    const query = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.district_id, 
        d.name as district_name,
        u.centre_id,
        c.name as centre_name,
        u.created_at
      FROM users u
      LEFT JOIN districts d ON u.district_id = d.id
      LEFT JOIN centres c ON u.centre_id = c.id
      ORDER BY 
        CASE u.role
          WHEN 'training_centre' THEN 1
          WHEN 'district_officer' THEN 2
          WHEN 'quality_team' THEN 3
          WHEN 'state_office' THEN 4
          ELSE 5
        END,
        u.name ASC;
    `;
    const result = await db.query(query);
    return result.rows;
  }

  /**
   * Find a specific user by UUID.
   */
  static async findUserById(userId: string): Promise<UserRecord | null> {
    const query = `
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.district_id, 
        d.name as district_name, 
        u.centre_id, 
        c.name as centre_name
      FROM users u
      LEFT JOIN districts d ON u.district_id = d.id
      LEFT JOIN centres c ON u.centre_id = c.id
      WHERE u.id = $1
    `;
    const result = await db.query(query, [userId]);
    return result.rows[0] || null;
  }
}
