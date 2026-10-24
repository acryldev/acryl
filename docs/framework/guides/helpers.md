# Helpers

Helpers are available to assist in developing your application. Unlike middleware, they don't act as handlers, but rather provide useful functions.

For instance, here's how to use the [Cookie helper](../helpers/cookie.md):

```ts
import { getCookie, setCookie } from 'acrylblends/cookie'

const app = new Acryl()

app.get('/cookie', (c) => {
  const yummyCookie = getCookie(c, 'yummy_cookie')
  // ...
  setCookie(c, 'delicious_cookie', 'macha')
  //
})
```

## Available Helpers

- [Accepts](../helpers/accepts.md)
- [Adapter](../helpers/adapter.md)
- [Cookie](../helpers/cookie.md)
- [css](../helpers/css.md)
- [Dev](../helpers/dev.md)
- [Factory](../helpers/factory.md)
- [html](../helpers/html.md)
- [JWT](../helpers/jwt.md)
- [SSG](../helpers/ssg.md)
- [Streaming](../helpers/streaming.md)
- [Testing](../helpers/testing.md)
- [WebSocket](../helpers/websocket.md)
