# __APP_NAME__

A todo list built on the ACRYL framework: only the router and shared state. The list is a state cell, the routes are on the router, and the list is
written to a file in the app's home so it survives a restart. `src/todo.ts` is ACRYL's reference app, copied as it is; the files you own are
`blend.yaml` (what is mounted), `src/app.ts` (the composition) and the tests.

```sh
npm install
npm test
npm run dev          # prints the URL, for example http://127.0.0.1:3100
```

```sh
URL=http://127.0.0.1:3100   # the address `npm run dev` printed
curl -X POST $URL/todo/api -H 'content-type: application/json' -d '{"title":"write the docs"}'   # {"id":1,"title":"write the docs","done":false}
curl $URL/todo/api                                                                                  # the list
curl -X PATCH $URL/todo/api/1 -H 'content-type: application/json' -d '{"done":true}'
curl -X DELETE $URL/todo/api/1
curl -N $URL/todo/events                                                                            # the list now, then again on every change
```

The routes only answer a caller on this machine: a request from another site's page (a foreign `Origin`, or `Origin: null`) or addressed to another host name gets `403`.

Open `$URL/todo` for the page. Stop the app and start it again: the list is still there (`<home>/todo.json`, `~/.acryl/apps/<id>/data/` unless `ACRYLBLENDS_HOME` says otherwise).

- `blend.yaml` is the app as data. `npm run lock` records what it is built from; `npm run save` commits it, refusing secrets and public remotes for a private app.
- The framework plugins are in `plugins/acryl-*/src`. Do not edit them: they are ACRYL's, vendored; the text that explains them is in the ACRYLBLENDS docs.
