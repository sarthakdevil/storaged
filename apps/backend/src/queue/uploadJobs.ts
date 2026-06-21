import { getBoss } from "./boss";

export const UPLOAD_FINALIZE_JOB = "upload.finalize";

export const enqueueUploadFinalize = async (uploadSessionId: string) => {
  const boss = await getBoss();

  await boss.send(UPLOAD_FINALIZE_JOB, { uploadSessionId }, {
    retryLimit: 5,
    retryDelay: 30,
    expireInHours: 24,
  });

  return { queued: true };
};
