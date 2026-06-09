# Active Pi Tools

{{#if tools.activeDetails}}
These Pi tools are available in this session:
{{#each tools.activeDetails}}
- `{{name}}`
{{/each}}
{{else}}
No Pi tools are active for this session.
{{/if}}
