# Native Office files

Word, Excel and PowerPoint use native DOCX/XLSX/PPTX through a browser-only Office SDK/WebAssembly engine. Create a blank file or template, or import a native file. CSV converts to XLSX in a worker; formula-like CSV text is not executed. Editing/export does not invoke a Vercel conversion function or a separate document server.

Original uploads remain byte-for-byte version 1. Edited files save as separate snapshots after a storage acknowledgement. Save conflicts protect newer revisions. Use Saved copy or Versions to download persisted content; failed saves offer an exported recovery copy. Keep the editor open until saved. Browser crashes can lose unexported edits.

Earlier MailDesk JSON files can be converted into separate native copies; originals are kept. Conversion cannot recover fidelity lost by the old importer. Guest browser work is downloadable at `/guest`.

See [README](../README.md) for limits, licensing, setup and supported providers. See [report](IMPLEMENTATION_REPORT.md) for actual verification and outstanding acceptance work.
