import 'dotenv/config';
import bcrypt from 'bcrypt';
import { createDatabase } from '../src/config/database.js';

let db;
try {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed de demonstração desabilitado em produção.');
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no .env.');
  db = createDatabase(process.env.DATABASE_URL);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash('Fitinity123!', 10);
    for (const [name, email, content] of [
      ['Ana Fitness', 'ana@example.com', 'Treino concluído! Qual é a meta de vocês nesta semana?'],
      ['Bruno Corrida', 'bruno@example.com', 'Hoje completei meus primeiros 5 km!'],
    ]) {
      const user = await client.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id',
        [name, email, hash],
      );
      if (user.rowCount) await client.query('INSERT INTO posts (user_id, content) VALUES ($1, $2)', [user.rows[0].id, content]);
    }
    await client.query('COMMIT');
    console.log('Seed concluído sem sobrescrever contas existentes.');
    console.log('Demonstração: ana@example.com e bruno@example.com / senha: Fitinity123!');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error(`Falha no seed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db?.end();
}
