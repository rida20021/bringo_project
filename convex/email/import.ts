import { internalAction } from '../_generated/server';
import type { ActionCtx } from '../_generated/server';
import { v } from 'convex/values';
import { internal } from '../_generated/api'; // <-- The correct way to import internal APIs
import type { Id } from '../_generated/dataModel';

type ProcessGmailMessageResult = {
  success: boolean;
  reason?: string;
  duplicate?: boolean;
  batchId?: Id<'importBatches'>;
};

type GmailMessagePart = {
  filename?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  payload?: GmailMessagePart;
};

type GmailHistoryResponse = {
  history?: Array<{
    id?: string;
    messagesAdded?: Array<{ message: GmailMessage }>;
  }>;
  nextPageToken?: string;
  historyId?: string;
};

export const processGmailMessage = internalAction({
  args: { messageId: v.string(), historyId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<ProcessGmailMessageResult> => {
    const accessToken = await getValidAccessToken(ctx);
    if (!accessToken) throw new Error('No valid Gmail access token');

    const message = await fetchGmailMessage(accessToken, args.messageId);
    if (!message) return { success: false, reason: 'Message not found' };

    const attachment = findXlsxAttachment(message);
    if (!attachment) return { success: false, reason: 'No XLSX attachment found' };

    const attachmentData = await fetchGmailAttachment(accessToken, args.messageId, attachment.attachmentId);
    if (!attachmentData) return { success: false, reason: 'Failed to download attachment' };

    const hash = await hashBuffer(attachmentData);
    
    // FIX: Use internal.imports instead of internalQuery.imports
    const existing: { _id: Id<'importBatches'> } | null = await ctx.runQuery(internal.imports.getImportBatchByHash, { hash });
    if (existing) return { success: true, duplicate: true, batchId: existing._id };

    const storageId = await ctx.storage.store(new Blob([attachmentData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const reportDate = parseReportDateFromFilename(attachment.filename) || Date.now();

    // FIX: Use internal.imports instead of internalMutation.imports
    const batchResult: { batchId: Id<'importBatches'>; isDuplicate: boolean } = await ctx.runMutation(internal.imports.createImportBatch, {
      gmailMessageId: args.messageId,
      gmailHistoryId: args.historyId,
      attachmentName: attachment.filename,
      attachmentHash: hash,
      reportDate,
      storageId,
    });

    if (batchResult.isDuplicate) return { success: true, duplicate: true, batchId: batchResult.batchId };

    const rows = parseXlsxBuffer(attachmentData);
    await ctx.runMutation(internal.imports.processImportBatch, { batchId: batchResult.batchId, rows });

    return { success: true, batchId: batchResult.batchId };
  },
});

export const syncGmailHistory = internalAction({
  args: { startHistoryId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const accessToken = await getValidAccessToken(ctx);
    if (!accessToken) throw new Error('No valid Gmail access token');

    let historyId = args.startHistoryId;
    let pageToken: string | undefined;

    do {
      const history = await fetchGmailHistory(accessToken, historyId, pageToken);
      if (!history) break;

      for (const record of history.history || []) {
        for (const message of record.messagesAdded || []) {
          const messageId = message.message.id;
          if (!messageId) continue;
          const labels = message.message.labelIds || [];
          // FIX: Use internal.settings
          const settings = await ctx.runQuery(internal.settings.getImportSettings);
          
          if (settings && labels.some((l: string) => settings.gmailLabel && l === settings.gmailLabel)) {
            // FIX: Use internal.email.import
            await ctx.runAction(internal.email.import.processGmailMessage, {
              messageId,
              historyId: historyId,
            });
          }
        }
      }

      pageToken = history.nextPageToken;
      if (history.historyId) historyId = history.historyId;
    } while (pageToken);

    // FIX: Use internal.settings
    await ctx.runMutation(internal.settings.updateSyncCursor, { historyId });
  },
});

async function getValidAccessToken(ctx: ActionCtx): Promise<string | null> {
  // Actions cannot touch ctx.db directly; settings are read/written via functions.
  const tokenDoc = await ctx.runQuery(internal.settings.getGmailToken);

  if (!tokenDoc) return null;
  if (tokenDoc.expiresAt > Date.now() + 60000) return tokenDoc.accessToken;

  if (!tokenDoc.refreshToken) return null;
  const refreshed = await refreshAccessToken(tokenDoc.refreshToken);

  if (refreshed) {
    await ctx.runMutation(internal.settings.updateGmailToken, {
      id: tokenDoc._id,
      accessToken: refreshed.accessToken,
      expiresAt: Date.now() + refreshed.expiresIn * 1000,
    });
    return refreshed.accessToken;
  }
  return null;
}

async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token || !data.expires_in) return null;
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

async function fetchGmailMessage(accessToken: string, messageId: string): Promise<GmailMessage | null> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchGmailAttachment(accessToken: string, messageId: string, attachmentId: string): Promise<ArrayBuffer | null> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const binary = atob(data.data.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function fetchGmailHistory(accessToken: string, startHistoryId: string, pageToken?: string): Promise<GmailHistoryResponse | null> {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/history');
  url.searchParams.set('startHistoryId', startHistoryId);
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return res.json();
}

function findXlsxAttachment(message: GmailMessage): { attachmentId: string; filename: string } | null {
  const parts = message.payload?.parts || [];
  for (const part of parts) {
    if (part.filename?.endsWith('.xlsx') && part.body?.attachmentId) {
      return { attachmentId: part.body.attachmentId, filename: part.filename };
    }
    if (part.parts) {
      const found = findXlsxAttachment({ payload: { parts: part.parts } });
      if (found) return found;
    }
  }
  return null;
}

async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseReportDateFromFilename(filename: string): number | null {
  const match = filename.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
  if (match) return new Date(match[1].replace(/-/g, '/')).getTime();
  return null;
}

function parseXlsxBuffer(_buffer: ArrayBuffer): Record<string, unknown>[] {
  // This would use xlsx library in real implementation
  // For now return empty - actual parsing happens in the import mutation
  return [];
}