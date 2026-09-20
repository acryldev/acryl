---
name: acryl-remove-extension
description: Use when the user asks to remove, delete, disable or undo an extension or UI element you or they installed.
---
# Remove an extension

Call acryl_list_plugins to find the exact package name (never guess it). Call acryl_remove_plugin with that name: it
unmounts the plugin live and removes it from the profile. Client plugins vanish after a page or window reload: tell the
user. The source folder under .acryl-extensions/<name>/ is left in place so the user can reinstall it; delete it only if
they ask. Confirm with acryl_list_plugins that it is gone before saying so. If the user only wants it hidden for now,
say that removal keeps the sources.
