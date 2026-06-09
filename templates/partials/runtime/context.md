# Runtime Context

Current date: {{runtime.date}}
Current working directory: {{runtime.cwd}}
{{#if runtime.mode}}
Mode: {{runtime.mode}}
{{/if}}
{{#if runtime.thinkingLevel}}
Thinking level: {{runtime.thinkingLevel}}
{{/if}}
{{#if model}}
{{#if (or model.name model.id)}}
Model: {{default model.name model.id}}{{#if model.id}} (`{{model.id}}`){{/if}}
{{/if}}
{{#if model.provider}}
Provider: {{model.provider}}
{{/if}}
{{/if}}
{{#if runtime.contextUsage}}
Context usage: {{runtime.contextUsage.tokens}} / {{runtime.contextUsage.contextWindow}} tokens ({{runtime.contextUsage.percent}})
{{/if}}
{{#if session}}
{{#if (or session.name session.id)}}
Session: {{default session.name session.id}}{{#if session.id}} (`{{session.id}}`){{/if}}
{{/if}}
{{/if}}
Pi package: {{pi.packageName}} {{pi.version}}
