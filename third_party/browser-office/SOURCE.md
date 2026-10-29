# Corresponding source and notices

MailDesk embeds the AGPL-3.0 browser Office editor from https://github.com/ranuts/document at commit e975654679d2cc3ef61d67d93fdce2839327676c. Its LICENSE and NOTICE are retained verbatim here and in the built assets. The vendor NOTICE identifies the sources of its ONLYOFFICE 9.3.0.133 editors and other components. Preserve these notices and the editor's About/legal interfaces in redistribution.

The exact upstream source: https://github.com/ranuts/document/tree/e975654679d2cc3ef61d67d93fdce2839327676c

The MailDesk embedding/build changes: https://github.com/Harshkhurdi/maildesk (scripts/prepare-browser-office.mjs, next.config.ts, components/office-editor.tsx). Rebuild with Node 24, `npm ci`, then `npm run build`. The script checks out that commit, installs the frozen upstream lockfile with pnpm 11.4.0, builds static assets, restricts the embed page's optional network connections, and copies notices/source information. No vendor editor code is patched.

This dependency introduces AGPL source-distribution obligations; review licensing before merging or offering a hosted proprietary derivative. The separate engine is not Microsoft Office and does not guarantee all Microsoft-specific features or formatting. No commercial license is included.

MailDesk also supplies the English Hunspell/SCOWL dictionary in `third_party/hunspell-en-us`, with its full COPYRIGHT notice. This resolves the engine's dictionary requests as static resources instead of dynamic 404 responses.
