import dotenv from 'dotenv';
import path from 'path';
import PgBoss from 'pg-boss';
import pino from 'pino';

// Load environment variables
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss Z' },
        }
      : undefined,
});

const connectionString =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/certiflow';
const apiBaseUrl =
  process.env.API_URL || 'http://localhost:4000';

interface CertificateJobData {
  candidateId: string;
  candidateName: string;
  candidatePhone: string;
  candidateScore: number;
  courseName: string;
  batchId: string;
}

async function startWorker() {
  logger.info('[Worker] Initializing CertiFlow pg-boss background worker...');

  const boss = new PgBoss({
    connectionString,
    schema: 'pgboss',
  });

  boss.on('error', (error) => {
    logger.error({ error }, '[Worker] pg-boss error encountered');
  });

  try {
    await boss.start();
    logger.info('[Worker] pg-boss connected and background listener started successfully.');

    // Job handler: certificate-issuance with retry and exponential backoff
    await boss.work('certificate-issuance', async (jobs: any[]) => {
      for (const job of jobs) {
        const jobData = job.data as CertificateJobData;
        logger.info(
          { jobId: job.id, candidate: jobData?.candidateName },
          '[Worker] Processing certificate issuance job'
        );

        try {
          const response = await fetch(
            `${apiBaseUrl}/api/worker/process-certificate-job`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jobData }),
            }
          );

          if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Worker HTTP dispatch error (${response.status}): ${errBody}`);
          }

          logger.info(
            { jobId: job.id, candidate: jobData?.candidateName },
            '[Worker] Certificate issued and delivered successfully'
          );
        } catch (jobErr: any) {
          logger.warn(
            { jobId: job.id, error: jobErr.message },
            '[Worker] Job failed; pg-boss will apply exponential backoff retry'
          );
          throw jobErr; // triggers pg-boss exponential backoff retry
        }
      }
    });

    // Job handler: scheduled SLA escalation monitor
    await boss.work('sla-escalation-monitor', async () => {
      logger.info('[Worker] Executing scheduled SLA escalation check...');
      try {
        const res = await fetch(`${apiBaseUrl}/api/escalations/trigger-scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Service worker bypass/auth header if needed
            'Authorization': 'Bearer worker-internal-token',
          },
        });
        if (res.ok) {
          const result = await res.json();
          logger.info({ result }, '[Worker] SLA escalation scan completed');
        }
      } catch (err: any) {
        logger.warn({ error: err.message }, '[Worker] SLA escalation check failed');
      }
    });

    // Schedule SLA escalation monitor every 10 seconds
    try {
      await boss.schedule('sla-escalation-monitor', '*/10 * * * * *');
      logger.info('[Worker] Scheduled pg-boss job: sla-escalation-monitor (every 10s)');
    } catch (schedErr: any) {
      logger.warn({ err: schedErr.message }, '[Worker] Could not register cron schedule; falling back to interval');
    }

    // Interval fallback to guarantee periodic SLA scans even in demo/local mode
    const slaInterval = setInterval(async () => {
      try {
        await fetch(`${apiBaseUrl}/api/escalations/trigger-scan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer worker-internal-token',
          },
        });
      } catch {}
    }, 15000);

    logger.info('[Worker] All pg-boss job handlers registered.');

    const shutdown = async () => {
      logger.info('[Worker] Gracefully stopping pg-boss worker...');
      await boss.stop();
      logger.info('[Worker] Stopped cleanly.');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err: any) {
    logger.warn(
      { msg: err.message },
      '[Worker] PostgreSQL unavailable at startup. Retrying in 5s...'
    );
    setTimeout(startWorker, 5000);
  }
}

startWorker();
