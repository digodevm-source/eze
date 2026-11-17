// Tiny static server for the render page
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname;
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.woff':'font/woff', '.png':'image/png', '.jpg':'image/jpeg', '.json':'application/json', '.wav':'audio/wav', '.mp3':'audio/mpeg' };
function start(port = 0) {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(root)) { resp.writeHead(403); return resp.end(); }
      fs.readFile(p, (err, data) => {
        if (err) { resp.writeHead(404); return resp.end('nf'); }
        resp.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
        resp.end(data);
      });
    });
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
}
module.exports = { start };
if (require.main === module) start(8123).then(() => console.log('http://127.0.0.1:8123'));
