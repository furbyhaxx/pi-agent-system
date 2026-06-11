{{#if appendSystem.present}}
# Appended Instructions

The following instructions were appended to this system prompt from {{appendSystem.count}} source(s). Treat them as authoritative additional guidance.

{{#each appendSystem.entries}}
<nu:append source="{{source}}" kind="{{kind}}">
{{{content}}}
</nu:append>

{{/each}}
{{/if}}
