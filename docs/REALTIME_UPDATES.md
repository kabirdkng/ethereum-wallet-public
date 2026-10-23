# Real-Time Updates Implementation

## Overview

Implemented **Server-Sent Events (SSE)** for real-time wallet updates. Both sender and receiver get instant notifications when transactions are created or status changes.

## Architecture

### 1. SSE Endpoint (`/api/wallet/events`)

**Features:**
- Maintains persistent connection to clients
- Sends real-time events when transactions update
- Keep-alive pings every 30 seconds
- Automatic reconnection with exponential backoff
- Per-wallet connection management

**Connection Flow:**
```
Client → GET /api/wallet/events?sessionToken=xxx
Server → Validates session → Opens SSE stream
Server → Stores connection in Map<walletAddress, controller>
```

### 2. Prisma Extension Updates

**Automatic Event Triggers:**
When a transaction is created or updated:
1. Cache invalidation queued to BullMQ
2. SSE event sent to affected wallets (sender AND receiver)
3. Both parties get instant UI updates

**Code Location:** `src/lib/prisma.ts`

### 3. React Hook (`useWalletEvents`)

**Usage:**
```typescript
useWalletEvents({
  sessionToken,
  enabled: true,
  onTransactionUpdate: () => refreshTransactions(),
  onBalanceUpdate: () => refreshBalances(),
});
```

**Features:**
- Automatic connection management
- Exponential backoff reconnection
- Event-based callbacks
- Cleanup on unmount

### 4. Wallet Dashboard Integration

**Replaced:** Polling system (10-second intervals)  
**With:** Server-Sent Events (instant updates)

**Benefits:**
- ⚡ Instant updates (no 10-second delay)
- 📉 Reduced server load (no repeated API calls)
- 🔋 More efficient (single persistent connection)
- 🎯 Both sender and receiver updated simultaneously

## Event Flow

### New Transaction Created
```
1. User sends USDC → POST /api/wallet/send
2. Transaction created in DB
3. Prisma Extension triggers:
   a. Cache invalidation queued
   b. SSE event sent to sender wallet
   c. SSE event sent to receiver wallet
4. Both UIs instantly refresh (< 100ms)
```

### Transaction Status Change
```
1. check-pending API detects confirmation
2. Transaction updated to CONFIRMED
3. Prisma Extension triggers:
   a. Cache invalidation queued
   b. SSE event sent to both wallets
4. Both UIs show "Confirmed" status
```

## Event Types

| Event Type | Trigger | Data |
|------------|---------|------|
| `connected` | Client connects | timestamp |
| `ping` | Keep-alive (30s) | timestamp |
| `transaction_update` | Transaction created/updated | { transactionId, status } |
| `balance_update` | Balance changed | - |

## Configuration

### Server
- Connection timeout: 30s keep-alive pings
- Auto-cleanup on client disconnect
- Per-wallet connection isolation

### Client
- Reconnection: Exponential backoff (1s → 2s → 4s → ... → 30s max)
- Max reconnect attempts: Unlimited (while enabled)
- Auto-cleanup: On unmount or logout

## Testing

### Scenario 1: Send Money
1. User A sends USDC to User B
2. **User A sees:** Transaction appears instantly with "Pending" status
3. **User B sees:** Incoming transaction appears instantly
4. After blockchain confirmation:
   - **User A sees:** Status changes to "Confirmed"
   - **User B sees:** Status changes to "Confirmed"

### Scenario 2: Multiple Tabs
1. Open wallet in Tab 1 and Tab 2
2. Send transaction in Tab 1
3. **Tab 2:** Instantly shows new transaction (no refresh needed)

### Scenario 3: Offline/Online
1. Close laptop (connection drops)
2. Reopen laptop
3. SSE automatically reconnects
4. UI updates with latest data

## Monitoring

### Server Logs
```
[SSE] Client connected for wallet 0x123...
[Prisma Extension] Queued cache invalidation for transaction abc-123
[SSE] Sent transaction_update to 0x123...
[SSE] Client disconnected for wallet 0x123...
```

### Client Logs
```
[SSE] Connecting to wallet events...
[SSE] Connected to wallet events
[SSE] Transaction update received: { transactionId: "abc-123", status: "CONFIRMED" }
Real-time update received - refreshing transactions and balances
```

## Advantages Over Polling

| Aspect | Polling (Old) | SSE (New) |
|--------|---------------|-----------|
| Latency | 0-10 seconds | < 100ms |
| Server Load | High (constant requests) | Low (1 connection) |
| Network Usage | High (repeated requests) | Low (single stream) |
| Real-time | No | Yes |
| Battery Impact | High | Low |
| Scalability | Poor | Good |

## Browser Compatibility

✅ Chrome, Edge, Safari, Firefox  
✅ Mobile browsers (iOS Safari, Chrome Mobile)  
❌ IE11 (not supported by Next.js anyway)

## Production Considerations

1. **Load Balancer:** Configure sticky sessions or use Redis pub/sub for multi-server
2. **Nginx:** Add `proxy_buffering off;` for SSE
3. **Timeout:** Adjust keep-alive to match infrastructure limits
4. **Monitoring:** Track active connections with metrics

## Future Enhancements

- [ ] Redis pub/sub for horizontal scaling
- [ ] WebSocket fallback for better bi-directional communication
- [ ] Event compression for large payloads
- [ ] Rate limiting per wallet
- [ ] Admin dashboard for monitoring connections
