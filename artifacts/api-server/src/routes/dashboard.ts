import { GetDashboardResponse } from "@workspace/api-zod";
import { and, count, desc, eq, gte, lt, notInArray, sum } from "drizzle-orm";
import {
  clientsTable,
  db,
  orderStatusValues,
  ordersTable,
} from "@workspace/db";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

function asOrder(
  order: typeof ordersTable.$inferSelect,
  clientName: string,
) {
  return {
    id: order.id,
    orderNumber: `PED-${String(order.id).padStart(5, "0")}`,
    clientId: order.clientId,
    clientName,
    title: order.title,
    description: order.description,
    material: order.material,
    color: order.color,
    quantity: order.quantity,
    amount: Number(order.amount),
    status: order.status,
    dueDate: order.dueDate,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const ownerId = req.user!.id;
  const [clientTotal] = await db
    .select({ value: count() })
    .from(clientsTable)
    .where(eq(clientsTable.ownerId, ownerId));
  const [openOrderTotal] = await db
    .select({ value: count() })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.ownerId, ownerId),
        notInArray(ordersTable.status, ["entregue", "cancelado"]),
      ),
    );

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [revenue] = await db
    .select({ value: sum(ordersTable.amount) })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.ownerId, ownerId),
        eq(ordersTable.status, "entregue"),
        gte(ordersTable.updatedAt, monthStart),
        lt(ordersTable.updatedAt, nextMonth),
      ),
    );
  const [pending] = await db
    .select({ value: sum(ordersTable.amount) })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.ownerId, ownerId),
        notInArray(ordersTable.status, ["entregue", "cancelado"]),
      ),
    );
  const groupedStatuses = await db
    .select({ status: ordersTable.status, value: count() })
    .from(ordersTable)
    .where(eq(ordersTable.ownerId, ownerId))
    .groupBy(ordersTable.status);
  const statusTotals = new Map(
    groupedStatuses.map((row) => [row.status, Number(row.value)]),
  );
  const recent = await db
    .select({ order: ordersTable, clientName: clientsTable.name })
    .from(ordersTable)
    .innerJoin(clientsTable, eq(ordersTable.clientId, clientsTable.id))
    .where(eq(ordersTable.ownerId, ownerId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(5);

  res.json(
    GetDashboardResponse.parse({
      clientsCount: Number(clientTotal?.value ?? 0),
      openOrders: Number(openOrderTotal?.value ?? 0),
      monthRevenue: Number(revenue?.value ?? 0),
      pendingValue: Number(pending?.value ?? 0),
      statusCounts: orderStatusValues.map((status) => ({
        status,
        count: statusTotals.get(status) ?? 0,
      })),
      recentOrders: recent.map(({ order, clientName }) =>
        asOrder(order, clientName),
      ),
    }),
  );
});

export default router;
