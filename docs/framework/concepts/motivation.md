# Motivation

ACRYL runs on three surfaces (Web, Electron Desktop, terminal UI) over an agent engine that moves fast. The goal is one small thing a person can hold
in their head: Cordis as the only lifecycle, React kept for graphical UI, and a handful of services every surface uses the same way.

The shape: handlers on Web-standard Request and Response, plus middleware. It is the smallest widely understood shape for HTTP, it needs no runtime of its
own, and its API is learnable in an evening. ACRYL adds the one thing that makes it fit Cordis: the unit is a plugin, so a route, a mount, a cell or a stream
disappears when its owner unloads.

Not chosen: a page framework (Next.js, Vike) as the base. They own the build and the server; ACRYL already has those. A page layer can be added later as
one more plugin. Measurements and the full comparison: `specs/046-.../research.md`.
