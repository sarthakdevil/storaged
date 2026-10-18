import { S3Client } from "@aws-sdk/client-s3";

type S3Config = {
  endpointUrl: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

// Third-party S3-compatible endpoints can be unreachable or stall mid-response.
// Without a bound, a hung TCP/TLS handshake keeps the Worker's request open
// until the platform force-kills it as "hung code" instead of failing fast.
const REQUEST_TIMEOUT_MS = 10_000;

export const createS3Client = (config: S3Config) => {
  return new S3Client({
    endpoint: config.endpointUrl,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
    requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS },
  });
};
