# Project Context

{{#if contextFiles.all}}
<project_context>
{{#each contextFiles.all}}
<project_instructions path="{{path}}">
{{{content}}}
</project_instructions>
{{/each}}
</project_context>
{{else}}
No project context files were provided.
{{/if}}
