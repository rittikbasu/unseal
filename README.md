# unseal

local pdf utility for creating a copy that opens without a password.

## why i built it

password protected pdfs are awkward to share. making a copy that opens without a password should not require uploading the original to a random website.

unseal creates that copy locally in your browser and leaves the original unchanged.

## use it

1. open unseal
2. choose the protected pdf
3. enter the pdf password
4. choose **Save or share** when it is available, or **Download** otherwise

on iphone, save the attachment to files first if it is still in mail. **Save or share** opens the native share sheet when supported. the new file keeps the original filename and adds `-unsealed`.

## privacy

unseal reads the pdf in your browser and runs qpdf in a web worker through webassembly. the pdf, password and document contents stay on your device. there is no backend, account system or document database.

the password is used only for the current operation and is never saved. the service worker caches app assets and qpdf's wasm binary, not user files. unseal creates a new copy and leaves the original unchanged.

the new copy has no password protection, so anyone who receives it can open it.

## pwa

unseal can be installed as a standalone pwa from a supported browser.

offline use is available after the app has loaded once online and the service worker has finished installing. browsers may later evict cached app data, especially on ios.

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

tests use synthetic legacy, aes-128, aes-256 and malformed pdf fixtures. never put real statements, passwords or other private documents in the repository, tests, logs or screenshots.

## deployment

the production app is a static site for cloudflare pages. deploy it at the root of an https origin so file sharing and pwa installation work as expected.

```bash
npm run build
npx wrangler@latest pages deploy dist --project-name unseal --branch main
```

the deployment must serve the generated service worker, manifest and qpdf wasm asset. do not rewrite or indefinitely cache `sw.js`.
