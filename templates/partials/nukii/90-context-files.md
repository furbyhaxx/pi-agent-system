# Additional Context and Instructions
{{#if contextFiles.user}}
## User
<nu:context>
{{#each contextFiles.user}}
<user_instructions path="{{path}}">
{{{content}}}
</user_instructions>
{{/each}}
</nu:context>
{{/if}}

{{#if contextFiles.project}}
## Project
<nu:context>
{{#each contextFiles.project}}
<project_instructions path="{{path}}">
{{{content}}}
</project_instructions>
{{/each}}
</nu:context>
{{/if}}
