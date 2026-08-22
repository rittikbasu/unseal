# unseal

make a shareable copy of a protected pdf.

unseal is a local-only web app for opening a password-protected pdf with a password you already know, then creating an unprotected copy to share or save. the file and password stay in the browser. there is no upload api, account or document storage.

## use it

1. save the attachment from mail to files
2. open unseal
3. choose the pdf
4. enter the password you already have
5. share the new copy or save it to files

unseal never changes or deletes the original file.

## privacy

- pdf processing runs in a web worker on the device
- the pdf and password are not sent to a server
- the password is kept only in memory
- the service worker caches application code and the qpdf wasm binary, not user files
- there are no accounts, uploads, analytics, cookies or third-party runtime cdns
- the generated file is an unprotected copy. share it only with people you trust

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

the browser suite uses synthetic legacy, aes-128, aes-256 and malformed fixtures. real bank statements and passwords should stay on the intended device and must never enter this repository.

## deployment

the production app is a static site for Cloudflare Pages. no server-side pdf processing is required.

```bash
npm run build
pnpm dlx wrangler@latest pages deploy dist --project-name unseal --branch main
```
