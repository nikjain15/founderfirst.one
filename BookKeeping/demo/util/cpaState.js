/**
 * util/cpaState.js — Pure state transformers for state.cpa.
 *
 * Every mutation the UI can perform on CPA state goes through one of these
 * functions. They are pure — they take the current state.cpa and return a
 * new state.cpa. No side effects, no fetch calls, no localStorage writes.
 *
 * Weights for computeTaxReadiness are tunable:
 *   uncategorized × 3, missingReceipts × 2, flagged × 4.
 *
 * Schema source of truth: implementation/cpa-data-model.md
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function randomToken() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let t = "";
  for (let i = 0; i < 32; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

const SEVEN_DAYS_MS  = 7  * 24 * 60 * 60 * 1000;
const UNCATEGORIZED_WEIGHT   = 3;
const MISSING_RECEIPT_WEIGHT = 2;
const FLAGGED_WEIGHT         = 4;

// ── Tax readiness ─────────────────────────────────────────────────────────────

/**
 * computeTaxReadiness(clientData) → { score, uncategorized, missingReceipts, flagged, lastComputedAt }
 *
 * Bands: 90–100 clean (monochrome), 70–89 amber, 0–69 error.
 */
export function computeTaxReadiness(clientData) {
  const flagged        = Object.keys(clientData.flags        || {}).filter((id) => !clientData.flags[id].resolvedAt).length;
  const pendingAdds    = (clientData.pendingAdds  || []).filter((p) => !p.acknowledgedAt && !p.rejectedAt).length;
  // uncategorized and missingReceipts are derived from pendingAdds for the demo;
  // in production these come from the ledger service.
  const uncategorized  = pendingAdds;
  const missingReceipts = (clientData.pendingAdds || []).filter((p) => !p.receiptUrl && !p.acknowledgedAt).length;

  const raw = 100
    - UNCATEGORIZED_WEIGHT   * uncategorized
    - MISSING_RECEIPT_WEIGHT * missingReceipts
    - FLAGGED_WEIGHT         * flagged;

  return {
    score:           Math.max(0, Math.min(100, raw)),
    uncategorized,
    missingReceipts,
    flagged,
    lastComputedAt:  Date.now(),
  };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * generateInvite(cpa, clientId, cpaEmail, cpaName?) → { newCpa, token, expiresAt }
 *
 * Pushes a new invite record with status "pending". Returns the updated
 * state.cpa and the invite token so the founder can copy the link.
 */
export function generateInvite(cpa, clientId, cpaEmail, cpaName = null) {
  const now      = Date.now();
  const token    = randomToken();
  const invite   = {
    id:         uid(),
    token,
    clientId,
    cpaEmail,
    cpaName,
    createdAt:  now,
    expiresAt:  now + SEVEN_DAYS_MS,
    consumedAt: null,
    status:     "pending",
  };
  return {
    newCpa:    { ...cpa, invites: [...(cpa.invites || []), invite] },
    token,
    expiresAt: invite.expiresAt,
  };
}

/**
 * revokeInvite(cpa, inviteId) → newCpa
 *
 * Sets invite status to "revoked". The link stops working on the next request.
 */
export function revokeInvite(cpa, inviteId) {
  return {
    ...cpa,
    invites: (cpa.invites || []).map((inv) =>
      inv.id === inviteId ? { ...inv, status: "revoked" } : inv
    ),
  };
}

/**
 * acceptInvite(cpa, token, cpaAccountFields) → { newCpa, error }
 *
 * Validates the token, creates the CPA account, promotes the invite to
 * "accepted", and creates the clients[clientId] record with current-year grant.
 */
export function acceptInvite(cpa, token, { name, email, password: _pw, licenseNumber, licenseState }) {
  const now    = Date.now();
  const invite = (cpa.invites || []).find((inv) => inv.token === token);

  if (!invite)                          return { newCpa: cpa, error: "Invite not found." };
  if (invite.status === "revoked")      return { newCpa: cpa, error: "This invite has been revoked. Ask your client to resend." };
  if (invite.status === "expired" || now > invite.expiresAt)
                                        return { newCpa: cpa, error: "This invite has expired. Ask your client to resend." };
  if (invite.status === "accepted")     return { newCpa: cpa, error: "This invite has already been used." };

  const account = {
    id:            uid(),
    name,
    email,
    licenseNumber,
    licenseState,
    verifiedAt:    now,
  };

  const clientEntry = {
    clientName:   invite.cpaName || name,
    entity:       "sole-prop",  // will be overwritten when hydrated from scenario
    industry:     "consulting",
    grantedAt:    now,
    yearGrants:   [new Date().getFullYear()],
    yearRequests: [],
    learnedRules: [],
    flags:        {},
    annotations:  {},
    pendingAdds:  [],
    chatHistory:  [],
    taxReadiness: { score: 100, uncategorized: 0, missingReceipts: 0, flagged: 0, lastComputedAt: now },
  };

  const updatedInvites = (cpa.invites || []).map((inv) =>
    inv.id === invite.id ? { ...inv, status: "accepted", consumedAt: now } : inv
  );

  return {
    newCpa: {
      ...cpa,
      account,
      invites: updatedInvites,
      clients: { ...(cpa.clients || {}), [invite.clientId]: clientEntry },
    },
    error: null,
  };
}

/**
 * requestPriorYearAccess(cpa, clientId, year, note) → { newCpa, approvalId }
 */
export function requestPriorYearAccess(cpa, clientId, year, note = "") {
  const now        = Date.now();
  const approvalId = uid();
  const client     = cpa.clients?.[clientId];
  if (!client) return { newCpa: cpa, approvalId: null };

  const request = { year, requestedAt: now, note, status: "pending" };
  const approval = {
    id:            approvalId,
    type:          "year-access-request",
    clientId,
    transactionId: null,
    suggestedBy:   cpa.account?.id || "cpa",
    fromCategory:  null,
    toCategory:    null,
    candidates:    null,
    note,
    status:        "pending",
    createdAt:     now,
    resolvedAt:    null,
    founderNote:   null,
  };

  return {
    newCpa: {
      ...cpa,
      clients: {
        ...cpa.clients,
        [clientId]: {
          ...client,
          yearRequests: [...(client.yearRequests || []), request],
        },
      },
      approvals: { ...(cpa.approvals || {}), [approvalId]: approval },
    },
    approvalId,
  };
}

/**
 * grantYearAccess(cpa, clientId, year) → newCpa
 */
export function grantYearAccess(cpa, clientId, year) {
  const client = cpa.clients?.[clientId];
  if (!client) return cpa;

  const now         = Date.now();
  const yearGrants  = [...new Set([...(client.yearGrants || []), year])];
  const yearRequests = (client.yearRequests || []).map((r) =>
    r.year === year && r.status === "pending" ? { ...r, status: "approved" } : r
  );

  // Resolve matching approval
  const approvals = Object.fromEntries(
    Object.entries(cpa.approvals || {}).map(([id, a]) => [
      id,
      a.type === "year-access-request" && a.clientId === clientId
        && a.status === "pending" && (a.note?.includes(String(year)) || true)
        ? { ...a, status: "approved", resolvedAt: now }
        : a,
    ])
  );

  return {
    ...cpa,
    clients: {
      ...cpa.clients,
      [clientId]: { ...client, yearGrants, yearRequests },
    },
    approvals,
  };
}

/**
 * flagTransaction(cpa, clientId, txnId, reason, note) → newCpa
 */
export function flagTransaction(cpa, clientId, txnId, reason, note = "") {
  const client = cpa.clients?.[clientId];
  if (!client) return cpa;

  const flag = {
    reason,
    note,
    flaggedBy:  cpa.account?.id || "cpa",
    flaggedAt:  Date.now(),
    resolvedAt: null,
  };

  const updatedClient = {
    ...client,
    flags: { ...(client.flags || {}), [txnId]: flag },
  };

  return {
    ...cpa,
    clients: {
      ...cpa.clients,
      [clientId]: { ...updatedClient, taxReadiness: computeTaxReadiness(updatedClient) },
    },
  };
}

/**
 * annotateTransaction(cpa, clientId, txnId, text, authorId, authorRole) → newCpa
 */
export function annotateTransaction(cpa, clientId, txnId, text, authorId = null, authorRole = "cpa") {
  const client = cpa.clients?.[clientId];
  if (!client) return cpa;

  const annotation = {
    id:         uid(),
    text,
    authorId:   authorId || cpa.account?.id || "cpa",
    authorRole,
    createdAt:  Date.now(),
  };

  const existing = client.annotations?.[txnId] || [];

  return {
    ...cpa,
    clients: {
      ...cpa.clients,
      [clientId]: {
        ...client,
        annotations: { ...(client.annotations || {}), [txnId]: [...existing, annotation] },
      },
    },
  };
}

/**
 * suggestReclassification(cpa, clientId, txnId, fromCategory, toCategory, note) → { newCpa, approvalId }
 *
 * Creates an approval of type "reclassification". Renders as a cpa-suggestion
 * card in the founder's Needs a look.
 */
export function suggestReclassification(cpa, clientId, txnId, fromCategory, toCategory, note = "") {
  const now        = Date.now();
  const approvalId = uid();

  const approval = {
    id:            approvalId,
    type:          "reclassification",
    clientId,
    transactionId: txnId,
    suggestedBy:   cpa.account?.id || "cpa",
    fromCategory,
    toCategory,
    candidates:    null,
    note,
    status:        "pending",
    createdAt:     now,
    resolvedAt:    null,
    founderNote:   null,
  };

  return {
    newCpa: {
      ...cpa,
      approvals: { ...(cpa.approvals || {}), [approvalId]: approval },
    },
    approvalId,
  };
}

/**
 * addTransactionAsCpa(cpa, clientId, txnFields, receiptUrl?) → { newCpa, approvalId }
 *
 * Appends to pendingAdds[]. Creates an approval of type "cpa-added-txn".
 * Founder is notified per notifyCpaActivity (handled in the UI layer).
 */
export function addTransactionAsCpa(cpa, clientId, txnFields, receiptUrl = null) {
  const now        = Date.now();
  const txnId      = uid();
  const approvalId = uid();
  const client     = cpa.clients?.[clientId];
  if (!client) return { newCpa: cpa, approvalId: null };

  const pendingAdd = {
    id:             txnId,
    date:           txnFields.date,
    vendor:         txnFields.vendor,
    amount:         txnFields.amount,
    category:       txnFields.category,
    receiptUrl:     receiptUrl,
    addedBy:        cpa.account?.id || "cpa",
    addedAt:        now,
    acknowledgedAt: null,
    rejectedAt:     null,
    rejectionNote:  null,
  };

  const approval = {
    id:            approvalId,
    type:          "cpa-added-txn",
    clientId,
    transactionId: txnId,
    suggestedBy:   cpa.account?.id || "cpa",
    fromCategory:  null,
    toCategory:    txnFields.category,
    candidates:    null,
    note:          txnFields.note || "",
    status:        "pending",
    createdAt:     now,
    resolvedAt:    null,
    founderNote:   null,
  };

  const updatedClient = {
    ...client,
    pendingAdds: [...(client.pendingAdds || []), pendingAdd],
  };

  return {
    newCpa: {
      ...cpa,
      clients: {
        ...cpa.clients,
        [clientId]: { ...updatedClient, taxReadiness: computeTaxReadiness(updatedClient) },
      },
      approvals: { ...(cpa.approvals || {}), [approvalId]: approval },
    },
    approvalId,
  };
}

/**
 * approveApproval(cpa, id, cpaName?) → newCpa
 *
 * Resolves the approval as "approved". Side effects per type:
 *   reclassification  → writes learnedRules entry
 *   year-access-request → grants the year
 *   cpa-added-txn     → marks pendingAdd as acknowledged
 *   penny-question    → writes learnedRules entry from CPA's answer
 */
export function approveApproval(cpa, id, cpaName = null) {
  const now      = Date.now();
  const approval = cpa.approvals?.[id];
  if (!approval || approval.status !== "pending") return cpa;

  let newCpa = {
    ...cpa,
    approvals: {
      ...(cpa.approvals || {}),
      [id]: { ...approval, status: "approved", resolvedAt: now },
    },
  };

  const { clientId } = approval;
  const client = newCpa.clients?.[clientId];

  if (approval.type === "reclassification" || approval.type === "penny-question") {
    if (client) {
      const rule = {
        id:           uid(),
        pattern:      approval.transactionId || approval.fromCategory || "*",
        fromCategory: approval.fromCategory  || "",
        toCategory:   approval.toCategory    || "",
        suggestedBy:  "cpa",
        approvedBy:   "founder",
        approvedAt:   now,
        active:       true,
      };
      newCpa = {
        ...newCpa,
        clients: {
          ...newCpa.clients,
          [clientId]: {
            ...client,
            learnedRules: [...(client.learnedRules || []), rule],
          },
        },
      };
    }
  }

  if (approval.type === "year-access-request" && client) {
    // Extract year from yearRequests
    const yearReq = (client.yearRequests || []).find(
      (r) => r.status === "pending" && String(r.note || "").includes(String(approval.note || ""))
    );
    const year = yearReq?.year;
    if (year) {
      newCpa = grantYearAccess(newCpa, clientId, year);
    }
  }

  if (approval.type === "cpa-added-txn" && client) {
    newCpa = {
      ...newCpa,
      clients: {
        ...newCpa.clients,
        [clientId]: {
          ...client,
          pendingAdds: (client.pendingAdds || []).map((p) =>
            p.id === approval.transactionId ? { ...p, acknowledgedAt: now } : p
          ),
        },
      },
    };
  }

  return newCpa;
}

/**
 * rejectApproval(cpa, id, founderNote?) → newCpa
 *
 * Resolves the approval as "rejected". Original state preserved.
 * CPA sees the item in their Resolved queue with the optional note.
 */
export function rejectApproval(cpa, id, founderNote = null) {
  const approval = cpa.approvals?.[id];
  if (!approval || approval.status !== "pending") return cpa;

  return {
    ...cpa,
    approvals: {
      ...(cpa.approvals || {}),
      [id]: { ...approval, status: "rejected", resolvedAt: Date.now(), founderNote },
    },
  };
}

/**
 * deleteLearnedRule(cpa, clientId, ruleId) → newCpa
 *
 * Sets active: false on the rule. Row stays in the array for audit.
 * Penny does not moralize — rule-deletion is metadata, not a ledger edit.
 */
export function deleteLearnedRule(cpa, clientId, ruleId) {
  const client = cpa.clients?.[clientId];
  if (!client) return cpa;

  return {
    ...cpa,
    clients: {
      ...cpa.clients,
      [clientId]: {
        ...client,
        learnedRules: (client.learnedRules || []).map((r) =>
          r.id === ruleId ? { ...r, active: false } : r
        ),
      },
    },
  };
}

/**
 * revokeCpaAccess(cpa, cpaId, clientId) → newCpa
 *
 * Moves clients[clientId] metadata into archives[cpaId].
 * Deletes chatHistory (not archived — per decision OQ-5).
 * Outstanding approvals from this CPA → rejected-by-revocation.
 */
export function revokeCpaAccess(cpa, cpaId, clientId) {
  const now    = Date.now();
  const client = cpa.clients?.[clientId];
  if (!client) return cpa;

  // Archive everything EXCEPT chatHistory
  const archive = {
    cpaName:     cpa.account?.name || cpaId,
    revokedAt:   now,
    rules:       client.learnedRules || [],
    flags:       client.flags        || {},
    annotations: client.annotations  || {},
    pendingAdds: client.pendingAdds  || [],
  };

  // Reject outstanding approvals from this CPA
  const updatedApprovals = Object.fromEntries(
    Object.entries(cpa.approvals || {}).map(([id, a]) => [
      id,
      a.clientId === clientId && a.status === "pending"
        ? { ...a, status: "rejected", resolvedAt: now, founderNote: "Revoked by founder." }
        : a,
    ])
  );

  const updatedClients = { ...(cpa.clients || {}) };
  delete updatedClients[clientId];

  return {
    ...cpa,
    clients:   updatedClients,
    approvals: updatedApprovals,
    archives:  { ...(cpa.archives || {}), [cpaId]: archive },
  };
}
