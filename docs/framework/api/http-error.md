# HttpError

```ts
import { HttpError } from 'acryl-router'
throw new HttpError(404, { message: 'no such note' })               // becomes a 404 text response
throw new HttpError(401, { response: c.json({ error: 'login' }, 401) })
```

`getResponse()` returns the response it stands for. `onError` receives it like any other error.
