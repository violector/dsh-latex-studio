const fs = require('node:fs');
const archive = process.env.DSH_ASAR || 'D:/Deepseek_harness/resources/app.asar';
const fd = fs.openSync(archive, 'r');
const prefix = Buffer.alloc(16);
fs.readSync(fd, prefix, 0, 16, 0);
const headerSize = prefix.readUInt32LE(4);
const jsonSize = prefix.readUInt32LE(12);
const bytes = Buffer.alloc(jsonSize);
fs.readSync(fd, bytes, 0, jsonSize, 16);
const header = JSON.parse(bytes.toString());
const files = [];
function walk(entries, parent = '') {
  for (const [name, entry] of Object.entries(entries)) {
    const key = parent ? `${parent}/${name}` : name;
    if (entry.files) walk(entry.files, key);
    else files.push({ key, ...entry });
  }
}
walk(header.files);
const [mode, pattern, destination] = process.argv.slice(2);
if (mode === 'list') {
  console.log(files.filter(x => new RegExp(pattern).test(x.key)).map(x => x.key).join('\n'));
} else {
  const entry = files.find(x => x.key === pattern);
  if (!entry) throw new Error(`Archive entry missing: ${pattern}`);
  const result = Buffer.alloc(entry.size);
  fs.readSync(fd, result, 0, entry.size, 8 + headerSize + Number(entry.offset));
  if (destination) fs.writeFileSync(destination, result);
  else process.stdout.write(result);
}
fs.closeSync(fd);
