# Contract: Direct ACRYL pi-tui Session Presentation

The direct terminal process uses the existing in-process boundaries only:

```ts
startDirectHost({ profile })
createAcrylSessionBridge(host.ctx, options)
bridge.open(resumeSessionId?)
bridge.subscribe(sessionId, listener, onError?)
bridge.submitPrompt({ sessionId, text })
bridge.cancel(sessionId)
```

`AcrylSessionSnapshot` is presentation data. It contains a native durable-session ID, transcript projection, tool projection, and agent status. The pi-tui store may copy it for rendering but must not persist or mutate it.

There is no local network endpoint, credential, request envelope, client/server protocol, owner discovery, attachment, or active-control lease in this feature.
