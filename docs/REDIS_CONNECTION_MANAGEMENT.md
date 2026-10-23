# Redis Connection Management

## Overview

This application uses Redis for caching and BullMQ for background job processing. Proper connection management is critical to avoid exceeding Redis Cloud connection limits and ensure graceful shutdowns.

## Architecture

### Connection Strategy

1. **Singleton Pattern**: All Redis connections use a global singleton pattern via `globalThis` to prevent duplicate connections during Next.js hot-reload
2. **Build-Time Skip**: Redis connections are NOT created during `next build` to avoid unnecessary connections
3. **Shared Configuration**: BullMQ Queue and Worker instances share connection configuration to minimize connection count

### Components

```
src/lib/cache/
├── redis.ts         # Redis client singleton
├── queue.ts         # BullMQ queue and worker initialization  
├── worker.ts        # Worker startup logic
└── shutdown.ts      # Centralized graceful shutdown
```

## Configuration

### Redis Client Settings

```typescript
{
  maxRetriesPerRequest: null,        // Required for BullMQ compatibility
  lazyConnect: false,                // Connect immediately
  enableReadyCheck: true,
  retryStrategy: (times) => {
    if (times > 3) return null;      // Stop after 3 retries
    return Math.min(times * 50, 2000); // Exponential backoff
  },
  keepAlive: 30000,                  // 30s keep-alive to prevent drops
}
```

### BullMQ Connection Settings

```typescript
{
  maxRetriesPerRequest: null,        // CRITICAL for BullMQ
  enableReadyCheck: false,
  enableOfflineQueue: true,
}
```

## Connection Limits

### During Build (`npm run build`)
- **Redis connections**: 0 (skipped via `NEXT_PHASE` detection)
- **BullMQ workers**: 0 (not initialized)

### During Runtime
- **Redis client**: 1 connection
- **BullMQ Queue**: Reuses Redis connection config
- **BullMQ Worker**: Reuses Redis connection config  
- **QueueEvents**: 1 additional connection for monitoring

**Total**: ~3-4 connections max

## Graceful Shutdown

### Shutdown Order
1. Close BullMQ workers (stops processing jobs)
2. Close QueueEvents (stops event monitoring)
3. Close Queue (stops job acceptance)
4. Wait 100ms (allow cleanup)
5. Close Redis client

### Error Handling
- "Connection is closed" errors are silently ignored during shutdown
- Connection state is checked before attempting to close
- Shutdown is idempotent (safe to call multiple times)

### Signals Handled
- `SIGTERM` (production termination)
- `SIGINT` (Ctrl+C)
- `beforeExit` (process cleanup)

## Redis Server Configuration

### Recommended Settings

**Eviction Policy**: `noeviction`
```bash
CONFIG SET maxmemory-policy noeviction
```

BullMQ requires `noeviction` to prevent job data from being evicted. If you see warnings about `volatile-lru`, update your Redis configuration:

#### Redis Cloud
1. Go to your database configuration
2. Navigate to "Configuration" → "Edit"
3. Under "Advanced Options" → "Eviction Policy"
4. Select "noeviction"

#### Self-Hosted Redis
Add to `redis.conf`:
```
maxmemory-policy noeviction
```

## Troubleshooting

### "ERR max number of clients reached"

**Cause**: Too many Redis connections open simultaneously

**Solutions**:
1. Ensure `NEXT_PHASE=phase-production-build` is set during builds
2. Check for multiple worker instances (should be singleton)
3. Verify connection pooling is enabled
4. Check Redis Cloud plan limits

### "Connection is closed" Errors

**Cause**: Attempting to use closed connections during shutdown

**Solution**: Already handled automatically - these errors are suppressed during graceful shutdown

### "maxRetriesPerRequest must be null"

**Cause**: BullMQ requires `maxRetriesPerRequest: null`

**Solution**: Already configured correctly in `getRedisConnection()` helper

### Workers Not Processing Jobs

**Cause**: Worker may not be initialized

**Solutions**:
1. Check that `server-init.ts` is imported in API routes
2. Verify Redis is accessible (check `REDIS_URL` env var)
3. Check worker logs for initialization errors

## Development Tips

### Checking Active Connections

```typescript
import { getRedisClient } from '@/lib/cache/redis';

const redis = getRedisClient();
if (redis) {
  console.log('Redis status:', redis.status);
  // 'ready', 'connect', 'reconnecting', 'close', 'end'
}
```

### Manual Shutdown

```typescript
import { gracefulShutdown } from '@/lib/cache/shutdown';

await gracefulShutdown();
```

### Testing Without Redis

The app gracefully handles missing Redis:
- Caching falls back to in-memory or skips
- Rate limiting uses in-memory store
- BullMQ jobs are logged but not queued

Simply comment out `REDIS_URL` in `.env` to test.

## Performance Monitoring

### BullMQ Dashboard (Optional)

Install BullBoard for job monitoring:
```bash
npm install @bull-board/api @bull-board/next
```

### Redis Monitoring

Check connection count:
```bash
redis-cli CLIENT LIST | wc -l
```

Check memory usage:
```bash
redis-cli INFO memory
```

## See Also

- [CACHING_ARCHITECTURE.md](./CACHING_ARCHITECTURE.md) - Cache invalidation strategy
- [REDIS_SETUP.md](../REDIS_SETUP.md) - Initial Redis setup guide
 Guide

## Overview

This project uses Redis for caching and BullMQ for background job processing. Due to the nature of Next.js hot-reload in development and BullMQ's architecture, multiple connections can accumulate.

## Connection Architecture

### Components Using Redis

1. **Redis Client** (`src/lib/cache/redis.ts`)
   - Single shared connection for caching operations
   - Used by API routes for balance/transaction caching

2. **BullMQ Queue** (`src/lib/cache/queue.ts`)
   - Creates connections for queue management
   - One queue instance per application

3. **BullMQ Worker** (`src/lib/cache/queue.ts`)
   - Creates connections for processing jobs
   - Concurrency set to 2 (reduced from 5 to limit connections)

### Expected Connection Count

In production:
- **Minimum**: 3-4 connections (1 client + 1 queue + 1-2 workers)
- **Maximum**: 6-8 connections (with worker concurrency)

In development (with hot-reload):
- Can temporarily spike to 20-30 connections
- Orphaned connections from previous builds will timeout after ~60s

## Maintenance Scripts

### Check Redis Status

```bash
npm run redis:check
```

Shows:
- Current connection count
- Database keys
- Memory usage
- Server info

### Flush Redis (Clean Up)

```bash
npm run redis:flush
```

**WARNING**: This will:
1. Delete ALL keys in the database
2. Kill all client connections (except the script)

Use this when:
- Connection count is too high (>30)
- You're getting "max clients reached" errors
- Switching between development and production

## Optimization Applied

### 1. BullMQ Configuration

**Before**:
```typescript
maxRetriesPerRequest: 3  // Creates retry queue connections
concurrency: 5           // 5 worker connections
```

**After**:
```typescript
maxRetriesPerRequest: null  // BullMQ requirement, no retry queue
concurrency: 2              // Reduced worker connections
enableOfflineQueue: false   // Don't queue commands when disconnected
```

### 2. Redis Client Configuration

**Added**:
```typescript
maxRetriesPerRequest: null  // Required for BullMQ compatibility
enableOfflineQueue: false   // Fail fast instead of queuing
keepAlive: 30000           // Keep connections alive
connectTimeout: 10000      // Timeout stale connections
```

### 3. Removed QueueEvents

QueueEvents creates additional connections for monitoring. Since we have worker event handlers, we removed QueueEvents to reduce connection count by ~3-4.

## Troubleshooting

### "ERR max number of clients reached"

**Cause**: Too many connections to Redis Cloud free tier (limit: 30)

**Solutions**:

1. **Flush Redis** (immediate):
   ```bash
   npm run redis:flush
   ```

2. **Kill orphaned build processes**:
   ```bash
   pkill -f "next build"
   pkill -f "next dev"
   ```

3. **Wait 60 seconds**: Idle connections will timeout naturally

4. **Upgrade Redis plan**: Increase connection limit on Redis Cloud

### Connections Not Dropping

**During Build**: Next.js creates multiple worker processes, each initializing Redis. This is normal and temporary.

**After Build**: If connections persist:
1. Check for background processes: `ps aux | grep next`
2. Restart the development server
3. Run `npm run redis:flush`

### Hot-Reload Connection Leak

**Development only**: Each hot-reload can create new connections. We use `globalThis` pattern to reuse connections, but occasionally orphans remain.

**Solution**: Restart the dev server periodically:
```bash
# Kill dev server (Ctrl+C)
npm run redis:flush
npm run dev
```

## Redis Cloud Configuration

### Recommended Settings

1. **Eviction Policy**: `noeviction` (prevents data loss)
   - Current: `volatile-lru` (will evict keys with TTL)
   - Change in Redis Cloud dashboard → Database → Configuration

2. **Max Connections**: 
   - Free tier: 30 connections
   - Consider upgrading if hitting limits frequently

3. **Connection Timeout**: 
   - Default: 300s
   - Recommended: 60s (faster cleanup of idle connections)

## Best Practices

### Development

1. **Restart regularly**: If running dev server for hours, restart to clear connections
2. **Monitor connections**: Run `npm run redis:check` before builds
3. **Clean before deploy**: Run `npm run redis:flush` before production deployments

### Production

1. **Single instance**: Ensure only one production instance runs per Redis DB
2. **Monitor metrics**: Use Redis Cloud dashboard to track connection count
3. **Graceful shutdown**: Properly close connections on deployment:
   ```typescript
   // In Next.js middleware or shutdown handler
   await closeCacheQueue();
   ```

### CI/CD

Add cleanup step before builds:
```yaml
- name: Clean Redis
  run: npm run redis:flush || true  # Don't fail if Redis unavailable
  
- name: Build
  run: npm run build
```

## Connection Lifecycle

```
Application Start
    ↓
Redis Client Created (globalThis cache)
    ↓
BullMQ Queue Created (globalThis cache)
    ↓
BullMQ Worker Created (globalThis cache)
    ↓
[Application Running]
    ↓
Hot-Reload Triggered (dev only)
    ↓
New Connections Attempted
    ↓
globalThis Check → Reuse Existing
    ↓
[Some Orphans May Remain]
    ↓
Timeout After 60s
```

## Monitoring

### Redis Cloud Dashboard

1. Navigate to console.redis.com
2. Select your database
3. View "Metrics" tab:
   - Connected Clients (should be <10 in production)
   - Operations/sec
   - Memory usage
   - Hit rate

### Application Logs

Look for:
- `[Redis] Connected` - New client created
- `[BullMQ] Cache invalidation queue initialized`
- `[BullMQ] Cache invalidation worker initialized`
- `[CacheWorker] Job completed` - Jobs processing

### Warning Signs

- Connection count >20 in production
- "max clients reached" errors
- Slow cache operations
- Failed background jobs

## Future Improvements

1. **Connection Pooling**: Implement IORedis cluster mode for better connection management
2. **Separate Databases**: Use different Redis DBs for cache vs. queues
3. **Health Checks**: Add `/api/health` endpoint that reports connection count
4. **Auto-Cleanup**: Cron job to flush stale connections periodically
5. **Redis Sentinel**: High-availability setup with automatic failover
