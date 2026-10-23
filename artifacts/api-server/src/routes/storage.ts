import { Readable } from 'stream';
import {
  handleUpload,
  type HandleUploadBody,
} from '@vercel/blob/client';
import { and, eq } from 'drizzle-orm';
import { attachmentsTable, db, ordersTable } from '@workspace/db';
import { Router, type IRouter, type Request, type Response } from 'express';

import {
  downloadObject,
  isBlobUploadConfigured,
  isValidBlobPathname,
  ObjectNotFoundError,
} from '../lib/objectStorage';

const router: IRouter = Router();

const allowedUploadTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * POST /storage/uploads/request-url
 *
 * Generates a short-lived client token so the browser can upload a document
 * directly to Vercel Blob without sending the file through the API.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!isBlobUploadConfigured()) {
      res.status(503).json({
        error:
          'Armazenamento de arquivos não configurado. Defina BLOB_READ_WRITE_TOKEN.',
      });
      return;
    }

    const body = req.body as HandleUploadBody;

    try {
      const jsonResponse = await handleUpload({
        body,
        request: req,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const payload = parseClientPayload(clientPayload);
          if (!payload) {
            throw new Error('Payload de upload inválido.');
          }
          if (!allowedUploadTypes.has(payload.contentType)) {
            throw new Error('Tipo de documento não suportado.');
          }
          if (payload.size > MAX_UPLOAD_BYTES) {
            throw new Error('O arquivo deve ter até 10 MB.');
          }
          if (
            !isValidBlobPathname(pathname) ||
            !pathname.startsWith(`orders/${payload.orderId}/`)
          ) {
            throw new Error('Caminho de upload inválido.');
          }

          const [order] = await db
            .select({ id: ordersTable.id })
            .from(ordersTable)
            .where(
              and(
                eq(ordersTable.id, payload.orderId),
                eq(ordersTable.ownerId, req.user!.id),
              ),
            )
            .limit(1);
          if (!order) {
            throw new Error('Pedido não encontrado.');
          }

          return {
            allowedContentTypes: [...allowedUploadTypes],
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            addRandomSuffix: false,
            tokenPayload: JSON.stringify({
              userId: req.user!.id,
              orderId: payload.orderId,
            }),
          };
        },
      });

      res.json(jsonResponse);
    } catch (error) {
      req.log.warn({ err: error }, 'Error generating upload token');
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível preparar o upload.',
      });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serves a private document to its authenticated owner.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const raw = req.params.path;
  const objectPath = Array.isArray(raw) ? raw.join('/') : raw;

  try {
    const [attachment] = await db
      .select({ id: attachmentsTable.id })
      .from(attachmentsTable)
      .where(
        and(
          eq(attachmentsTable.objectPath, objectPath),
          eq(attachmentsTable.ownerId, req.user.id),
        ),
      )
      .limit(1);

    if (!attachment) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    const result = await downloadObject(objectPath);
    if (result.statusCode !== 200 || !result.stream) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    res.status(200);
    res.setHeader(
      'Content-Type',
      result.blob.contentType ?? 'application/octet-stream',
    );
    if (result.blob.size) {
      res.setHeader('Content-Length', String(result.blob.size));
    }
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (result.blob.etag) {
      res.setHeader('ETag', result.blob.etag);
    }

    Readable.fromWeb(result.stream as Parameters<typeof Readable.fromWeb>[0])
      .on('error', (error) => {
        req.log.error({ err: error }, 'Error streaming object');
        res.destroy(error);
      })
      .pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

function parseClientPayload(
  clientPayload: string | null | undefined,
): { orderId: number; contentType: string; size: number } | null {
  if (!clientPayload) return null;
  try {
    const value = JSON.parse(clientPayload) as Record<string, unknown>;
    const orderId = Number(value.orderId);
    const contentType = value.contentType;
    const size = Number(value.size);
    if (
      !Number.isInteger(orderId) ||
      orderId <= 0 ||
      typeof contentType !== 'string' ||
      !Number.isFinite(size) ||
      size <= 0
    ) {
      return null;
    }
    return { orderId, contentType, size };
  } catch {
    return null;
  }
}

export default router;
