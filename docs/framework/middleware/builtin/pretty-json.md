# Pretty JSON Middleware

Pretty JSON middleware enables "_JSON pretty print_" for JSON response body.
Adding `?pretty` to url query param, the JSON strings are prettified.

```js
// GET /
{"project":{"name":"Acryl","repository":"https://github.com/acrylblends/acrylblends"}}
```

will be:

```js
// GET /?pretty
{
  "project": {
    "name": "Acryl",
    "repository": "https://github.com/acrylblends/acrylblends"
  }
}
```

## Import

```ts
import { Acryl } from 'acrylblends'
import { prettyJSON } from 'acrylblends/pretty-json'
```

## Usage

```ts
const app = new Acryl()

app.use(prettyJSON()) // With options: prettyJSON({ space: 4 })
app.get('/', (c) => {
  return c.json({ message: 'Acryl!' })
})
```

## Options

### *(optional)* space: `number`

Number of spaces for indentation. The default is `2`.

### *(optional)* query: `string`

The name of the query string for applying. The default is `pretty`.

### *(optional)* force: `boolean`

When set to `true`, JSON responses are always prettified regardless of the query parameter. The default is `false`.
