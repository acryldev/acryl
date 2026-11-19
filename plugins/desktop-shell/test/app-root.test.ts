import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appRootFor } from '../app-root.ts'

test("the shell takes the app two levels above in an app copy, and Electron's app path as an installed package", () => {
  // `<app>/plugins/desktop-shell/main.ts`: the copy an app made with acrylblends init holds.
  assert.equal(
    appRootFor('file:///apps/shop/plugins/desktop-shell/main.ts', () => '/wrong'),
    '/apps/shop/',
  )
  // `<app>/node_modules/@acryldev/desktop-shell/lib/main.js`: the installed package, where Electron names the app (electron . and a packaged app alike).
  assert.equal(
    appRootFor(
      'file:///apps/shop/node_modules/@acryldev/desktop-shell/lib/main.js',
      () => '/apps/shop',
    ),
    '/apps/shop',
  )
  // A Windows install: the check looks for either separator in a file URL or a path.
  assert.equal(
    appRootFor('file:///C:/apps/shop/node_modules/x/lib/main.js', () => 'C:\\apps\\shop'),
    'C:\\apps\\shop',
  )
})
