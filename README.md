# unseal

local-first pdf utility for creating a copy that opens without a password.

unseal opens one password protected pdf with a password you already know, then creates a new unprotected copy. the selected pdf never leaves the device and the original is never changed.

## why i built it

saving a password protected statement and sharing it with someone should not require uploading a private document to a random website.

unseal keeps the whole workflow on-device. it is a small focused tool for one job: open a known-password pdf locally and create a copy that is easier to open or share.

## use it

1. save the pdf attachment from mail to files
2. open unseal
3. choose the pdf
4. enter the password you already have
5. tap **save or share** on iphone, then choose save to files or another app
6. use **download** on browsers without file sharing support

on iphone, **save or share** uses the native web share sheet when the browser supports sharing pdf files. the sheet can save the copy to files or pass it to another app. on other browsers, **download** uses the browser's normal download flow.

## how it works

1. the selected pdf is read locally in the browser
2. qpdf runs inside a web worker through webassembly
3. the worker creates a new pdf without changing the original
4. the result is handed to the browser's share or download flow

there is no backend request in the document flow.

## privacy

- pdfs and passwords remain on-device
- the password exists only in memory and is never persisted
- unseal never uploads or transmits the source pdf, password, filename or document contents to a service
- the original pdf is never modified, overwritten or deleted
- the service worker caches application assets and the qpdf wasm binary, never user files or passwords
- the font is self-hosted and there is no runtime cdn
- there are no accounts, document uploads or database in the app
- the hosted custom domain currently includes Cloudflare Insights for page analytics. this is separate from local pdf processing
- the generated copy is unprotected. if you choose **save or share**, the copy is handed to the operating system's share sheet by your explicit action. share it only with people you trust

## boundaries

unseal only accepts one pdf at a time and a password you already know. it does not:

- recover, guess or crack passwords
- generate bank-specific passwords
- modify or edit pdfs
- use ocr
- process batches
- upload documents
- create accounts or store documents

## pwa

unseal can be installed as a standalone pwa from a supported browser. the favicon, apple touch icon and install icons use the supplied envelope mark on a dark background.

offline use becomes available after the app has loaded once online and the service worker has finished installing. browsers may later evict cached app data, especially on ios.

## development

```bash
npm install
npm run dev
```

## verification

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

the browser suite uses synthetic legacy, aes-128, aes-256 and malformed pdf fixtures. real bank statements and passwords must stay on the intended device and must never enter this repository, tests, logs or screenshots.

## deployment

the production app is a static site for cloudflare pages. deploy it at the root of an https origin so file sharing and pwa installation work as expected.

```bash
npm run build
pnpm dlx wrangler@latest pages deploy dist --project-name unseal --branch main
```

the hosted site currently keeps Cloudflare Insights enabled by deployment choice. the deployment must serve the generated service worker, manifest and qpdf wasm asset without rewriting or indefinitely caching `sw.js`.
