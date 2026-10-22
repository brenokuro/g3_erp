import {
  CreateClientBody,
  CreateClientResponse,
  DeleteClientParams,
  GetClientParams,
  GetClientResponse,
  ListClientsQueryParams,
  ListClientsResponse,
  UpdateClientBody,
  UpdateClientParams,
  UpdateClientResponse,
} from "@workspace/api-zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, clientsTable, ordersTable } from "@workspace/db";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

function clientResponse(client: typeof clientsTable.$inferSelect) {
  return {
    id: client.id,
    name: client.name,
    companyName: client.companyName,
    email: client.email,
    phone: client.phone,
    document: client.document,
    address: client.address,
    notes: client.notes,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

router.get("/clients", async (req, res): Promise<void> => {
  const params = ListClientsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const ownerId = req.user!.id;
  const conditions = [eq(clientsTable.ownerId, ownerId)];
  const search = params.data.search?.trim();
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(clientsTable.name, term),
        ilike(clientsTable.companyName, term),
        ilike(clientsTable.email, term),
        ilike(clientsTable.phone, term),
      )!,
    );
  }

  const clients = await db
    .select()
    .from(clientsTable)
    .where(and(...conditions))
    .orderBy(desc(clientsTable.createdAt));

  res.json(ListClientsResponse.parse(clients.map(clientResponse)));
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [client] = await db
    .insert(clientsTable)
    .values({ ...parsed.data, ownerId: req.user!.id })
    .returning();

  res.status(201).json(CreateClientResponse.parse(clientResponse(client)));
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const params = GetClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.id, params.data.id),
        eq(clientsTable.ownerId, req.user!.id),
      ),
    );

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(GetClientResponse.parse(clientResponse(client)));
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const params = UpdateClientParams.safeParse(req.params);
  const parsed = UpdateClientBody.safeParse(req.body);
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

  const [client] = await db
    .update(clientsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(
      and(
        eq(clientsTable.id, params.data.id),
        eq(clientsTable.ownerId, req.user!.id),
      ),
    )
    .returning();

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(UpdateClientResponse.parse(clientResponse(client)));
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  const params = DeleteClientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existingOrder] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.clientId, params.data.id),
        eq(ordersTable.ownerId, req.user!.id),
      ),
    )
    .limit(1);

  if (existingOrder) {
    res
      .status(400)
      .json({ error: "Client has orders. Remove or reassign them first." });
    return;
  }

  const [client] = await db
    .delete(clientsTable)
    .where(
      and(
        eq(clientsTable.id, params.data.id),
        eq(clientsTable.ownerId, req.user!.id),
      ),
    )
    .returning({ id: clientsTable.id });

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
