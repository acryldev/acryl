# Motivation

ACRYL runs on three surfaces (Web, Electron Desktop, terminal UI) over an agent engine that moves fast. The goal is one small thing a person can hold
in their head: Cordis as the only lifecycle, React kept for graphical UI, and a handful of services every surface uses the same way.

Why Hono's design: it is the smallest widely understood shape for "handlers on Web-standard Request and Response, plus middleware". It has no runtime of
its own, its API is learnable in an evening, and its docs set the structure people expect (getting started, concepts, API, guides, middleware, helpers).
ACRYL keeps that shape and changes one thing: the unit is a Cordis plugin, so a route, a mount, a cell or a stream disappears when its owner unloads.

Not chosen: a page framework (Next.js, Vike) as the base. They own the build and the server; ACRYL already has those. A page layer can be added later as
one more plugin. Measurements and the full comparison: `specs/046-.../research.md`.
