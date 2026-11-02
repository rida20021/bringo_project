import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

export default defineSchema({
  ...authTables,

  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    /**
     * Internal marker set only while an admin-provisioned account is being
     * created. The auth callback consumes it and clears it immediately, so it
     * never persists or reaches clients.
     */
    provisioningRole: v.optional(v.union(v.literal('rider'), v.literal('supervisor'))),
  }).index('email', ['email'])
    .index('phone', ['phone']),

  userProfiles: defineTable({
    userId: v.id('users'),
    role: v.union(v.literal('supervisor'), v.literal('admin'), v.literal('rider')),
    displayName: v.string(),
    isActive: v.boolean(),
    /**
     * Soft-delete marker. Archived accounts are hidden from the admin
     * directory and cannot authenticate, but their financial history is kept.
     */
    isArchived: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('userId', ['userId'])
    .index('role', ['role']),

  markets: defineTable({
    name: v.string(),
    externalId: v.string(),
    city: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('externalId', ['externalId'])
    .index('name', ['name'])
    .index('city', ['city']),

  liveEntries: defineTable({
    riderUserId: v.id('users'),
    commandId: v.string(),
    // Lowercased command id, used to block duplicate submissions.
    commandKey: v.string(),
    marketId: v.id('markets'),
    // Snapshots keep historical rows readable if a market is renamed.
    marketName: v.string(),
    marketExternalId: v.string(),
    /** Integer centimes. */
    amount: v.number(),
    paymentMethod: v.union(v.literal('cash'), v.literal('tpe'), v.literal('card')),
    /** Start of the Casablanca day, so entries can be listed per day. */
    entryDate: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('riderUserId', ['riderUserId'])
    .index('riderEntryDate', ['riderUserId', 'entryDate'])
    .index('riderCommandDate', ['riderUserId', 'entryDate', 'commandKey'])
    .index('marketId', ['marketId'])
    .index('entryDate', ['entryDate']),

  liveEntryReceipts: defineTable({
    liveEntryId: v.id('liveEntries'),
    riderUserId: v.id('users'),
    kind: v.union(v.literal('tpe'), v.literal('bank_deposit')),
    storageId: v.id('_storage'),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    status: v.union(
      v.literal('pending_review'),
      v.literal('approved'),
      v.literal('rejected')
    ),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    createdAt: v.number(),
  }).index('liveEntryId', ['liveEntryId'])
    .index('riderUserId', ['riderUserId'])
    .index('status', ['status']),

  discrepancies: defineTable({
    reason: v.union(v.literal('missing_in_excel'), v.literal('amount_mismatch')),
    commandId: v.string(),
    /** Lowercased/trimmed command id used for case-insensitive matching. */
    commandKey: v.string(),
    /** Start of the Casablanca day the live entry belongs to. */
    entryDate: v.number(),
    riderUserId: v.id('users'),
    riderName: v.string(),
    liveEntryId: v.id('liveEntries'),
    orderId: v.optional(v.id('orders')),
    importBatchId: v.optional(v.id('importBatches')),
    /** Integer centimes, as entered live by the rider. */
    riderAmount: v.number(),
    /** Integer centimes; absent when the command is missing from Excel. */
    excelAmount: v.optional(v.number()),
    status: v.union(v.literal('open'), v.literal('resolved')),
    resolvedBy: v.optional(v.id('users')),
    resolvedAt: v.optional(v.number()),
    resolutionNote: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('status', ['status'])
    .index('entryDate', ['entryDate'])
    .index('liveEntryId', ['liveEntryId'])
    .index('liveEntryReason', ['liveEntryId', 'reason'])
    .index('commandKey', ['commandKey']),

  riders: defineTable({
    canonicalName: v.string(),
    aliases: v.array(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('canonicalName', ['canonicalName']),

  importBatches: defineTable({
    gmailMessageId: v.string(),
    gmailHistoryId: v.optional(v.string()),
    attachmentName: v.string(),
    attachmentHash: v.string(),
    reportDate: v.number(),
    receivedAt: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.union(
      v.literal('pending'),
      v.literal('processing'),
      v.literal('completed'),
      v.literal('failed'),
      v.literal('needs_review')
    ),
    totalRows: v.number(),
    acceptedRows: v.number(),
    rejectedRows: v.number(),
    duplicateRows: v.number(),
    conflictRows: v.number(),
    errorSummary: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    createdBy: v.optional(v.id('users')),
  }).index('gmailMessageId', ['gmailMessageId'])
    .index('attachmentHash', ['attachmentHash'])
    .index('reportDate', ['reportDate']),

  sourceRows: defineTable({
    importBatchId: v.id('importBatches'),
    originalRowNumber: v.number(),
    originalData: v.any(),
    validationState: v.union(
      v.literal('valid'),
      v.literal('invalid'),
      v.literal('duplicate'),
      v.literal('conflict')
    ),
    errors: v.optional(v.array(v.string())),
    warnings: v.optional(v.array(v.string())),
    linkedOrderId: v.optional(v.id('orders')),
  }).index('importBatchId', ['importBatchId'])
    .index('validationState', ['validationState']),

  orders: defineTable({
    commandId: v.string(),
    deliveryDate: v.number(),
    riderId: v.id('riders'),
    rawRiderName: v.string(),
    paymentMethod: v.union(v.literal('cash'), v.literal('card'), v.literal('online_payment')),
    amount: v.number(),
    store: v.optional(v.string()),
    company: v.optional(v.string()),
    shippingInfo: v.optional(v.any()),
    sourceRowId: v.id('sourceRows'),
    importBatchId: v.id('importBatches'),
    eligibilityStatus: v.union(
      v.literal('eligible'),
      v.literal('excluded_payment_method'),
      v.literal('quarantined')
    ),
    createdAt: v.number(),
  }).index('commandId', ['commandId'])
    .index('deliveryDate', ['deliveryDate'])
    .index('riderId', ['riderId'])
    .index('paymentMethod', ['paymentMethod'])
    .index('importBatchId', ['importBatchId']),

  cashCollections: defineTable({
    riderId: v.id('riders'),
    amount: v.number(),
    collectedAt: v.number(),
    collectedBy: v.id('users'),
    note: v.optional(v.string()),
    sourceReportDate: v.number(),
    reversalOf: v.optional(v.id('cashCollections')),
    isReversal: v.boolean(),
    createdAt: v.number(),
  }).index('riderId', ['riderId'])
    .index('collectedAt', ['collectedAt'])
    .index('collectedBy', ['collectedBy']),

  cashCollectionAllocations: defineTable({
    collectionId: v.id('cashCollections'),
    orderId: v.id('orders'),
    allocatedAmount: v.number(),
  }).index('collectionId', ['collectionId'])
    .index('orderId', ['orderId']),

  bankDeposits: defineTable({
    amount: v.number(),
    bankReference: v.optional(v.string()),
    depositDate: v.number(),
    depositedBy: v.id('users'),
    riderId: v.optional(v.id('riders')),
    status: v.union(
      v.literal('pending_review'),
      v.literal('submitted'),
      v.literal('approved'),
      v.literal('rejected')
    ),
    evidenceStorageIds: v.array(v.id('_storage')),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    createdAt: v.number(),
  }).index('status', ['status'])
    .index('depositDate', ['depositDate'])
    .index('depositedBy', ['depositedBy'])
    .index('riderId', ['riderId']),

  depositAllocations: defineTable({
    depositId: v.id('bankDeposits'),
    collectionId: v.id('cashCollections'),
    allocatedAmount: v.number(),
  }).index('depositId', ['depositId'])
    .index('collectionId', ['collectionId']),

  tpeReceipts: defineTable({
    claimedAmount: v.number(),
    receiptDate: v.number(),
    uploadedBy: v.id('users'),
    terminalRef: v.optional(v.string()),
    merchantRef: v.optional(v.string()),
    status: v.union(
      v.literal('pending_review'),
      v.literal('approved'),
      v.literal('rejected')
    ),
    evidenceStorageIds: v.array(v.id('_storage')),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    createdAt: v.number(),
  }).index('status', ['status'])
    .index('receiptDate', ['receiptDate'])
    .index('uploadedBy', ['uploadedBy']),

  tpeReceiptAllocations: defineTable({
    receiptId: v.id('tpeReceipts'),
    orderId: v.id('orders'),
    allocatedAmount: v.number(),
  }).index('receiptId', ['receiptId'])
    .index('orderId', ['orderId']),

  evidenceFiles: defineTable({
    storageId: v.id('_storage'),
    mimeType: v.string(),
    originalFilename: v.string(),
    size: v.number(),
    checksum: v.string(),
    uploadedBy: v.id('users'),
    uploadedAt: v.number(),
    linkedEntityType: v.union(
      v.literal('import_batch'),
      v.literal('bank_deposit'),
      v.literal('tpe_receipt')
    ),
    linkedEntityId: v.union(v.id('importBatches'), v.id('bankDeposits'), v.id('tpeReceipts')),
    reviewState: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected')
    ),
  }).index('linkedEntity', ['linkedEntityType', 'linkedEntityId']),

  auditEvents: defineTable({
    actorId: v.id('users'),
    action: v.string(),
    targetType: v.string(),
    targetId: v.union(v.id('users'), v.id('orders'), v.id('cashCollections'), v.id('bankDeposits'), v.id('tpeReceipts'), v.id('importBatches'), v.id('riders'), v.id('liveEntryReceipts'), v.id('discrepancies')),
    timestamp: v.number(),
    reason: v.optional(v.string()),
    beforeSummary: v.optional(v.any()),
    afterSummary: v.optional(v.any()),
    correlationId: v.optional(v.string()),
  }).index('actorId', ['actorId'])
    .index('target', ['targetType', 'targetId'])
    .index('timestamp', ['timestamp']),

  importSettings: defineTable({
    allowedSenders: v.array(v.string()),
    subjectPattern: v.string(),
    gmailLabel: v.optional(v.string()),
    attachmentExtensions: v.array(v.string()),
    timezone: v.string(),
    alertRecipients: v.array(v.string()),
    maxFileSizeMB: v.number(),
    allowedMimeTypes: v.array(v.string()),
    retentionDays: v.number(),
    invalidRowPolicy: v.union(v.literal('partial_accept'), v.literal('block_report')),
    importSLAMinutes: v.number(),
    updatedAt: v.number(),
    updatedBy: v.id('users'),
    syncCursor: v.optional(v.string()),
    gmailAccessToken: v.optional(v.string()),
    gmailRefreshToken: v.optional(v.string()),
    gmailTokenExpiresAt: v.optional(v.number()),
  }),
});
