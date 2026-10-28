import { internalMutation, internalQuery, internalAction } from './_generated/server';
import { v } from 'convex/values';

export const processGmailMessage = internalAction({
  args: { messageId: v.string(), historyId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const accessToken = await getValidAccessToken(ctx);
    if (!accessToken) throw new Error('No valid Gmail access token');

    const message = await fetchGmailMessage(accessToken, args.messageId);
    if (!message) return { success: false, reason: 'Message not found' };

    const attachment = findXlsxAttachment(message);
    if (!attachment) return { success: false, reason: 'No XLSX attachment found' };

    const attachmentData = await fetchGmailAttachment(accessToken, args.messageId, attachment.attachmentId);
    if (!attachmentData) return { success: false, reason: 'Failed to download attachment' };

    const hash = await hashBuffer(attachmentData);
    const existing = await ctx.runQuery(internalQuery.imports.getImportBatchByHash, { hash });
    if (existing) return { success: true, duplicate: true, batchId: existing._id };

    const storageId = await ctx.storage.store(new Blob([attachmentData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const reportDate = parseReportDateFromFilename(attachment.filename) || Date.now();

    const batchResult = await ctx.runMutation(internalMutation.imports.createImportBatch, {
      gmailMessageId: args.messageId,
      gmailHistoryId: args.historyId,
      attachmentName: attachment.filename,
      attachmentHash: hash,
      reportDate,
      storageId,
    });

    if (batchResult.isDuplicate) return { success: true, duplicate: true, batchId: batchResult.batchId };

    const rows = parseXlsxBuffer(attachmentData);
    await ctx.runMutation(internalMutation.imports.processImportBatch, { batchId: batchResult.batchId, rows });

    return { success: true, batchId: batchResult.batchId };
  },
});

export const syncGmailHistory = internalAction({
  args: { startHistoryId: v.string() },
  handler: async (ctx, args) => {
    const accessToken = await getValidAccessToken(ctx);
    if (!accessToken) throw new Error('No valid Gmail access token');

    let historyId = args.startHistoryId;
    let pageToken: string | undefined;

    do {
      const history = await fetchGmailHistory(accessToken, historyId, pageToken);
      if (!history) break;

      for (const record of history.history || []) {
        for (const message of record.messagesAdded || []) {
          const labels = message.message.labelIds || [];
          const settings = await ctx.runQuery(internalQuery.settings.getImportSettings);
          if (settings && labels.some((l: string) => settings.gmailLabel && l === settings.gmailLabel)) {
            await ctx.runAction(internalAction.email.import.processGmailMessage, {
              messageId: message.message.id,
              historyId: historyId,
            });
          }
        }
      }

      pageToken = history.nextPageToken;
      historyId = history.historyId;
    } while (pageToken);

    await ctx.runMutation(internalMutation.settings.updateSyncCursor, { historyId });
  },
});

async function getValidAccessToken(ctx: any): Promise<string | null> {
  const tokenDoc = await ctx.db.query('gmailTokens').first();
  if (!tokenDoc) return null;
  if (tokenDoc.expiresAt > Date.now() + 60000) return tokenDoc.accessToken;
  const refreshed = await refreshAccessToken(tokenDoc.refreshToken);
  if (refreshed) {
    await ctx.db.patch(tokenDoc._id, { accessToken: refreshed.accessToken, expiresAt: Date.now() + refreshed.expiresIn * 1000 });
    return refreshed.accessToken;
  }
  return null;
}

async function fetchGmailMessage(accessToken: string, messageId: string): Promise<any> {
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

async function fetchGmailHistory(accessToken: string, startHistoryId: string, pageToken?: string): Promise<any> {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/history');
  url.searchParams.set('startHistoryId', startHistoryId);
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  return res.json();
}

function findXlsxAttachment(message: any): { attachmentId: string; filename: string } | null {
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

function parseXlsxBuffer(buffer: ArrayBuffer): any[] {
  // This would use xlsx library in real implementation
  // For now return empty - actual parsing happens in the import mutation
  return [];
}