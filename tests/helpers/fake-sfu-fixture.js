const http = require('http');

const port = Number(process.env.PORT || 0);

const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    if (url.pathname === '/join') {
        const room = url.searchParams.get('room') || '';
        const name = url.searchParams.get('name') || '';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fake SFU</title>
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: linear-gradient(135deg, #101820, #213042);
            color: #f4f6f8;
            font-family: Inter, Arial, sans-serif;
        }
        .shell {
            width: min(92vw, 560px);
            padding: 28px;
            border-radius: 24px;
            background: rgba(255, 255, 255, 0.08);
            box-shadow: 0 18px 60px rgba(0, 0, 0, 0.3);
        }
        .eyebrow {
            font-size: 0.78rem;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            opacity: 0.72;
            margin-bottom: 10px;
        }
        h1 {
            margin: 0 0 10px 0;
            font-size: 1.5rem;
        }
        p {
            margin: 0;
            line-height: 1.55;
            opacity: 0.88;
        }
        .meta {
            margin-top: 16px;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .pill {
            padding: 8px 12px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.1);
            font-size: 0.84rem;
        }
    </style>
</head>
<body>
    <main class="shell" id="fake-sfu-root">
        <div class="eyebrow">Managed Media Fixture</div>
        <h1>Fake SFU Room Ready</h1>
        <p>This fixture simulates the embedded media surface for automated tests.</p>
        <div class="meta">
            <div class="pill" id="fake-sfu-room">Room: ${room}</div>
            <div class="pill" id="fake-sfu-name">Name: ${name}</div>
        </div>
    </main>
</body>
</html>`);
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    console.log(JSON.stringify({ event: 'fake-sfu-start', port: address.port }));
});

function shutdown() {
    server.close(() => {
        process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
