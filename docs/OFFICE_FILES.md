# Open files from your device

Go to Documents, Presentations, or Spreadsheets and choose **Open file**. Select a file, review the import notice, and choose **Open editable copy**. Save it to keep the copy in your workspace. Guest copies are saved only in that browser. Your original file is unchanged.

| Section | Supported files | What opens |
| --- | --- | --- |
| Documents | DOCX, TXT, HTML, HTM | Document body text, headings, basic bold/italic/underline formatting, list text and tables |
| Presentations | PPTX | Slide text in deck order, speaker notes and plain background colors |
| Spreadsheets | XLSX, CSV | First worksheet, cell positions, values and formulas, up to 500 rows and 26 columns |
| PDF viewer | PDF | Existing local PDF reader with pages, text search, zoom and rotation |

Office imports are editable copies rather than exact Office renderings. Word images, page layouts, headers, footnotes and tracked deletions are omitted. Presentation images, charts, animation and original layouts are omitted. Spreadsheet charts, macros and formatting are omitted. Spreadsheet formulas support SUM, AVERAGE, MIN, MAX, COUNT and arithmetic; other formulas show an error. The opening notice explains these limitations before the copy opens. Older DOC/PPT/XLS files should first be saved as DOCX/PPTX/XLSX in Office or LibreOffice.

DOCX/PPTX inputs may be up to 5 MB; XLSX/CSV up to 1 MB; text/HTML up to 500 KB. Expanded archives and text/cell sizes also have limits. Damaged, encrypted, oversized, external-entity and unsafe archive inputs fail without replacing saved work. Imports are read on the device and do not send files to an AI provider. Choosing Save stores the editable copy privately, or locally in guest mode.

## Verification boundary

The Office import regression suite uses actual generated DOCX, PPTX and XLSX files, checks spacing across formatted text runs, slide order/notes, leading blank rows, formulas and file rejection. Chat tests cover concurrent incoming messages and retrying WebRTC descriptions. Automated checks cannot confirm that two people actually hear or see one another. That remains a separate real two-person test; no relay is configured at the owner's request.
