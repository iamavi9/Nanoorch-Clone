import { db } from "../../db";
import { chatConversations, chatMessages } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IChatStorage {
  getConversation(id: string): Promise<typeof chatConversations.$inferSelect | undefined>;
  getAllConversations(workspaceId?: string): Promise<(typeof chatConversations.$inferSelect)[]>;
  createConversation(workspaceId: string, title: string): Promise<typeof chatConversations.$inferSelect>;
  deleteConversation(id: string): Promise<void>;
  getMessagesByConversation(conversationId: string): Promise<(typeof chatMessages.$inferSelect)[]>;
  createMessage(conversationId: string, role: string, content: string): Promise<typeof chatMessages.$inferSelect>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: string) {
    const [conversation] = await db.select().from(chatConversations).where(eq(chatConversations.id, id));
    return conversation;
  },

  async getAllConversations(workspaceId?: string) {
    const q = db.select().from(chatConversations);
    return workspaceId
      ? q.where(eq(chatConversations.workspaceId, workspaceId)).orderBy(desc(chatConversations.createdAt))
      : q.orderBy(desc(chatConversations.createdAt));
  },

  async createConversation(workspaceId: string, title: string) {
    const [conversation] = await db.insert(chatConversations).values({ workspaceId, title }).returning();
    return conversation;
  },

  async deleteConversation(id: string) {
    await db.delete(chatMessages).where(eq(chatMessages.conversationId, id));
    await db.delete(chatConversations).where(eq(chatConversations.id, id));
  },

  async getMessagesByConversation(conversationId: string) {
    return db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(chatMessages.createdAt);
  },

  async createMessage(conversationId: string, role: string, content: string) {
    const [message] = await db.insert(chatMessages).values({ conversationId, role, content }).returning();
    return message;
  },
};
