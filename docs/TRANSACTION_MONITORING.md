# Transaction Monitoring System

## Overview

The transaction monitoring system ensures that all blockchain transactions are tracked and updated in real-time, regardless of whether the user keeps their browser tab open. This addresses the issue where transactions would appear as PENDING but disappear after confirmation if the user closed the tab.

## Architecture

### Components

1. **Transaction Monitor Worker** (`/src/lib/workers/transaction-monitor.ts`)
   - Server-side background worker
   - Runs independently of client connections
   - Two main functions:
     - Pending transaction polling
     - Blockchain transaction sync

2. **Prisma Extension** (`/src/lib/prisma.ts`)
   - Intercepts transaction create/update operations
   - Invalidates cache automatically
   - Sends SSE notifications to affected wallets

3. **SSE Broadcasting** (`/src/lib/sse/broadcast.ts`)
   - Manages active client connections
   - Broadcasts events to connected wallets
   - Handles both EOA and smart wallet addresses

4. **Client Hooks**
   - `useWalletEvents` - Listens for SSE updates
   - `useTransactionStatusPoller` - Client-side fallback polling
   - `useWalletTransactions` - Transaction list management

## How It Works

### Pending Transaction Flow (Sender)

```
1. User sends transaction
   └─> Transaction saved to DB as PENDING
   └─> Optimistic UI update (instant feedback)

2. User closes tab
   └─> SSE connection closes
   └─> Client-side polling stops
   └─> Monitor continues running on server

3. Monitor checks pending transactions (every 10s)
   └─> Queries blockchain for transaction receipt
   └─> Transaction confirmed on blockchain
   └─> Updates DB: PENDING → CONFIRMED
   └─> Prisma extension triggers:
       ├─> Cache invalidation
       └─> SSE broadcast to sender address

4. User reopens app
   └─> Fetches transactions from DB
   └─> Sees CONFIRMED transaction
   └─> OR receives SSE update if already connected
```

### Incoming Transaction Flow (Receiver)

```
1. External wallet sends USDC to user's wallet
   └─> Transaction submitted to blockchain
   └─> User's app has no knowledge yet

2. Monitor syncs blockchain (every 2 minutes for active wallets)
   └─> Fetches transaction history from blockchain
   └─> Detects new incoming transaction
   └─> Creates transaction record in DB
   └─> Prisma extension triggers:
       ├─> Cache invalidation
       └─> SSE broadcast to recipient address

3. User's app (if connected)
   └─> Receives SSE notification
   └─> Refreshes transaction list
   └─> Shows new incoming transaction

4. User's app (if disconnected)
   └─> Next page load fetches from DB
   └─> Shows incoming transaction
```

## Configuration

### Default Settings

```typescript
{
  pollInterval: 10000,    // Check pending txs every 10 seconds
  syncInterval: 30000,    // Sync blockchain every 30 seconds
  maxRetries: 100,        // Mark as FAILED after ~16 minutes
  batchSize: 20          // Check up to 20 transactions per iteration
}
```

### Rate Limiting

- **Blockchain Sync**: Only syncs each wallet once per minute
- **Active Users**: Limits to 10 most active users per sync cycle
- **Recent Transactions**: Only syncs last 24 hours to avoid DB bloat
- **Connection Check**: Only syncs when users have active SSE connections

## Performance Optimizations

1. **Smart Polling**
   - Only checks transactions with real txHash (not temp IDs)
   - Orders by creation time (newest first)
   - Batch size limit prevents overwhelming blockchain RPC

2. **Conditional Sync**
   - Only syncs when SSE connections are active
   - Limits to recently active users
   - Rate limits prevent duplicate syncs

3. **Cache Strategy**
   - Automatic cache invalidation via Prisma extension
   - SSE notifications prevent unnecessary polling
   - Client-side optimistic updates for instant feedback

## SSE Event Flow

```
Transaction Updated in DB
    ↓
Prisma Extension Triggered
    ↓
Identifies affected addresses:
  ├─> Sender address (EOA + smart wallet)
  └─> Recipient address (EOA + smart wallet)
    ↓
For each address:
  ├─> Invalidate cache
  └─> Send SSE notification
    ↓
Connected clients receive event:
  ├─> Update transaction status
  ├─> Refresh transaction list
  └─> Update balances
```

## Error Handling

### Transaction Failures

- Transactions older than ~16 minutes are marked as FAILED
- Client shows appropriate error message
- User can retry transaction if needed

### Sync Failures

- Individual wallet sync failures are logged but don't stop the monitor
- Next sync cycle will retry
- Blockchain API errors are caught and logged

### SSE Disconnections

- Client automatically reconnects with exponential backoff
- Max 5 reconnection attempts
- Falls back to manual refresh if SSE unavailable

## Monitoring and Logging

All monitor operations are logged with `[TxMonitor]` prefix:

```
[TxMonitor] Starting transaction monitor
[TxMonitor] Checking 5 pending transactions
[TxMonitor] ✓ Updated 0x123...: PENDING → CONFIRMED
[TxMonitor] Syncing blockchain for 3 active users
[TxMonitor] ✓ Synced 0xabc...: 2 new, 1 updated
```

## Deployment Considerations

### Server Requirements

- Node.js server running continuously
- Database connection for Prisma
- Blockchain RPC endpoint (Alchemy, Infura, etc.)
- Optional: Redis for SSE connection tracking

### Scaling

For high-traffic scenarios:

1. **Horizontal Scaling**
   - Use distributed job queue (BullMQ) instead of setInterval
   - Centralize SSE connections via Redis PubSub
   - Multiple server instances share the load

2. **Vertical Optimization**
   - Adjust polling intervals based on load
   - Implement priority queues for high-value transactions
   - Use webhooks instead of polling (Alchemy Notify)

### Production Settings

```typescript
// Recommended production config
{
  pollInterval: 15000,    // Slower polling to reduce RPC calls
  syncInterval: 60000,    // Less frequent blockchain sync
  maxRetries: 60,         // Shorter timeout (15 minutes)
  batchSize: 10          // Smaller batches for stability
}
```

## Troubleshooting

### Transactions stuck as PENDING

1. Check if monitor is running: Look for `[TxMonitor]` logs
2. Verify blockchain RPC is accessible
3. Check transaction on blockchain explorer
4. Manually sync: Call `/api/wallet/transactions?syncBlockchain=true`

### Incoming transactions not detected

1. Verify user has active session (SSE connection)
2. Check if wallet is in "recently active" list
3. Wait for next sync cycle (30 seconds)
4. Manual refresh should always work

### SSE not working

1. Check browser console for connection errors
2. Verify session token is valid
3. Check server logs for SSE connection
4. Fallback: Client-side polling still works
