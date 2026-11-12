# Presets

Acryl has several routers, each designed for a specific purpose.
You can specify the router you want to use in the constructor of Acryl.

**Presets** are provided for common use cases, so you don't have to specify the router each time.
The `Acryl` class imported from all presets is the same, the only difference being the router.
Therefore, you can use them interchangeably.

## `acrylblends`

Usage:

```ts twoslash
import { Acryl } from 'acrylblends'
```

Routers:

```ts
this.router = new SmartRouter({
  routers: [new RegExpRouter(), new TrieRouter()],
})
```

## `acrylblends/quick`

Usage:

```ts twoslash
import { Acryl } from 'acrylblends/quick'
```

Router:

```ts
this.router = new SmartRouter({
  routers: [new LinearRouter(), new TrieRouter()],
})
```

## `acrylblends/tiny`

Usage:

```ts twoslash
import { Acryl } from 'acrylblends/tiny'
```

Router:

```ts
this.router = new PatternRouter()
```

## Which preset should I use?

| Preset       | Suitable platforms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acrylblends`       | This is highly recommended for most use cases. Although the registration phase may be slower than `acrylblends/quick`, it exhibits high performance once booted. It's ideal for a long-life server on **Node.js** (the verified runtime) or **Bun** (experimental). |
| `acrylblends/quick` | This preset is designed for environments where the application is initialized for every request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `acrylblends/tiny`  | This is the smallest router package and it's suitable for environments where resources are limited.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
