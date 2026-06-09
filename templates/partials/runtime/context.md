# Runtime Context

Current date: {{runtime.date}}
Current working directory: {{runtime.cwd}}
{{#if runtime.mode}}
Mode: {{default runtime.modeDisplay runtime.mode}}
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
Context usage: {{runtime.contextUsageDisplay.tokens}} / {{runtime.contextUsageDisplay.contextWindow}} tokens ({{runtime.contextUsageDisplay.percent}})
{{#if session}}
{{#if (or session.name session.id)}}
Session: {{default session.name session.id}}{{#if session.id}} (`{{session.id}}`){{/if}}
{{/if}}
{{/if}}
