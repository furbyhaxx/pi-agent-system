# Tool Usage Guidelines

{{#if tools.activeDetails}}
{{#each tools.activeDetails}}
## `{{name}}`
{{#if description}}
{{description}}
{{/if}}
{{#if promptGuidelines}}
{{#each promptGuidelines}}
- {{{this}}}
{{/each}}
{{else}}
No additional tool-specific guidelines were provided.
{{/if}}

{{/each}}
{{else}}
No Pi tools are active for this session.
{{/if}}
