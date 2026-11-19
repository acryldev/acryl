import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appRootFor } from '../app-root.ts'

test("the shell takes the app two levels above in an app copy, and Electron's app path as an installed package", () => {
  // `<app>/plugins/desktop-web/main.ts`: the copy an app made with acrylblends add desktop holds.
  assert.equal(
    appRootFor('file:///apps/shop/plugins/desktop-web/main.ts', () => '/wrong'),
    '/apps/shop/',
  )
  // `<app>/node_modules/@acrylblends/desktop-web/lib/main.js`: the installed package, where Electron names the app.
  assert.equal(
    appRootFor(
      'file:///apps/shop/node_modules/@acrylblends/desktop-web/lib/main.js',
      () => '/apps/shop',
    ),
    '/apps/shop',
  )
})
