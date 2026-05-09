const HOSTBUDDY_AI_CONTEXT = `You are helping update an existing HostBuddy project. HostBuddy is a desktop app that runs AI-generated HTML and React applications locally.

## OUTPUT FORMAT REQUIREMENTS
Provide code in ONE of these formats:

**Option 1: HTML (for simple apps)**
- A complete, self-contained HTML document
- Include all CSS in <style> tags and JavaScript in <script> tags
- Reference attached files by filename only (e.g. \`<img src="logo.png">\`) — HostBuddy resolves them at runtime

**Option 2: React (for interactive apps)**
- A single .tsx or .jsx file with a default export
- Format: \`export default function App() { return (...) }\`
- You can import from npm packages (react, react-dom, lucide-react, recharts)
- You can import UI primitives via \`@/components/ui/*\` (Button, Card, Input, Textarea, Label, Tabs, Switch)

## FILE ATTACHMENTS
- HTML projects support attached files: images (PNG, JPEG, GIF, WEBP, SVG), CSS, and JS
- Reference attached files simply by filename in your HTML/CSS: \`<img src="logo.png">\`, \`<link href="styles.css">\`
- HostBuddy automatically converts these references to data: URIs at runtime — do NOT use external URLs or CDNs
- Binary assets (images) are listed in context for reference only; text assets (CSS, JS, SVG, JSON) are shown in full

## ARCHITECTURE CONSTRAINTS
- Must be CLIENT-SIDE ONLY - no backend servers or API endpoints
- Use localStorage or IndexedDB for data persistence
- All functionality must work offline after initial load
- No external URLs or CDN links - all assets must be inline or attached

## STYLING
- For HTML: Use inline styles or <style> tags
- For React: Tailwind classes work via Twind runtime

## IMPORTANT
- Preserve any existing functionality unless explicitly asked to remove it
- Maintain the same code format (HTML or React) as the original
- Output the COMPLETE updated code, not just the changes
- If the project has attachments, reference them by filename as before`;

const TEXT_ATTACHMENT_EXTS = /\.(css|js|jsx|tsx|json|svg)$/i;

function _extLang(filename) {
  const ext = (filename.match(/\.(\w+)$/) || [])[1] || '';
  const map = { css: 'css', js: 'javascript', jsx: 'jsx', tsx: 'tsx', json: 'json', svg: 'xml' };
  return map[ext.toLowerCase()] || ext.toLowerCase();
}

function buildAiContextMarkdown(project) {
  const lines = [];
  lines.push(`# HostBuddy Project: ${project.title || 'Untitled'}\n`);

  if (project.description) {
    lines.push(`## Project Description\n\n${project.description}\n`);
  }

  lines.push(`## HostBuddy Context\n\n${HOSTBUDDY_AI_CONTEXT}\n`);

  lines.push(`## Project Files\n`);
  const mainFile = project.mainFile || 'index.html';
  lines.push(`### ${mainFile} (main entry)\n\n\`\`\`html\n${project.code || ''}\n\`\`\`\n`);

  const textAtts = [];
  const binaryAtts = [];

  for (const att of (project.attachments || [])) {
    if (TEXT_ATTACHMENT_EXTS.test(att.filename)) {
      const match = att.data && att.data.match(/^data:[^;]*;base64,(.*)$/);
      if (match) {
        try {
          const content = Buffer.from(match[1], 'base64').toString('utf8');
          textAtts.push({ filename: att.filename, content });
        } catch (_) { binaryAtts.push(att); }
      } else {
        binaryAtts.push(att);
      }
    } else {
      binaryAtts.push(att);
    }
  }

  for (const f of textAtts) {
    lines.push(`### ${f.filename}\n\n\`\`\`${_extLang(f.filename)}\n${f.content}\n\`\`\`\n`);
  }

  if (binaryAtts.length > 0) {
    lines.push(`## Binary Assets (reference by filename, do not modify)\n`);
    for (const att of binaryAtts) {
      lines.push(`- ${att.filename} (${att.mimeType || 'application/octet-stream'})`);
    }
    lines.push('');
  }

  lines.push(`## Response Format\n`);
  lines.push(`Provide the complete updated code for each file, clearly labeled with the filename.`);
  lines.push(`If adding new files, indicate they are new.`);
  lines.push(`Maintain the same code format (HTML or React) as the original.\n`);

  return lines.join('\n');
}

module.exports = { HOSTBUDDY_AI_CONTEXT, buildAiContextMarkdown };
