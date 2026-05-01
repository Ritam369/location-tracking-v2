import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  userId:    uuid("user_id").primaryKey().defaultRandom(),
  firstName: varchar("first_name", { length: 25 }).notNull(),
  lastName:  varchar("last_name",  { length: 25 }),
  email:     varchar("email", { length: 322 }).notNull().unique(),
  password:  varchar("password",   { length: 64 }).notNull(),
  salt:      text("salt").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});
