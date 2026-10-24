# JWT Authentication Helper

This helper provides functions for encoding, decoding, signing, and verifying JSON Web Tokens (JWTs). JWTs are commonly used for authentication and authorization purposes in web applications. This helper offers robust JWT functionality with support for various cryptographic algorithms.

## Import

To use this helper, you can import it as follows:

```ts
import { decode, sign, verify } from 'acrylblends/jwt'
```

> **Note.** [JWT Middleware](../middleware/builtin/jwt.md) also import the `jwt` function from the `acrylblends/jwt`.

## `sign()`

This function generates a JWT token by encoding a payload and signing it using the specified algorithm and secret.

```ts
sign(
  payload: unknown,
  secret: string,
  alg?: 'HS256';

): Promise<string>;
```

### Example

```ts
import { sign } from 'acrylblends/jwt'

const payload = {
  sub: 'user123',
  role: 'admin',
  exp: Math.floor(Date.now() / 1000) + 60 * 5, // Token expires in 5 minutes
}
const secret = 'mySecretKey'
const token = await sign(payload, secret)
```

### Options

<br/>

#### **(required)** payload: `unknown`

The JWT payload to be signed. You can include other claims like in [Payload Validation](#payload-validation).

#### **(required)** secret: `string`

The secret key used for JWT verification or signing.

#### *(optional)* alg: [AlgorithmTypes](#supported-algorithmtypes)

The algorithm used for JWT signing or verification. The default is HS256.

## `verify()`

This function checks if a JWT token is genuine and still valid. It ensures the token hasn't been altered and checks validity only if you added [Payload Validation](#payload-validation).

```ts
verify(
  token: string,
  secret: string,
  alg: 'HS256';
  issuer?: string | RegExp;
  aud?: string | string[] | RegExp;
): Promise<any>;

```

### Example

```ts
import { verify } from 'acrylblends/jwt'

const tokenToVerify = 'token'
const secretKey = 'mySecretKey'

const decodedPayload = await verify(tokenToVerify, secretKey, 'HS256')
console.log(decodedPayload)
```

### Options

<br/>

#### **(required)** token: `string`

The JWT token to be verified.

#### **(required)** secret: `string`

The secret key used for JWT verification or signing.

#### **(required)** alg: [AlgorithmTypes](#supported-algorithmtypes)

The algorithm used for JWT signing or verification.

#### *(optional)* issuer: `string | RegExp`

The expected issuer used for JWT verification.

#### *(optional)* aud: `string | string[] | RegExp`

The expected audience used for JWT verification. If this is set, the token must include an `aud` claim and at least one audience value must match.

## `decode()`

This function decodes a JWT token without performing signature verification. It extracts and returns the header and payload from the token.

```ts
decode(token: string): { header: any; payload: any };
```

### Example

```ts
import { decode } from 'acrylblends/jwt'

// Decode the JWT token
const tokenToDecode =
  'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAidXNlcjEyMyIsICJyb2xlIjogImFkbWluIn0.JxUwx6Ua1B0D1B0FtCrj72ok5cm1Pkmr_hL82sd7ELA'

const { header, payload } = decode(tokenToDecode)

console.log('Decoded Header:', header)
console.log('Decoded Payload:', payload)
```

### Options

<br/>

#### **(required)** token: `string`

The JWT token to be decoded.

> The `decode` function allows you to inspect the header and payload of a JWT token _**without**_ performing verification. This can be useful for debugging or extracting information from JWT tokens.

## Payload Validation

When verifying a JWT token, the following payload validations are performed:

- `exp`: The token is checked to ensure it has not expired.
- `nbf`: The token is checked to ensure it is not being used before a specified time.
- `iat`: The token is checked to ensure it is not issued in the future.
- `iss`: The token is checked to ensure it has been issued by a trusted issuer.
- `aud`: The token is checked to ensure it is intended for an accepted audience when the `aud` verification parameter is set.

Please ensure that your JWT payload includes these fields, as an object, if you intend to perform these checks during verification.

## Custom Error Types

The module also defines custom error types to handle JWT-related errors.

- `JwtAlgorithmNotImplemented`: Indicates that the requested JWT algorithm is not implemented.
- `JwtTokenInvalid`: Indicates that the JWT token is invalid.
- `JwtTokenNotBefore`: Indicates that the token is being used before its valid date.
- `JwtTokenExpired`: Indicates that the token has expired.
- `JwtTokenIssuedAt`: Indicates that the "iat" claim in the token is incorrect.
- `JwtTokenIssuer`: Indicates that the "iss" claim in the token is incorrect.
- `JwtPayloadRequiresAud`: Indicates that an `aud` claim is required when `aud` verification is configured.
- `JwtTokenAudience`: Indicates that the token's `aud` claim does not match the expected audience.
- `JwtTokenSignatureMismatched`: Indicates a signature mismatch in the token.

## Supported AlgorithmTypes

The module supports the following JWT cryptographic algorithms:

- `HS256`: HMAC using SHA-256
- `HS384`: HMAC using SHA-384
- `HS512`: HMAC using SHA-512
- `RS256`: RSASSA-PKCS1-v1_5 using SHA-256
- `RS384`: RSASSA-PKCS1-v1_5 using SHA-384
- `RS512`: RSASSA-PKCS1-v1_5 using SHA-512
- `PS256`: RSASSA-PSS using SHA-256 and MGF1 with SHA-256
- `PS384`: RSASSA-PSS using SHA-386 and MGF1 with SHA-386
- `PS512`: RSASSA-PSS using SHA-512 and MGF1 with SHA-512
- `ES256`: ECDSA using P-256 and SHA-256
- `ES384`: ECDSA using P-384 and SHA-384
- `ES512`: ECDSA using P-521 and SHA-512
- `EdDSA`: EdDSA using Ed25519
