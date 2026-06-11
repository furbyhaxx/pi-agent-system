# Available Skills

{{#if skills.visible}}
The following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.

<available_skills>
{{#each skills.visible}}
  <skill>
    <name>{{xml name}}</name>
    <description>{{xml description}}</description>
    <location>{{xml filePath}}</location>
  </skill>
{{/each}}
</available_skills>
{{else}}
<available_skills />
{{/if}}
