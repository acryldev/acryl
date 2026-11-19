# @acryldev/absent

An empty package. An ACRYLBLENDS app's `package.json` overrides a package it does not install with this one, for example DSH's
153 MB LibreOffice engines:

```json
"overrides": { "@deepseek-ai/libreoffice-kit-darwin-arm64": "npm:@acryldev/absent@1.0.0" }
```

The list lives in `frame/packages.json` (`omit`) of the acrylblends repository. The Office preview plugin installs the real engine when a
person asks for it.
