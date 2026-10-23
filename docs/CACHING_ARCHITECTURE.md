# Caching Architecture

## Overview

The wallet application uses **Redis** for caching and **BullMQ** for event-driven cache invalidation to optimize performance and reduce redundant blockchain/database queries.

## Architecture Components

### 1. Redis Cache Layer (`src/lib/cache/redis.ts`)

**Purpose**: Store frequently accessed data (transactions, balances, contacts) with automatic expiration.

**Key Functions**:
- `getCached<T>(key)` - Retrieve typed cached data
- `setCached(key, value, ttlSeconds)` - Store data with optional TTL
- `deleteCached(key)` - Remove single cache entry
- `deleteCachedPattern(pattern)` - Remove multiple entries matching pattern

**Cache Keys**:
- Transactions: `wallet:{address}:transactions:{page}:{limit}`
- Balances: `wallet:{address}:balances`
- Contacts: `user:{userId}:contacts`
- Cloud Backups: `user:{userId}:cloud-backups`
- Recovery Contacts: `user:{userId}:recovery-contacts`

**TTL Strategy**:
- Transactions: 30 seconds (semi-static data)
- Balances: 15 seconds (frequently changing)
- Contacts: 60 seconds (relatively static data)
- Cloud Backups: 60 seconds (rarely changes)
- Recovery Contacts: 60 seconds (rarely changes)

### 2. BullMQ Job Queue (`src/lib/cache/queue.ts`)

**Purpose**: Asynchronous cache invalidation when database updates occur.

**Components**:
- **Queue**: Accepts cache invalidation jobs
- **Worker**: Processes jobs to delete stale cache entries
- **QueueEvents**: Monitors job status

**Job Types**:
```typescript
interface CacheInvalidationJob {
  walletAddress: string;
  type: "transactions" | "balances" | "both";
}
```

**Worker Configuration**:
- Concurrency: 5 jobs simultaneously
- Retry: 3 attempts with exponential backoff (1s → 2s → 4s)
- Retention: Last 100 completed jobs, last 500 failed jobs

### 3. Prisma Extension (`src/lib/prisma.ts`)

**Purpose**: Automatically queue cache invalidation when transactions are created/updated.

**Implementation**:
```typescript
prisma.$extends({
  query: {
    transaction: {
      async create({ args, query }) {
        const result = await query(args);
        // Extract wallet addresses and queue invalidation
        await queueCacheInvalidation(senderAddress, "both");
        await queueCacheInvalidation(recipientAddress, "both");
        return result;
      }
    }
  }
})
```

**Triggered on**:
- `Transaction.create()` - New transaction
- `Transaction.update()` - Status change (PENDING → CONFIRMED)

## Data Flow

### Cached Read Path
```
1. Client requests /api/wallet/transactions or /api/wallet/balance
2. API checks Redis cache using cache key
3. If HIT: Return cached data (fast path)
4. If MISS: Query blockchain/database → Cache result → Return
```

### Write Path with Invalidation
```
1. Transaction created/updated in database via Prisma
2. Prisma extension extracts wallet addresses (sender + recipient)
3. Cache invalidation job queued to BullMQ
4. Worker processes job:
   - Deletes all transaction cache entries for wallet
   - Deletes balance cache entry for wallet
5. Next read will cache MISS and fetch fresh data
```

## API Endpoints

### `/api/wallet/balance` (NEW)
**Method**: POST  
**Body**:
```json
{
  "sessionToken": "...",
  "walletAddress": "0x...",
  "forceRefresh": false  // Skip cache if true
}
```

**Response**:
```json
{
  "success": true,
  "usdc": "100.50",
  "usdt": "0.00",
  "eth": "0.123456789",
  "estimatedTransfers": 15,
  "gasPerTransfer": "0.001",
  "fromCache": true  // Indicates cache hit
}
```

### `/api/wallet/transactions` (UPDATED)
**Changes**:
- Added Redis caching (30s TTL)
- `syncBlockchain` now defaults to `false` (was `true`)
- Returns `fromCache: true` on cache hits

### `/api/contacts` (UPDATED)
**Method**: GET  
**Headers**: `Authorization: Bearer {sessionToken}`  
**Query Params**: `?refresh=true` (optional - force cache bypass)

**Response**:
```json
{
  "success": true,
  "contacts": [...],
  "fromCache": true  // Indicates cache hit
}
```

**Caching**:
- **TTL**: 60 seconds (contacts are relatively static)
- **Cache Key**: `user:{userId}:contacts`
- **Invalidation**: Automatic on POST, PATCH, DELETE operations
- **Force Refresh**: Add `?refresh=true` to bypass cache

**Cache Invalidation Triggers**:
- `POST /api/contacts` - Add new contact
- `PATCH /api/contacts/[id]` - Update contact
- `DELETE /api/contacts/[id]` - Delete contact

## Hook Updates

### `useWalletBalances` (UPDATED)
**Old**: Fetched balances directly from blockchain on client side  
**New**: Calls `/api/wallet/balance` API endpoint with caching

**Signature Change**:
```typescript
// Before
useWalletBalances(address?: string)

// After
useWalletBalances(address?: string, sessionToken?: string | null)
```

**New Parameter**: `forceRefresh` in `fetchBalances(forceRefresh: boolean)`

## Configuration

### Environment Variables

Add to `.env`:
```bash
# Redis Cache (Optional - graceful degradation if not set)
REDIS_URL="redis://localhost:6379"
BULLMQ_PREFIX="wallet"  # Job queue prefix (optional)
```

### Local Development with Docker

**Start Redis**:
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

**Verify Connection**:
```bash
redis-cli ping  # Should return "PONG"
```

## Graceful Degradation

**App works WITHOUT Redis** - if `REDIS_URL` is not configured:
- Cache functions return `null` immediately
- API endpoints skip caching and fetch fresh data every time
- BullMQ queue returns `null` and logs warning
- Performance impact: slower responses, more blockchain/DB queries

**No Code Changes Required** - Redis is completely optional.

## Monitoring

### Cache Hit Rates
Check server logs for cache performance:
```
[TransactionsAPI] Cache hit for 0x123..., page 1
[BalanceAPI] Cache miss for 0x456...
[ContactsAPI] Cache hit for user abc-123
[CloudBackupAPI] Cache hit for user abc-123
[RecoveryContactsAPI] Cache miss for user def-456
```

### Queue Status
Monitor job processing:
```
[CacheWorker] Processing invalidation for 0x123..., type: both
[CacheWorker] Job completed
```

### Prisma Extension
Track automatic invalidations:
```
[Prisma Extension] Queued cache invalidation for transaction abc-123
```

### Explicit Cache Invalidation
Monitor manual invalidations on mutations:
```
[ContactsAPI] Cache invalidated for user abc-123
[CloudBackupAPI] Cache invalidated for user abc-123
[RecoveryContactsAPI] Cache invalidated for user abc-123
```

## Performance Benefits

### Without Caching
- Every page load: 2-3 blockchain RPC calls (balances) + 1 DB query (transactions)
- Response time: ~1-2 seconds
- Rate limit risk on public RPC endpoints

### With Caching
- Cache hit: <50ms response time (90-95% reduction)
- Reduced RPC calls: Only when cache expires or DB updates
- Better UX: Near-instant page loads on reload

### Event-Driven Invalidation
- No polling required to check for updates
- Cache automatically invalidated when transactions change
- Always fresh data without manual refresh

## Security Considerations

1. **No Sensitive Data in Cache**: Only public blockchain data (balances, transaction hashes)
2. **Session Validation**: API endpoints verify session before returning cached data
3. **Wallet Isolation**: Cache keys include wallet address to prevent cross-wallet leaks
4. **No Key Collisions**: Structured cache key format ensures uniqueness

## Troubleshooting

### Cache Not Working
1. Check `REDIS_URL` is set correctly
2. Verify Redis is running: `redis-cli ping`
3. Check server logs for connection errors

### Stale Data Showing
1. Verify BullMQ worker is running (check logs on startup)
2. Check Prisma extension is triggering (logs on transaction create)
3. Manually flush cache: `redis-cli FLUSHDB` (dev only)

### High Memory Usage
1. Redis TTLs ensure automatic expiration (15-30s)
2. BullMQ cleans up old jobs (100 completed, 500 failed max)
3. Monitor with: `redis-cli INFO memory`

## Future Enhancements

- [ ] Add cache warming on app startup for active wallets
- [ ] Implement Redis pub/sub for real-time updates across multiple server instances
- [ ] Add cache metrics dashboard (hit rate, size, invalidation frequency)
- [ ] Implement tiered caching (in-memory L1 + Redis L2)
- [ ] Add cache compression for large transaction lists
