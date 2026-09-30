const fs = require('fs');
let content = fs.readFileSync('src/pages/AmberAlerts.jsx', 'utf8');

// 1. Remove contact.phone from handleShareAlert template literal
content = content.replace(
  /Contact: \$\{alert\.contact\.phone\}\\n\\n/,
  ''
);

// 2. Replace the window.open tel: button onClick that crashes
content = content.replace(
  /onClick=\{\(\) => window\.open\(`tel:\$\{activeAlert\.contact\.phone\}`\)\}/g,
  'onClick={() => { /* no phone number on field reports */ }}'
);

// 3. Replace activeAlert.contact.phone in JSX text
content = content.replace(/\{activeAlert\.contact\.phone\}/g, '{"—"}');
content = content.replace(/\{activeAlert\.contact\.email\}/g, '{"—"}');

// 4. Make authority.contact.phone access safe
content = content.replace(/\{authority\.contact\.phone\}/g, '{authority?.contact?.phone ?? ""}');

// 5. Guard handleRouteToAlert against missing coordinates
// The function already gets coordinates from alert.coordinates
// but the error path fallback also accesses it — make both safe
content = content.replace(
  'const url = `https://www.google.com/maps/dir/${latitude},${longitude}/${alert.coordinates.lat},${alert.coordinates.lng}`;',
  'if (!alert.coordinates) return; const url = `https://www.google.com/maps/dir/${latitude},${longitude}/${alert.coordinates.lat},${alert.coordinates.lng}`;'
);
content = content.replace(
  'const url = `https://www.google.com/maps?q=${alert.coordinates.lat},${alert.coordinates.lng}`;',
  'if (!alert.coordinates) return; const url = `https://www.google.com/maps?q=${alert.coordinates.lat},${alert.coordinates.lng}`;'
);

fs.writeFileSync('src/pages/AmberAlerts.jsx', content, 'utf8');
console.log('Patched. Lines:', content.split('\n').length);
