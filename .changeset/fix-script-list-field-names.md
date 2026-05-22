---
"@sawala/kodena": patch
"@sawala/kodena-mcp": patch
---

Fix `script list` printing `undefined` for slug, URL, and updated timestamp. The backend serialises `GET /kodena/scripts` rows in snake_case (`script_slug`, `org_handle`, `tenant_subdomain`, `custom_hostname`, `modified_on`); both the CLI command and the MCP `kodena_list_scripts` tool were reading camelCase fields and every value rendered as `undefined`. Public URL now uses the derived `tenant_subdomain` directly (always present), with `custom_hostname` still taking precedence.
