# Uploading large folders

Open the upload dialog in the destination folder and choose **Choose folder**, or drag a folder into the dialog. The upload recreates the selected folder and its subfolders before uploading their files. If a destination folder name already exists, a new folder with a numbered suffix is created.

The queue uploads three files at a time and displays 50 rows per page, so selecting thousands of files does not create thousands of visible rows. The total folder size is not limited by the queue; the existing 3 GB per-file limit and available storage still apply. Files over 8 MiB use the existing direct-to-storage multipart API; smaller files use individual backend requests.

Keep the tab and dialog open until the queue finishes. Each row shows its status and any error. Press **Retry / upload** to retry failed files; completed files and folders created during this dialog session are retained. Multipart parts automatically retry up to three times before failing, and a failed transfer is aborted in storage.

The selection contains files, so empty directories are omitted. Browser refresh does not resume the queue. Folder and file names follow the backend's existing name normalization. Direct multipart uploads require bucket CORS that permits PUT requests and exposes the `ETag` response header.

Run `npm run test:uploads` for regression checks covering a 10,000-file queue, folder traversal across browser batches, shared folder creation, dialog pagination, retry behavior, multipart bytes, and failure cleanup. These tests simulate browser and storage APIs; they do not write to a live bucket.
