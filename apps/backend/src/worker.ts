import "dotenv/config";
import { logger } from "./utils/logger";
import { getBoss } from "./queue/boss";
import { UPLOAD_FINALIZE_JOB } from "./queue/uploadJobs";
import { finalizeUploadNow } from "./services/uploadSessionService";

const main = async () => {
  const boss = await getBoss();

  boss.on("error", (err) => {
    logger.error("pg-boss error", err);
  });

  await boss.work<{ uploadSessionId: string }>(UPLOAD_FINALIZE_JOB, async (jobs) => {
    for (const job of jobs) {
      const uploadSessionId = job.data.uploadSessionId;
      logger.info("Finalizing upload session", { uploadSessionId });

      await finalizeUploadNow({ uploadSessionId });

      logger.info("Upload session finalized", { uploadSessionId });
    }
  });

  logger.info("Worker started");
};

main().catch((err) => {
  logger.error("Worker failed to start", err);
  process.exitCode = 1;
});
