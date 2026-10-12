import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import Pusher from 'pusher';
import { verifyRoomSession } from '@/lib/roomSession';
import { z } from 'zod';
import { readBoundedJson } from '@/lib/http/requestBody';

export const runtime = 'nodejs';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function getPusherServer() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!appId || !key || !secret || !cluster) return null;
  return new Pusher({ appId, key, secret, cluster, useTLS: true });
}

function parseClientPayload(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = z.object({ roomId: z.string().min(4).max(64).regex(/^[a-z0-9-]+$/), userId: z.string().uuid(), sessionToken: z.string().min(1).max(2048) }).safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!process.env.BLOB_STORE_ID || !process.env.BLOB_WEBHOOK_PUBLIC_KEY) {
    return NextResponse.json(
      { error: 'Conecte o armazenamento Blob ao projeto Vercel nos ambientes Production e Preview.' },
      { status: 503 }
    );
  }
  const pusher = getPusherServer();
  if (!pusher) {
    return NextResponse.json({ error: 'A configuração do Pusher está incompleta.' }, { status: 503 });
  }

  const rawBody = await readBoundedJson(request, 64 * 1024);
  const bodyResult = z.discriminatedUnion('type', [
    z.object({
      type: z.literal('blob.generate-presigned-url'),
      payload: z.object({
        pathname: z.string().trim().min(1).max(1024).refine((path) => !path.includes('\\') && !path.split('/').includes('..')),
        multipart: z.boolean(),
        clientPayload: z.string().max(4096).nullable(),
      }).strict(),
    }).strict(),
    z.object({
      type: z.literal('blob.upload-completed'),
      payload: z.object({
        blob: z.record(z.string(), z.unknown()),
        tokenPayload: z.string().max(4096).nullable().optional(),
      }).passthrough(),
    }).strict(),
  ]).safeParse(rawBody);
  if (!bodyResult.success) return NextResponse.json({ error: 'Solicitação de envio inválida.' }, { status: 400 });
  let body = bodyResult.data as unknown as HandleUploadPresignedBody;

  try {
    const response = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname, clientPayload) => {
        const identity = parseClientPayload(clientPayload);
        if (
          !identity ||
          !verifyRoomSession(identity.roomId, identity.userId, identity.sessionToken) ||
          !pathname.startsWith(`chat/${identity.roomId}/`) ||
          pathname.includes('..')
        ) {
          throw new Error('Envio de imagem inválido.');
        }

        // Só libera o token temporário a alguém que está conectado àquela sala.
        const presence = await pusher.get({ path: `/channels/presence-room-${identity.roomId}/users` });
        if (presence.status !== 200) throw new Error('Não foi possível confirmar sua presença na sala.');
        const presenceBody = await presence.json() as { users?: Array<{ id?: string }> };
        if (!presenceBody.users?.some((user) => user.id === identity.userId)) {
          throw new Error('Entre na sala antes de enviar uma imagem.');
        }

        const validUntil = Date.now() + 10 * 60 * 1000;
        const token = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: ALLOWED_IMAGE_TYPES,
          maximumSizeInBytes: MAX_IMAGE_SIZE,
          validUntil,
        });

        return {
          token,
          urlOptions: {
            allowedContentTypes: ALLOWED_IMAGE_TYPES,
            maximumSizeInBytes: MAX_IMAGE_SIZE,
            validUntil,
            tokenPayload: JSON.stringify(identity),
          },
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error('Erro no envio de imagem do chat:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível preparar o envio da imagem.' },
      { status: 400 }
    );
  }
}
