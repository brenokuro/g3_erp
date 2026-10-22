import { createInsertSchema } from "drizzle-zod";
import {
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const orderStatusValues = [
  "orcamento",
  "aguardando_aprovacao",
  "em_impressao",
  "pos_processamento",
  "pronto",
  "entregue",
  "cancelado",
] as const;

export const orderStatusEnum = pgEnum("print_order_status", orderStatusValues);

export const clientsTable = pgTable(
  "print_clients",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    companyName: text("company_name"),
    email: text("email"),
    phone: text("phone"),
    document: text("document"),
    address: text("address"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("print_clients_owner_idx").on(table.ownerId)],
);

export const ordersTable = pgTable(
  "print_orders",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    material: text("material"),
    color: text("color"),
    quantity: integer("quantity").notNull().default(1),
    amount: numeric("amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    status: orderStatusEnum("status").notNull().default("orcamento"),
    dueDate: date("due_date", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("print_orders_owner_idx").on(table.ownerId),
    index("print_orders_client_idx").on(table.clientId),
    index("print_orders_status_idx").on(table.ownerId, table.status),
  ],
);

export const orderEventsTable = pgTable(
  "print_order_events",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("print_order_events_order_idx").on(table.orderId)],
);

export const attachmentsTable = pgTable(
  "print_order_attachments",
  {
    id: serial("id").primaryKey(),
    ownerId: varchar("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    category: varchar("category", { length: 32 }).notNull(),
    objectPath: text("object_path").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("print_order_attachments_order_idx").on(table.orderId),
    index("print_order_attachments_owner_idx").on(table.ownerId),
  ],
);

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});
export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});
export const insertOrderEventSchema = createInsertSchema(orderEventsTable).omit({
  id: true,
  ownerId: true,
  createdAt: true,
});
export const insertAttachmentSchema = createInsertSchema(attachmentsTable).omit({
  id: true,
  ownerId: true,
  createdAt: true,
});

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type PrintOrder = typeof ordersTable.$inferSelect;
export type InsertOrderEvent = z.infer<typeof insertOrderEventSchema>;
export type OrderEvent = typeof orderEventsTable.$inferSelect;
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type OrderAttachment = typeof attachmentsTable.$inferSelect;
