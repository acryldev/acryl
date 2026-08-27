# Audit the ACRYL profile runtime closure

Type: research  
Status: open

## Question

Which exact pinned packages must the shared ACRYL Harness Runtime workspace
declare so a standard `@deepseek-ai/dsh-base` profile boots without resolving
modules from `dsh-plugin-desktop` or another sibling package?

The answer must distinguish required runtime packages from test-only and
presentation-only dependencies, and provide a reproducible profile-boot smoke
that proves the closure.
