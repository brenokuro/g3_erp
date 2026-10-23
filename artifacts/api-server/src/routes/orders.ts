import {
  CreateOrderAttachmentBody,
  CreateOrderAttachmentParams,
  CreateOrderAttachmentResponse,
  CreateOrderBody,
  CreateOrderResponse,
  DeleteOrderAttachmentParams,
  DeleteOrderParams,
  DeleteOrderResponse,
  GetOrderParams,
  GetOrderResponse,
  ListOrderAttachmentsParams,
  ListOrderAttachmentsResponse,
  ListOrderEventsParams,
  ListOrderEventsResponse,
  ListOrdersQueryParams,
  ListOrdersResponse,
  OrderStatus,
  UpdateOrderBody,
  UpdateOrderParams,
  UpdateOrderResponse,
} from "@workspace/api-zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import {
  attachmentsTable,
  clientsTable,
  db,
  orderEventsTable,
  ordersTable,
} from "@workspace/db";
import { Router, type IRouter } from "express";
import {
  deleteObject,
  getObjectMetadata,
  isValidBlobPathname,
  ObjectNotFoundError,
} from "../lib/objectStorage";

const router: IRouter = Router();

type OrderRow = typeof ordersTable.$inferSelect;

function asOrder(order: OrderRow, clientName: string) {
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

async function findOwnedOrder(id: number, ownerId: string) {
  const [result] = await db
    .select({ order: ordersTable, clientName: clientsTable.name })
    .from(ordersTable)
    .innerJoin(clientsTable, eq(ordersTable.clientId, clientsTable.id))
    .where(and(eq(ordersTable.id, id), eq(ordersTable.ownerId, ownerId)));
  return result;
}

async function removeStoredObject(objectPath: string): Promise<void> {
  try {
    await deleteObject(objectPath);
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) throw error;
  }
}

function attachmentResponse(
  attachment: typeof attachmentsTable.$inferSelect,
) {
  return {
    id: attachment.id,
    orderId: attachment.orderId,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    size: attachment.size,
    category: attachment.category,
    objectPath: attachment.objectPath,
    createdAt: attachment.createdAt.toISOString(),
  };
}

router.get("/orders", async (req, res): Promise<void> => {
  const params = ListOrdersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const ownerId = req.user!.id;
  const conditions = [eq(ordersTable.ownerId, ownerId)];
  if (params.data.status) {
    conditions.push(eq(ordersTable.status, params.data.status as OrderStatus));
  }
  const search = params.data.search?.trim();
  if (search) {
    const term = `%${search}%`;
    const searchConditions = [
      ilike(ordersTable.title, term),
      ilike(clientsTable.name, term),
    ];
    if (/^\d+$/.test(search)) {
      searchConditions.push(eq(ordersTable.id, Number(search)));
    }
    conditions.push(or(...searchConditions)!);
  }

  const rows = await db
    .select({ order: ordersTable, clientName: clientsTable.name })
    .from(ordersTable)
    .innerJoin(clientsTable, eq(ordersTable.clientId, clientsTable.id))
    .where(and(...conditions))
    .orderBy(desc(ordersTable.createdAt));

  res.json(
    ListOrdersResponse.parse(
      rows.map(({ order, clientName }) => asOrder(order, clientName)),
    ),
  );
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const ownerId = req.user!.id;
  const [client] = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.id, parsed.data.clientId),
        eq(clientsTable.ownerId, ownerId),
      ),
    );
  if (!client) {
    res.status(400).json({ error: "Choose one of your registered clients." });
    return;
  }

  const status = parsed.data.status ?? "orcamento";
  const created = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(ordersTable)
      .values({
        ...parsed.data,
        amount: String(parsed.data.amount),
        status,
        ownerId,
      })
      .returning();
    await tx.insert(orderEventsTable).values({
      ownerId,
      orderId: order.id,
      fromStatus: null,
      toStatus: status,
      note: "Pedido criado",
    });
    return order;
  });

  const result = await findOwnedOrder(created.id, ownerId);
  res
    .status(201)
    .json(
      CreateOrderResponse.parse(
        result && asOrder(result.order, result.clientName),
      ),
    );
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await findOwnedOrder(params.data.id, req.user!.id);
  if (!result) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(GetOrderResponse.parse(asOrder(result.order, result.clientName)));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "At least one field is required" });
    return;
  }

  const ownerId = req.user!.id;
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.id, params.data.id),
          eq(ordersTable.ownerId, ownerId),
        ),
      );
    if (!current) return null;

    if (parsed.data.clientId !== undefined) {
      const [client] = await tx
        .select({ id: clientsTable.id })
        .from(clientsTable)
        .where(
          and(
            eq(clientsTable.id, parsed.data.clientId),
            eq(clientsTable.ownerId, ownerId),
          ),
        );
      if (!client) return "invalid-client" as const;
    }

    const { amount, ...fields } = parsed.data;
    const updateFields = {
      ...fields,
      ...(amount !== undefined ? { amount: String(amount) } : {}),
      updatedAt: new Date(),
    };
    const [order] = await tx
      .update(ordersTable)
      .set(updateFields)
      .where(eq(ordersTable.id, params.data.id))
      .returning();

    if (parsed.data.status && parsed.data.status !== current.status) {
      await tx.insert(orderEventsTable).values({
        ownerId,
        orderId: order.id,
        fromStatus: current.status,
        toStatus: parsed.data.status,
        note: `Status atualizado para ${parsed.data.status}`,
      });
    }
    return order;
  });

  if (updated === "invalid-client") {
    res.status(400).json({ error: "Choose one of your registered clients." });
    return;
  }
  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const result = await findOwnedOrder(updated.id, ownerId);
  res.json(
    UpdateOrderResponse.parse(
      result && asOrder(result.order, result.clientName),
    ),
  );
});

router.delete("/orders/:id", async (req, res): Promise<void> => {
  const params = DeleteOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const ownerId = req.user!.id;
  const [order] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.ownerId, ownerId)));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const attachments = await db
    .select({ objectPath: attachmentsTable.objectPath })
    .from(attachmentsTable)
    .where(
      and(
        eq(attachmentsTable.orderId, order.id),
        eq(attachmentsTable.ownerId, ownerId),
      ),
    );
  try {
    for (const attachment of attachments) {
      await removeStoredObject(attachment.objectPath);
    }
  } catch (error) {
    req.log.error({ err: error, orderId: order.id }, "Could not remove order files");
    res.status(502).json({ error: "Could not remove attached documents" });
    return;
  }

  await db
    .delete(ordersTable)
    .where(and(eq(ordersTable.id, order.id), eq(ordersTable.ownerId, ownerId)));
  res.status(204).json(DeleteOrderResponse.parse(undefined));
});

router.get("/orders/:id/events", async (req, res): Promise<void> => {
  const params = ListOrderEventsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const ownerId = req.user!.id;
  const [order] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.ownerId, ownerId)));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const events = await db
    .select()
    .from(orderEventsTable)
    .where(
      and(
        eq(orderEventsTable.orderId, order.id),
        eq(orderEventsTable.ownerId, ownerId),
      ),
    )
    .orderBy(orderEventsTable.createdAt);

  res.json(
    ListOrderEventsResponse.parse(
      events.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    ),
  );
});

router.get("/orders/:id/attachments", async (req, res): Promise<void> => {
  const params = ListOrderAttachmentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ownerId = req.user!.id;
  const [order] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.ownerId, ownerId)));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const attachments = await db
    .select()
    .from(attachmentsTable)
    .where(
      and(
        eq(attachmentsTable.orderId, order.id),
        eq(attachmentsTable.ownerId, ownerId),
      ),
    )
    .orderBy(desc(attachmentsTable.createdAt));
  res.json(
    ListOrderAttachmentsResponse.parse(
      attachments.map(attachmentResponse),
    ),
  );
});

router.post("/orders/:id/attachments", async (req, res): Promise<void> => {
  const params = CreateOrderAttachmentParams.safeParse(req.params);
  const parsed = CreateOrderAttachmentBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const ownerId = req.user!.id;
  const [order] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.ownerId, ownerId)));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (
    !isValidBlobPathname(parsed.data.objectPath) ||
    !parsed.data.objectPath.startsWith(`orders/${order.id}/`)
  ) {
    res.status(400).json({ error: "Invalid private document path" });
    return;
  }

  try {
    const metadata = await getObjectMetadata(parsed.data.objectPath);
    if (
      Number(metadata.size) !== parsed.data.size ||
      (metadata.contentType && metadata.contentType !== parsed.data.contentType)
    ) {
      res.status(400).json({ error: "Uploaded file metadata does not match" });
      return;
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "Uploaded document was not found" });
      return;
    }
    throw error;
  }

  const [attachment] = await db
    .insert(attachmentsTable)
    .values({
      ...parsed.data,
      ownerId,
      orderId: order.id,
    })
    .returning();
  res
    .status(201)
    .json(
      CreateOrderAttachmentResponse.parse(attachmentResponse(attachment)),
    );
});

router.delete(
  "/orders/:id/attachments/:attachmentId",
  async (req, res): Promise<void> => {
    const params = DeleteOrderAttachmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const ownerId = req.user!.id;
    const [attachment] = await db
      .select()
      .from(attachmentsTable)
      .where(
        and(
          eq(attachmentsTable.id, params.data.attachmentId),
          eq(attachmentsTable.orderId, params.data.id),
          eq(attachmentsTable.ownerId, ownerId),
        ),
      );
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    try {
      await removeStoredObject(attachment.objectPath);
    } catch (error) {
      req.log.error(
        { err: error, attachmentId: attachment.id },
        "Could not remove order file",
      );
      res.status(502).json({ error: "Could not remove attached document" });
      return;
    }

    await db
      .delete(attachmentsTable)
      .where(
        and(
          eq(attachmentsTable.id, attachment.id),
          eq(attachmentsTable.ownerId, ownerId),
        ),
      );
    res.sendStatus(204);
  },
);

export default router;
