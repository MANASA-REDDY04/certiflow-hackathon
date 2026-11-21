import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const port = parseInt(process.env.PORT || process.env.MOCK_WHATSAPP_PORT || '4001', 10);
const host = process.env.HOST || '0.0.0.0';

export interface WhatsAppMessage {
  id: string;
  to: string;
  message: string;
  pdfUrl?: string;
  certNumber?: string;
  idempotencyKey?: string;
  status: 'delivered' | 'read' | 'failed';
  timestamp: string;
}

// Configurable Simulation Parameters
export const mockConfig = {
  latencyMs: 0,
  failureRate: 0, // 0 - 100%
  timeoutRate: 0, // 0 - 100%
  deliveredButTimedOutMode: false,
  isOutageActive: false,
};

const sentMessages: WhatsAppMessage[] = [];
const idempotencyMap = new Map<string, WhatsAppMessage>();

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss Z' },
          }
        : undefined,
  },
});

await app.register(cors, { origin: true });

// Health Check
app.get('/health', async () => {
  return {
    status: mockConfig.isOutageActive ? 'degraded' : 'ok',
    service: 'mock-whatsapp',
    messagesCount: sentMessages.length,
    config: mockConfig,
  };
});

// Simulation Configuration Endpoints
app.get('/api/config', async () => {
  return { config: mockConfig };
});

app.post('/api/config', async (request, reply) => {
  const body = (request.body as any) || {};
  if (typeof body.latencyMs === 'number') mockConfig.latencyMs = body.latencyMs;
  if (typeof body.failureRate === 'number') mockConfig.failureRate = body.failureRate;
  if (typeof body.timeoutRate === 'number') mockConfig.timeoutRate = body.timeoutRate;
  if (typeof body.deliveredButTimedOutMode === 'boolean') {
    mockConfig.deliveredButTimedOutMode = body.deliveredButTimedOutMode;
  }
  if (typeof body.isOutageActive === 'boolean') {
    mockConfig.isOutageActive = body.isOutageActive;
  }

  return reply.send({ success: true, config: mockConfig });
});

// Retrieve Messages
app.get('/api/messages', async () => {
  return {
    total: sentMessages.length,
    messages: [...sentMessages].reverse(),
  };
});

// Clear Messages & Reset
app.delete('/api/messages', async () => {
  sentMessages.length = 0;
  idempotencyMap.clear();
  return { cleared: true };
});

// Send WhatsApp Message (Idempotent with Failures / Timeouts / Latency Simulation)
app.post('/api/messages/send', async (request, reply) => {
  const body = (request.body as any) || {};
  const idempotencyKey =
    (request.headers['idempotency-key'] as string) ||
    (request.headers['x-idempotency-key'] as string) ||
    body.idempotencyKey;

  // 1. Outage Toggle Check
  if (mockConfig.isOutageActive) {
    return reply.status(503).send({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'WhatsApp Provider Outage in effect. Request failed.',
    });
  }

  // 2. Configurable Latency
  if (mockConfig.latencyMs > 0) {
    await new Promise((res) => setTimeout(res, mockConfig.latencyMs));
  }

  // 3. Idempotency Check: if already delivered, return existing without duplicating
  if (idempotencyKey && idempotencyMap.has(idempotencyKey)) {
    const existing = idempotencyMap.get(idempotencyKey)!;
    app.log.info({ idempotencyKey, id: existing.id }, '[Mock-WhatsApp] Duplicate request deduplicated via idempotency key');
    return reply.status(200).send({
      success: true,
      messageId: existing.id,
      status: existing.status,
      recipient: existing.to,
      idempotent: true,
      delivered_at: existing.timestamp,
    });
  }

  // 4. Delivered But Timed Out Mode:
  // Saves message to inbox, but fails response with 504 Gateway Timeout
  if (mockConfig.deliveredButTimedOutMode) {
    const messageRecord: WhatsAppMessage = {
      id: crypto.randomUUID(),
      to: body.to || 'Unknown',
      message: body.message || '',
      pdfUrl: body.pdfUrl,
      certNumber: body.certNumber,
      idempotencyKey,
      status: 'delivered',
      timestamp: new Date().toISOString(),
    };

    sentMessages.push(messageRecord);
    if (idempotencyKey) {
      idempotencyMap.set(idempotencyKey, messageRecord);
    }

    app.log.warn({ idempotencyKey }, '[Mock-WhatsApp] Delivered but timed out mode triggered (504)');
    return reply.status(504).send({
      statusCode: 504,
      error: 'Gateway Timeout',
      message: 'Provider timed out responding to client',
    });
  }

  // 5. Random Failure Rate
  if (mockConfig.failureRate > 0) {
    const roll = Math.random() * 100;
    if (roll < mockConfig.failureRate) {
      return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Mock WhatsApp transient network failure',
      });
    }
  }

  // 6. Normal Delivery
  if (!body.to || !body.message) {
    return reply.status(400).send({ error: 'Missing "to" or "message" field' });
  }

  const messageRecord: WhatsAppMessage = {
    id: crypto.randomUUID(),
    to: body.to,
    message: body.message,
    pdfUrl: body.pdfUrl,
    certNumber: body.certNumber,
    idempotencyKey,
    status: 'delivered',
    timestamp: new Date().toISOString(),
  };

  sentMessages.push(messageRecord);
  if (idempotencyKey) {
    idempotencyMap.set(idempotencyKey, messageRecord);
  }

  app.log.info({ id: messageRecord.id, to: messageRecord.to }, '[Mock-WhatsApp] Message delivered');

  return reply.status(200).send({
    success: true,
    messageId: messageRecord.id,
    status: messageRecord.status,
    recipient: messageRecord.to,
    delivered_at: messageRecord.timestamp,
  });
});

// Phone-Style Inbox HTML Page
app.get('/', async (_request, reply) => {
  reply.type('text/html');
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mock WhatsApp - Phone Inbox</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .phone-screen {
      width: 380px;
      height: 720px;
      background: #efeae2;
      border-radius: 40px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 12px #1f2937;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .chat-bubble {
      background: #ffffff;
      border-radius: 8px 8px 8px 0px;
      box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
    }
  </style>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen flex items-center justify-center p-6">
  <div class="flex flex-col lg:flex-row items-center gap-8 max-w-6xl w-full">
    
    <!-- Phone Mockup -->
    <div class="phone-screen flex-shrink-0 relative">
      <!-- Phone Notch / Status Bar -->
      <div class="bg-[#075e54] text-white px-6 pt-3 pb-2 flex justify-between items-center text-xs font-semibold">
        <span>09:41</span>
        <div class="flex space-x-1.5 items-center">
          <span>5G</span>
          <span>100%</span>
        </div>
      </div>

      <!-- WhatsApp App Header -->
      <div class="bg-[#075e54] text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-sm">
            CF
          </div>
          <div>
            <h1 class="font-bold text-sm leading-tight">CertiFlow Dispatch</h1>
            <span class="text-[11px] text-emerald-200">Official Notification Channel</span>
          </div>
        </div>
        <button onclick="fetchMessages()" class="text-xs bg-emerald-700/60 hover:bg-emerald-700 px-2.5 py-1 rounded">
          ↻ Refresh
        </button>
      </div>

      <!-- Messages Stream -->
      <div id="messages-container" class="flex-1 p-4 overflow-y-auto space-y-3">
        <div class="text-center">
          <span class="bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded shadow-xs">
            TODAY
          </span>
        </div>
        <div id="message-list" class="space-y-3">
          <!-- Filled dynamically -->
        </div>
      </div>

      <!-- Phone Bottom Bar -->
      <div class="bg-slate-100 px-4 py-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-200">
        <span>Inbox: <strong id="total-count" class="text-slate-800">0</strong> messages</span>
        <button onclick="clearMessages()" class="text-red-600 hover:underline font-semibold text-[11px]">
          Clear Inbox
        </button>
      </div>
    </div>

    <!-- Simulation Controls Panel -->
    <div class="flex-1 bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-6 w-full">
      <div>
        <h2 class="text-xl font-bold text-white flex items-center space-x-2">
          <span>⚡ Provider Simulation & Chaos Control</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Simulate real-world carrier latency, transient network failures, idempotency timeouts, and provider outages.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Latency -->
        <div class="bg-slate-900 p-4 rounded-xl border border-slate-700 space-y-2">
          <div class="flex justify-between text-xs font-semibold">
            <span>Latency</span>
            <span id="latency-label" class="text-emerald-400">0 ms</span>
          </div>
          <input type="range" id="latency-slider" min="0" max="3000" step="200" value="0" class="w-full" oninput="updateLatency(this.value)">
        </div>

        <!-- Failure Rate -->
        <div class="bg-slate-900 p-4 rounded-xl border border-slate-700 space-y-2">
          <div class="flex justify-between text-xs font-semibold">
            <span>Random Failure Rate</span>
            <span id="failure-label" class="text-amber-400">0%</span>
          </div>
          <input type="range" id="failure-slider" min="0" max="100" step="10" value="0" class="w-full" oninput="updateFailure(this.value)">
        </div>
      </div>

      <div class="space-y-3">
        <!-- Delivered But Timed Out -->
        <label class="flex items-center space-x-3 bg-slate-900 p-3.5 rounded-xl border border-slate-700 cursor-pointer">
          <input type="checkbox" id="timeout-mode" onchange="toggleTimeoutMode(this.checked)" class="w-4 h-4 rounded text-indigo-600">
          <div>
            <span class="text-sm font-semibold text-white">"Delivered but Timed Out" Mode</span>
            <p class="text-xs text-slate-400">Saves message to inbox but returns HTTP 504 to verify caller deduplication & idempotency handling</p>
          </div>
        </label>

        <!-- Outage Toggle -->
        <label class="flex items-center space-x-3 bg-slate-900 p-3.5 rounded-xl border border-slate-700 cursor-pointer">
          <input type="checkbox" id="outage-toggle" onchange="toggleOutage(this.checked)" class="w-4 h-4 rounded text-red-600">
          <div>
            <span class="text-sm font-semibold text-red-400">Total Provider Outage</span>
            <p class="text-xs text-slate-400">Immediately rejects all incoming delivery dispatches with HTTP 503</p>
          </div>
        </label>
      </div>
    </div>
  </div>

  <script>
    async function fetchMessages() {
      try {
        const res = await fetch('/api/messages');
        const data = await res.json();
        document.getElementById('total-count').innerText = data.total;
        const list = document.getElementById('message-list');
        list.innerHTML = '';

        if (data.messages.length === 0) {
          list.innerHTML = '<div class="text-center text-xs text-slate-400 py-8">No messages received yet.</div>';
          return;
        }

        data.messages.forEach(msg => {
          const div = document.createElement('div');
          div.className = 'chat-bubble p-3 text-slate-800 text-xs space-y-1.5';
          div.innerHTML = \`
            <div class="flex justify-between items-center text-[10px] text-slate-400 font-mono">
              <span>To: \${msg.to}</span>
              <span>\${new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="font-sans leading-relaxed text-slate-700 whitespace-pre-wrap">\${msg.message}</div>
            <div class="flex justify-between items-center pt-1 text-[10px]">
              <span class="text-emerald-700 font-bold">\${msg.certNumber ? 'Cert #' + msg.certNumber : ''}</span>
              <span class="text-blue-500 font-bold">✓✓</span>
            </div>
          \`;
          list.appendChild(div);
        });
      } catch(e) {}
    }

    async function clearMessages() {
      if (confirm('Clear all messages from mock WhatsApp inbox?')) {
        await fetch('/api/messages', { method: 'DELETE' });
        fetchMessages();
      }
    }

    async function sendConfig(patch) {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
    }

    function updateLatency(val) {
      document.getElementById('latency-label').innerText = val + ' ms';
      sendConfig({ latencyMs: parseInt(val, 10) });
    }

    function updateFailure(val) {
      document.getElementById('failure-label').innerText = val + '%';
      sendConfig({ failureRate: parseInt(val, 10) });
    }

    function toggleTimeoutMode(checked) {
      sendConfig({ deliveredButTimedOutMode: checked });
    }

    function toggleOutage(checked) {
      sendConfig({ isOutageActive: checked });
    }

    fetchMessages();
    setInterval(fetchMessages, 3000);
  </script>
</body>
</html>
  `;
});

app.listen({ port, host }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Mock WhatsApp running at ${address} with Phone Inbox at /`);
});
