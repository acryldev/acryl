# Method Override Middleware

This middleware executes the handler of the specified method, which is different from the actual method of the request, depending on the value of the form, header, or query, and returns its response.

## Import

```ts
import { Acryl } from 'acrylblends'
import { methodOverride } from 'acrylblends/method-override'
```

## Usage

```ts
const app = new Acryl()

// If no options are specified, the value of `_method` in the form,
// e.g. DELETE, is used as the method.
app.use('/posts', methodOverride({ app }))

app.delete('/posts', (c) => {
  // ....
})
```

## For example

Since HTML forms cannot send a DELETE method, you can put the value `DELETE` in the property named `_method` and send it. And the handler for `app.delete()` will be executed.

The HTML form:

```html
<form action="/posts" method="POST">
  <input type="hidden" name="_method" value="DELETE" />
  <input type="text" name="id" />
</form>
```

The application:

```ts
import { methodOverride } from 'acrylblends/method-override'

const app = new Acryl()
app.use('/posts', methodOverride({ app }))

app.delete('/posts', () => {
  // ...
})
```

You can change the default values or use the header value and query value:

```ts
app.use('/posts', methodOverride({ app, form: '_custom_name' }))
app.use(
  '/posts',
  methodOverride({ app, header: 'X-METHOD-OVERRIDE' })
)
app.use('/posts', methodOverride({ app, query: '_method' }))
```

## Options

### **(required)** app: `Acryl`

The instance of `Acryl` is used in your application.

### *(optional)* form: `string`

Form key with a value containing the method name.
The default is `_method`.

### *(optional)* header: `boolean`

Header name with a value containing the method name.

### *(optional)* query: `boolean`

Query parameter key with a value containing the method name.
