// `acryl --help`: every command, in the order a person meets them. Also printed by a bare `acryl` that has no terminal (an agent or a script).

export const HELP = `ACRYL: everything is a plugin. Build agentic apps.

ACRYL Control Center
  acryl                       in this terminal (same as acryl --tui)
  acryl --tui                 in this terminal: your apps, the Blends store, sharing, GitHub, the model key
  acryl --gui [--update]      in its own window (the installed app, else the Blend in ~/.acryl/control-center)
  acryl --web [--update]      in your browser (the same Blend; the browser opens at its address)

Apps
  acryl apps                  list the apps on this computer
  acryl apps add <folder>     put an app folder in the list
  acryl apps remove <id>      take an app out of the list (the folder stays)
  acryl new <name> [starter]  make an app from a starter (blank, nodejs, notes, chat, todo, agent)
  acryl make <name> --from <id>
                              make an app from a Blend in the store (acryl store lists them)
  acryl store [words]         list the Blends in the store: id, name, category, Official or Community
  acryl update                in an app folder: the newest frame and library plugins (acrylblends upgrade)
  acryl plugin <verb> ...     in an app folder: publish or pull a plugin (acryl plugin publish <name>)
  acryl blends <command> ...  the acrylblends command (add, upgrade, open, preflight, ...)

Agents and keys
  acryl ade [--web|--gui|--tui]
                              ACRYL ADE, the agent development environment (browser, window, or the terminal agent)
  acryl model [set deepseek | set orcarouter | clear]
                              the model key every app started from ACRYL gets (asked for, never shown)

  acryl --version             this package's version
  acryl --help                this help

Everything ACRYL keeps is in ~/.acryl; new apps go in ~/ACRYL. https://acryl.dev
`
