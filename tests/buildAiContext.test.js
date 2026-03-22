const { buildAiContextMarkdown } = require('../src/main/ipc');

describe('buildAiContextMarkdown', () => {
  test('includes project title and main code', () => {
    const md = buildAiContextMarkdown({
      title: 'My App',
      code: '<h1>Hello World</h1>',
    });

    expect(md).toContain('# HostBuddy Project: My App');
    expect(md).toContain('<h1>Hello World</h1>');
    expect(md).toContain('### index.html (main entry)');
  });

  test('includes project description when present', () => {
    const md = buildAiContextMarkdown({
      title: 'Described',
      description: 'A todo list application',
      code: '<p>App</p>',
    });

    expect(md).toContain('## Project Description');
    expect(md).toContain('A todo list application');
  });

  test('omits description section when empty', () => {
    const md = buildAiContextMarkdown({
      title: 'No Desc',
      code: '<p>App</p>',
    });

    expect(md).not.toContain('## Project Description');
  });

  test('includes HostBuddy context constraints', () => {
    const md = buildAiContextMarkdown({ title: 'T', code: '<p>X</p>' });

    expect(md).toContain('## HostBuddy Context');
    expect(md).toContain('CLIENT-SIDE ONLY');
    expect(md).toContain('OUTPUT FORMAT REQUIREMENTS');
  });

  test('decodes and includes text-based CSS attachments', () => {
    const cssContent = 'body { color: red; }';
    const cssBase64 = Buffer.from(cssContent).toString('base64');
    const md = buildAiContextMarkdown({
      title: 'Styled',
      code: '<link rel="stylesheet" href="styles.css">',
      attachments: [
        { filename: 'styles.css', mimeType: 'text/css', data: `data:text/css;base64,${cssBase64}` },
      ],
    });

    expect(md).toContain('### styles.css');
    expect(md).toContain('```css');
    expect(md).toContain('body { color: red; }');
  });

  test('decodes and includes text-based JS attachments', () => {
    const jsContent = 'console.log("hello");';
    const jsBase64 = Buffer.from(jsContent).toString('base64');
    const md = buildAiContextMarkdown({
      title: 'Scripted',
      code: '<script src="app.js"></script>',
      attachments: [
        { filename: 'app.js', mimeType: 'application/javascript', data: `data:application/javascript;base64,${jsBase64}` },
      ],
    });

    expect(md).toContain('### app.js');
    expect(md).toContain('```javascript');
    expect(md).toContain('console.log("hello");');
  });

  test('lists binary image attachments by filename', () => {
    const md = buildAiContextMarkdown({
      title: 'With Images',
      code: '<img src="logo.png">',
      attachments: [
        { filename: 'logo.png', mimeType: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=' },
        { filename: 'bg.jpg', mimeType: 'image/jpeg', data: 'data:image/jpeg;base64,/9j/4AAQ=' },
      ],
    });

    expect(md).toContain('## Binary Assets');
    expect(md).toContain('- logo.png (image/png)');
    expect(md).toContain('- bg.jpg (image/jpeg)');
  });

  test('handles multi-file project with mixed attachments', () => {
    const cssContent = '.app { display: flex; }';
    const jsContent = 'export default function init() {}';
    const cssBase64 = Buffer.from(cssContent).toString('base64');
    const jsBase64 = Buffer.from(jsContent).toString('base64');

    const md = buildAiContextMarkdown({
      title: 'Full Project',
      description: 'A complete multi-file project',
      code: '<!DOCTYPE html><html><body></body></html>',
      mainFile: 'index.html',
      attachments: [
        { filename: 'styles.css', mimeType: 'text/css', data: `data:text/css;base64,${cssBase64}` },
        { filename: 'main.js', mimeType: 'application/javascript', data: `data:application/javascript;base64,${jsBase64}` },
        { filename: 'hero.png', mimeType: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=' },
      ],
    });

    expect(md).toContain('### index.html (main entry)');
    expect(md).toContain('### styles.css');
    expect(md).toContain('.app { display: flex; }');
    expect(md).toContain('### main.js');
    expect(md).toContain('export default function init() {}');
    expect(md).toContain('- hero.png (image/png)');
    expect(md).toContain('## Response Format');
  });

  test('uses mainFile name when provided', () => {
    const md = buildAiContextMarkdown({
      title: 'Custom Main',
      code: '<p>Custom</p>',
      mainFile: 'app.html',
    });

    expect(md).toContain('### app.html (main entry)');
  });

  test('includes response format instructions', () => {
    const md = buildAiContextMarkdown({ title: 'T', code: '<p>X</p>' });

    expect(md).toContain('## Response Format');
    expect(md).toContain('complete updated code');
  });

  test('handles project with no attachments', () => {
    const md = buildAiContextMarkdown({
      title: 'Simple',
      code: '<h1>Simple</h1>',
      attachments: [],
    });

    expect(md).not.toContain('## Binary Assets');
    expect(md).toContain('### index.html (main entry)');
    expect(md).toContain('<h1>Simple</h1>');
  });
});
