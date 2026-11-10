import { prisma } from "../utils/prisma";
import { finalizeUploadNow, isUploadError } from "./uploadSessionService";
export type FinalizationQueue = {
  send(body: { uploadSessionId: string }): Promise<unknown>;
};
export async function recoverPendingFinalizations(queue: FinalizationQueue) {
  const sessions = await prisma.uploadSession.findMany({
    where: {
      status: "COMPLETING",
      updatedAt: { lt: new Date(Date.now() - 120_000) },
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
    select: { id: true },
  });
  for (const session of sessions) {
    await queue.send({ uploadSessionId: session.id });
    await prisma.uploadSession.updateMany({
      where: { id: session.id, status: "COMPLETING" },
      data: { updatedAt: new Date() },
    });
  }
}
export async function consumeFinalizations(
  batch: MessageBatch<{ uploadSessionId: string }>,
) {
  for (const message of batch.messages) {
    const id = message.body?.uploadSessionId;
    if (typeof id !== "string" || !id) {
      message.ack();
      continue;
    }
    try {
      if (batch.queue === "storaged-upload-finalize-dlq") {
        await prisma.uploadSession.updateMany({
          where: { id, status: "COMPLETING" },
          data: {
            status: "FAILED",
            errorMessage:
              "Storage finalization failed after repeated attempts. Retry the upload or abort it to release reserved space.",
          },
        });
      } else {
        await finalizeUploadNow({ uploadSessionId: id });
      }
      message.ack();
    } catch (error) {
      if (isUploadError(error) && error.statusCode < 500) {
        message.ack();
      } else {
        console.error("Upload finalization will retry", id);
        message.retry({
          delaySeconds: Math.min(300, 5 * 2 ** Math.min(message.attempts, 6)),
        });
      }
    }
  }
}
