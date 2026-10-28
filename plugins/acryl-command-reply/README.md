# acryl-command-reply

Shows a host command's reply on the Web and Desktop start page (spec 049 T002).

DeepSeek Harness draws a command's reply as a node in the conversation. The conversation is not drawn while a session is blank, which is
the start page before the first prompt, so a command run there (`/reload new`, a plugin's own command) was answered and nothing showed.

While the session is blank, this plugin shows the reply as the composer notice: the line under the composer that already shows a command
the composer refused. An error reply shows as an error notice. Once the conversation is drawn, the reply node shows the reply and this
plugin shows nothing, so no reply appears twice. Whether the session is blank is DSH's own `conversationPhase`, the same rule that decides
when the start page is shown.

- Row: `acryl-command-reply`, Blueprint row id `command-reply`, in `acryl.blank` and so in every built-in Blueprint; Web and Desktop.
- Client: listens to `command/executed`; injects `sessions`, `conversation` and `uiConversation`. Nothing is registered, so unloading the
  plugin only removes the listener.
- Host: an empty module, so the Loader row has something to activate.
