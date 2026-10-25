# Uploading large folders

Open the upload dialog in the destination folder and choose **Choose folder**, or drag a folder into the dialog. The upload recreates the selected folder and its subfolders before uploading their files. If a destination folder name already exists, a new folder with a numbered suffix is created.

The queue uploads three files at a time and displays 50 rows per page, so selecting thousands of files does not create thousands of visible rows. The total folder size is not limited by the queue; the existing 3 GB per-file limit and available storage still apply. Files over 8 MiB use the existing direct-to-storage multipart API; smaller files use individual backend requests.

Folders are logical database nodes, not single bucket objects. Each file records its parent folder, logical path and physical bucket/object key independently. A folder can therefore span buckets and exceed any individual bucket's capacity while rendering as one folder tree in the UI. Each individual file must still fit a compatible bucket; this does not split a file across buckets.

Keep the tab and dialog open until the queue finishes. Each row shows its status and any error. Press **Retry / upload** to retry failed files; completed files and folders created during this dialog session are retained. Multipart parts automatically retry up to three times before failing, and a failed transfer is aborted in storage.

The selection contains files, so empty directories are omitted. Browser refresh does not resume the queue. Folder and file names follow the backend's existing name normalization. Direct multipart uploads require bucket CORS that permits PUT requests and exposes the `ETag` response header.

Bucket admission checks apply to both regular and multipart uploads. In Storage connections, **Maximum file size (MB)** is optional: leave it blank to use the researched provider default below, or enter the bucket's configured limit (for example, 500). Set **Storage quota (GB)** to the bucket's actual total allowance when it differs from the existing provider free-tier estimate. Units use powers of 1024. A larger file skips that bucket; if no bucket supports its size the API returns 413, or 507 when compatible buckets lack space. The app still caps files at 3 GB, including when a larger override is entered. Clearing a per-file override restores the provider default.

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

Capacity is calculated from files tracked by this app, including trash and pending uploads. Database row locks and upload-session reservations prevent simultaneous app uploads from claiming the same space. Completed, failed and aborted sessions no longer reserve space. Abandoned active sessions continue reserving space until aborted. Provider/account limits and objects uploaded outside the app are not automatically discovered through S3; configure accurate limits and allow for external usage. Provider errors can still occur if its configuration or usage changes after admission.

Run `npm run test:capacity` for bucket-size boundaries, quota/reservation checks, concurrent admission and rejection before provider requests.

Run `npm run test:uploads` for regression checks covering a 10,000-file queue, folder traversal across browser batches, shared folder creation, dialog pagination, retry behavior, multipart bytes, and failure cleanup. These tests simulate browser and storage APIs; they do not write to a live bucket.
