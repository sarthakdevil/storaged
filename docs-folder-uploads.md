# Uploading large folders

Open the upload dialog in the destination folder and choose **Choose folder**, or drag a folder into the dialog. The upload recreates the selected folder and its subfolders before uploading their files. If a destination folder name already exists, a new folder with a numbered suffix is created.

The queue uploads three files at a time and displays 50 rows per page, so selecting thousands of files does not create thousands of visible rows. The total folder size is not limited by the queue; the existing 3 GB per-file limit and available storage still apply. Files over 8 MiB use the existing direct-to-storage multipart API; smaller files use individual backend requests.

Folders are logical database nodes, not single bucket objects. Each file records its parent folder and logical path independently. Files are split into standalone chunk objects and can span multiple S3-compatible buckets. Downloads, previews and share links stream the chunks in order as a single file, with byte-range support for media seeking. Existing whole-file objects remain readable.

Keep the tab and dialog open until the queue finishes. Each row shows its status and any error. Press **Retry / upload** to retry failed files; completed files and folders created during this dialog session are retained. Multipart parts automatically retry up to three times before failing, and a failed transfer is aborted in storage.

The selection contains files, so empty directories are omitted. Browser refresh does not resume the queue. Folder and file names follow the backend's existing name normalization. Direct multipart uploads require bucket CORS that permits PUT requests and exposes the `ETag` response header.

Bucket admission checks apply to both regular and multipart uploads. In Storage connections, **Maximum file size (MB)** is optional: leave it blank to use the researched provider default below, or enter the bucket's configured object limit (for example, 500). Set **Storage quota (GB)** to the bucket's actual total allowance when it differs from the existing provider free-tier estimate. Units use powers of 1024. Each chunk is placed in the eligible bucket with the most remaining bytes, counting existing physical objects and pending reservations. Slice sizes shrink when object limits or small remaining capacities require it. A file can exceed any single bucket's space or object limit; admission returns 507 if a compatible chunk layout cannot fit. The app still caps each logical file at 3 GB. Clearing a per-file override restores the provider default.

Per-file defaults verified against provider documentation on 2026-10-25:

| Provider | App default when omitted | Basis |
| --- | --- | --- |
| Supabase | 50 MB | Conservative Free-plan default; [paid plans support higher configured limits](https://supabase.com/docs/guides/storage/uploads/file-limits). Override for a paid project, subject to its global and bucket settings. |
| Amazon S3 / compatible | 3 GB | App cap; [AWS multipart object limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html) exceed it. Custom S3 endpoints may require a smaller override. |
| Cloudflare R2 | 3 GB | App cap; [R2 object limits](https://developers.cloudflare.com/r2/platform/limits/) exceed it. |
| Backblaze B2 | 3 GB | App cap; [B2 upload methods](https://www.backblaze.com/docs/en/cloud-storage-upload-and-manage-files) support larger uploads via API. The web console's 500 MB limit does not apply to this app's S3 uploads. |
| Storj | 3 GB | App cap; [Storj S3 compatibility limits](https://storj.dev/dcs/api/s3/s3-compatibility) allow larger objects. |
| IDrive e2 | 3 GB | App cap; [e2 S3 API limits](https://www.idrive.com/s3-storage-e2/faq-account-management) allow larger objects. |
| Filebase | 3 GB | App cap; [Filebase service limits](https://filebase.com/docs/account/service-limits) allow larger objects. |
| Oracle OCI | 3 GB | App cap; [OCI object limits](https://docs.oracle.com/en-us/iaas/Content/Object/Concepts/objectstorageoverview.htm) allow larger objects. |

Capacity is calculated from files tracked by this app, including trash and pending uploads. Database row locks reserve every planned chunk atomically before transfer. Completion verifies each chunk's size and ETag and creates one logical file with an ordered physical manifest. Abort deletes chunks and releases reservations; unsuccessful cleanup keeps the session in ABORTING and can be retried. Abandoned active sessions continue reserving space until aborted. Provider/account limits and objects uploaded outside the app are not automatically discovered through S3; configure accurate limits and allow for external usage. Provider errors can still occur if its configuration or usage changes after admission.

Before running the updated backend, apply the migration with `npm run prisma:migrate:deploy --workspace=backend` and generate its client with `npm run prisma:generate --workspace=backend`. Configure `JWT_SECRET` for expiring content links. Chunked content is streamed through the backend; this adds backend subrequests and bandwidth, so provision the Worker plan accordingly. Direct uploads still require PUT CORS and an exposed ETag header. Buckets must support GET byte ranges and HEAD for verification. Keep chunk objects private and exclude them from lifecycle rules that would remove live file data. The streaming implementation follows the [Workers Streams API guidance](https://developers.cloudflare.com/workers/runtime-apis/streams/).

Run `npm run test:capacity` for bucket-size boundaries, quota/reservation checks, concurrent admission and rejection before provider requests.

Run `npm run test:uploads` for regression checks covering a 10,000-file queue, folder traversal across browser batches, shared folder creation, dialog pagination, retry behavior, multipart bytes, and failure cleanup. These tests simulate browser and storage APIs; they do not write to a live bucket.

## Storage ownership, encrypted credentials and durable completion

Connections belong to their creator. Ordinary accounts can list, edit, remove and upload into only their own connections. Active administrators can manage all connections; administrator uploads still use their own storage. File download and preview permissions continue to follow the logical file's owner and share links. The ownership migration assigns a legacy bucket only when its file/upload history identifies one owner; ambiguous or unused legacy buckets remain inaccessible to ordinary accounts until an administrator resolves ownership in the database.

Both credential fields are encrypted together with AES-256-GCM, a fresh 12-byte nonce and an authentication tag. The 32-byte encryption key is a 64-character hexadecimal `STORAGE_ENCRYPTION_KEY` Cloudflare secret, separate from the database. API responses omit the secret key and encrypted envelope. Owner/admin edit forms can still receive the access key ID. Never commit the encryption key or `.dev.vars`. Back up the key in a password manager: losing it makes existing encrypted credentials unreadable. Do not replace it without decrypting and re-encrypting the records as part of a planned rotation.

Rollout order: provision `STORAGE_ENCRYPTION_KEY`, apply the ownership migration, deploy encryption-aware readers/writers, then run `node scripts/migrate-storage-credentials.cjs --apply` with the same database and key. The script audits without `--apply`, verifies existing ciphertext, and updates plaintext records transactionally. Plaintext reads are supported only for migration compatibility; new writes always encrypt and fail if the key is absent. Rollbacks after encryption must use an encryption-aware backend version. Previously committed environment secrets must be rotated separately; removing them from the current Git tree does not erase history.

Production completion requires `UPLOAD_QUEUE`. The main queue `storaged-upload-finalize` retries transient provider/database failures with a bounded delay. It uses `storaged-upload-finalize-dlq` after retry exhaustion; its consumer marks unresolved sessions FAILED without discarding their storage reservations. Clients can abort failed uploads to remove data and release reservations. Duplicate deliveries recognize completed sessions and do not create duplicate files. A five-minute recovery cron republishes COMPLETING sessions that have not advanced for two minutes, covering interruption between database state changes and queue publication. Daily trash cleanup remains on the midnight cron.

Run `npm run test:security` for credential round trips/tampering, owner/admin boundaries, encrypted persistence, retry behavior, dead-letter handling and recovery checks.

Keep SQL response caching disabled on the dedicated `storaged-hyperdrive` connection (`wrangler hyperdrive update <id> --caching-disabled true`). Authentication, ownership checks and upload status require fresh reads. Hyperdrive's query cache is not invalidated by writes, so stale results can otherwise delay completion visibility and permission revocation. Connection pooling remains enabled. See [Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/).
