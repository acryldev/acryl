# Frequently Asked Questions

## Why does `/orders/` return 404 when `/orders` works?

Trailing slashes are strict by default: `/orders` and `/orders/` are different paths. Add `trimTrailingSlash()` to redirect, or set the router to ignore the slash. See
[Mounting and trailing slashes](../cordis/mounting.md#trailing-slashes).

## Why does my validator see `{}` for a JSON body?

A `json` validation target reads the body only when the request has a JSON `Content-Type`; without it the validator sees `{}`. See
[Validation with Standard Schema](../cordis/validation.md).

## Which runtimes are verified?

Node.js, Bun and Deno. The others are listed, as not yet verified, on [Other runtimes](../getting-started/other-runtimes.md).

## Where are the parts marked "not yet available"?

Their pages are part of the documentation so that the structure is complete; each starts with a note saying so. They are enabled as they are ported.
