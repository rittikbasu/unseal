# unseal

create an unprotected copy of a known-password pdf without uploading it.

unseal is a local-first web app for opening a password-protected pdf with a password you already know, then creating a new copy that opens without a password. the pdf and password stay in the browser. the original file is never changed.

## use it

1. save the attachment from mail to files
2. open unseal
3. choose the pdf
4. enter the password you already have
5. tap **save or share** on iphone, or download the copy on desktop

## privacy

- pdf processing runs in a web worker on the device
- the pdf and password are not sent to a server
- the password exists only in memory and is never persisted
- the service worker caches application code and the qpdf wasm binary, not user files
- the app ships without accounts, uploads, cookies or analytics code
- hosting analytics must remain disabled for the no-network promise to stay accurate
- the generated file is an unprotected copy. share it only with people you trust

## boundaries

unseal does not recover, guess or crack passwords. it does not modify, overwrite or delete the original pdf. it accepts one file at a time and does not use ocr, uploads, accounts or document storage.

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
```

the browser suite uses synthetic legacy, aes-128, aes-256 and malformed fixtures. real bank statements and passwords should stay on the intended device and must never enter this repository, tests, logs or screenshots.

## deployment

the production app is a static site for Cloudflare Pages. no server-side pdf processing is required.

```bash
npm run build
pnpm dlx wrangler@latest pages deploy dist --project-name unseal --branch main
```
