import type { Db } from '../plugins/acryl-db/src/index.ts'

export interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
}
export interface Conversation {
  id: number
  title: string
}

export function chatStore(db: Db) {
  return {
    conversations: (): Promise<Conversation[]> =>
      db.all<Conversation>('SELECT id, title FROM conversations ORDER BY id DESC'),
    conversation: (id: number): Promise<Conversation | undefined> =>
      db.get<Conversation>('SELECT id, title FROM conversations WHERE id = ?', id),
    messages: (id: number): Promise<Message[]> =>
      db.all<Message>('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id', id),
    async start(title: string): Promise<number> {
      const row = await db.get<{ id: number }>(
        'INSERT INTO conversations (title, created_at) VALUES (?, ?) RETURNING id',
        title.slice(0, 60),
        new Date().toISOString(),
      )
      return row!.id
    },
    async add(conversationId: number, role: Message['role'], content: string): Promise<void> {
      await db.run(
        'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
        conversationId,
        role,
        content,
      )
    },
    async remove(id: number): Promise<boolean> {
      const { changes } = await db.run('DELETE FROM conversations WHERE id = ?', id)
      return changes > 0
    },
  }
}
