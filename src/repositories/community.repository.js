const USER_COLUMNS = 'id, name, email, avatar_url, created_at, updated_at';
const POST_SELECT = `
  SELECT p.*,
    json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url) AS author,
    (SELECT COUNT(*)::integer FROM likes l WHERE l.post_id = p.id) AS likes_count,
    (SELECT COUNT(*)::integer FROM comments c WHERE c.post_id = p.id) AS comments_count,
    EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked_by_me
  FROM posts p JOIN users u ON u.id = p.user_id`;

export function createRepository(db) {
  return {
    async transaction(work) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async createUser({ name, email, passwordHash }) {
      const { rows } = await db.query(
        `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
        [name, email, passwordHash],
      );
      return rows[0];
    },

    async userByEmail(email) {
      const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      return rows[0];
    },

    async userById(userId, client = db, lock = false) {
      const { rows } = await client.query(
        `SELECT ${USER_COLUMNS} FROM users WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
        [userId],
      );
      return rows[0];
    },

    async updateUser(userId, values, client = db) {
      const allowed = ['name', 'email', 'avatar_url'];
      const fields = Object.keys(values).filter((field) => allowed.includes(field));
      const parameters = fields.map((field) => values[field]);
      parameters.push(userId);
      const { rows } = await client.query(
        `UPDATE users SET ${fields.map((field, i) => `${field} = $${i + 1}`).join(', ')},
         updated_at = CURRENT_TIMESTAMP WHERE id = $${parameters.length} RETURNING ${USER_COLUMNS}`,
        parameters,
      );
      return rows[0];
    },

    async postRow(postId, client = db, lock = false) {
      const { rows } = await client.query(
        `SELECT * FROM posts WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [postId],
      );
      return rows[0];
    },

    async postById(postId, userId, client = db) {
      const { rows } = await client.query(`${POST_SELECT} WHERE p.id = $2`, [userId, postId]);
      return rows[0];
    },

    async listPosts(userId, { limit, offset }) {
      const [{ rows }, count] = await Promise.all([
        db.query(`${POST_SELECT} ORDER BY p.created_at DESC, p.id DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]),
        db.query('SELECT COUNT(*)::integer AS total FROM posts'),
      ]);
      return { rows, total: count.rows[0].total };
    },

    async createPost(userId, content, imageUrl, client = db) {
      const { rows } = await client.query(
        'INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING id',
        [userId, content, imageUrl],
      );
      return rows[0].id;
    },

    async updatePost(postId, values, client) {
      const fields = Object.keys(values).filter((field) => ['content', 'image_url'].includes(field));
      const parameters = fields.map((field) => values[field]);
      parameters.push(postId);
      await client.query(
        `UPDATE posts SET ${fields.map((field, i) => `${field} = $${i + 1}`).join(', ')},
         updated_at = CURRENT_TIMESTAMP WHERE id = $${parameters.length}`, parameters,
      );
    },

    async deletePost(postId, client) {
      await client.query('DELETE FROM posts WHERE id = $1', [postId]);
    },

    async likePost(userId, postId, client = db) {
      const { rows } = await client.query(
        `INSERT INTO likes (user_id, post_id) VALUES ($1, $2)
         ON CONFLICT (user_id, post_id) DO NOTHING RETURNING *`, [userId, postId],
      );
      if (rows.length) return { like: rows[0], created: true };
      const existing = await client.query('SELECT * FROM likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
      return { like: existing.rows[0], created: false };
    },

    async unlikePost(userId, postId, client = db) {
      await client.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
    },

    async createComment(userId, postId, content, client = db) {
      const { rows } = await client.query(
        'INSERT INTO comments (user_id, post_id, content) VALUES ($1, $2, $3) RETURNING id',
        [userId, postId, content],
      );
      return this.commentById(rows[0].id, client);
    },

    async commentById(commentId, client = db, lock = false) {
      const { rows } = await client.query(
        `SELECT c.*, json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url) AS author
         FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1${lock ? ' FOR UPDATE OF c' : ''}`,
        [commentId],
      );
      return rows[0];
    },

    async listComments(postId, { limit, offset }) {
      const [{ rows }, count] = await Promise.all([
        db.query(
          `SELECT c.*, json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url) AS author
           FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = $1
           ORDER BY c.created_at ASC, c.id ASC LIMIT $2 OFFSET $3`, [postId, limit, offset],
        ),
        db.query('SELECT COUNT(*)::integer AS total FROM comments WHERE post_id = $1', [postId]),
      ]);
      return { rows, total: count.rows[0].total };
    },

    async updateComment(commentId, content, client) {
      await client.query('UPDATE comments SET content = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [content, commentId]);
      return this.commentById(commentId, client);
    },

    async deleteComment(commentId, client) {
      await client.query('DELETE FROM comments WHERE id = $1', [commentId]);
    },
  };
}
