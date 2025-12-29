# Phase 2 Quick Start Guide

## What We Just Built

✅ **Network Baseline Measurement System**

- Client-side benchmarking tool that measures network latency to your Cloudflare Worker
- Server endpoints for RTT, GET, POST, and payload testing
- Integration with existing benchmark UI

## Files Created/Modified

### New Files

1. `client/benchmarks/network.ts` - Network benchmark class (205 lines)
2. `cloudflare/DEPLOY.md` - Deployment instructions
3. `cloudflare/PHASE2_SUMMARY.md` - Detailed implementation summary

### Modified Files

1. `client/benchmarks/runner.ts` - Added `benchmarkNetwork()` method
2. `client/benchmark.html` - Added "Run Network Baseline Only" button
3. `cloudflare/worker/src/index-kuzu.ts` - Added Phase 2 endpoints:
   - `GET /ping` - RTT measurement
   - `POST /echo` - Payload echo test
   - `GET /org/{orgId}/csv` - CSV data serving
4. `cloudflare/worker/src/index.ts` - Added `handleGetCSV()` function

## Next Steps

### 1. Deploy the Worker (5 minutes)

```bash
cd cloudflare/worker

# Install dependencies (if not already done)
npm install

# Login to Cloudflare
wrangler login

# Deploy
wrangler deploy
```

**Save your worker URL!** It will look like:

```
https://kuzu-auth-dev-worker.YOUR_SUBDOMAIN.workers.dev
```

### 2. Test the Endpoints (2 minutes)

Replace `YOUR_WORKER_URL` with your actual URL:

```bash
# Test ping
curl https://YOUR_WORKER_URL/ping

# Test echo
curl -X POST https://YOUR_WORKER_URL/echo \
  -H "Content-Type: application/json" \
  -d '{"test": "hello"}'

# Test health
curl https://YOUR_WORKER_URL/health
```

Expected responses:

- Ping: `{"pong":1234567890123}`
- Echo: `{"echo":{"test":"hello"},"timestamp":1234567890123}`
- Health: `{"status":"healthy","environment":"dev"}`

### 3. Run Network Benchmark (3 minutes)

1. **Update the benchmark UI** with your worker URL:

   Edit `client/benchmark.html` around line 252:

   ```html
   <input type="text" id="serverUrl" value="https://YOUR_WORKER_URL" />
   ```

2. **Serve the client** (if not already running):

   ```bash
   cd client
   python3 -m http.server 8080
   ```

3. **Open in browser**: http://localhost:8080/benchmark.html

4. **Click "Run Network Baseline Only"**

5. **Review the results**:
   - RTT: Round-trip time
   - Empty GET: Latency of simple GET request
   - Empty POST: Latency of POST with no payload
   - POST 1KB: Latency with typical mutation payload

### 4. Interpret Results

**Good Performance (Same Region)**:

- RTT: 10-30ms
- GET: 10-30ms
- POST: 15-40ms
- POST 1KB: 20-50ms

**Acceptable (Cross-Region)**:

- RTT: 50-100ms
- GET: 50-100ms
- POST: 60-120ms
- POST 1KB: 70-150ms

**Needs Investigation (>150ms)**:

- Check your region vs worker region
- Verify no VPN/proxy interference
- Consider Cloudflare Workers in multiple regions

## What's Next After Baseline?

### Phase 2A: CSV Data Serving (Current)

- Upload test CSV data to R2 bucket
- Test `/org/{orgId}/csv` endpoint
- Integrate client to load from worker instead of local files

### Phase 2B: Mutation Endpoints

- Implement `POST /org/{orgId}/grant`
- Implement `DELETE /org/{orgId}/revoke`
- Add R2 write-through logic
- Measure mutation roundtrip (target: <100ms p95)

### Phase 2C: WebSocket Real-time Sync

- Add WebSocket handler
- Implement mutation broadcasting
- Multi-client state propagation
- Measure propagation delay (target: <200ms p95)

## Troubleshooting

### "Cannot find module" errors in TypeScript

- Run `npm install` in `cloudflare/worker`
- Check `tsconfig.json` is present

### CORS errors in browser

- Verify endpoints return CORS headers
- Check browser console for specific error
- All Phase 2 endpoints include CORS by default

### Worker deployment fails

- Verify you're logged in: `wrangler whoami`
- Check R2 bucket exists: `wrangler r2 bucket list`
- Review wrangler.toml configuration

### Benchmark shows very high latency (>500ms)

- Check your internet connection
- Verify worker URL is correct
- Try with VPN disabled
- Check browser DevTools Network tab

### Network benchmark button doesn't appear

- Hard refresh browser (Cmd+Shift+R or Ctrl+Shift+R)
- Check browser console for JavaScript errors
- Verify `network.ts` is being loaded

## Support

Check these files for more details:

- `cloudflare/DEPLOY.md` - Full deployment instructions
- `cloudflare/PHASE2_SUMMARY.md` - Implementation details
- `cloudflare/ARCHITECTURE.md` - Overall architecture plan

## Success Criteria

Phase 2 baseline is complete when:

- ✅ Worker deployed and accessible
- ✅ All endpoints responding correctly
- ✅ Network benchmark runs successfully
- ✅ Baseline metrics documented

You'll know it's working when you click "Run Network Baseline Only" and see results like:

```
🌐 Network Baseline
Round Trip Time (RTT):        25.3ms (p95: 32.1ms)
Empty GET Request:            27.8ms (p95: 35.4ms)
Empty POST Request:           31.2ms (p95: 39.8ms)
POST with 1KB Payload:        35.6ms (p95: 44.2ms)
```

🎉 Once you see these numbers, Phase 2A is complete and we can move to CSV serving and mutations!
