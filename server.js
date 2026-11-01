/* FOOTYHUB server (no dependencies).
   1. Serves the website files.
   2. Receives form submissions at POST /api/contact, /api/newsletter, /api/orders,
      validates them again on the server, and saves them to JSON files in ./data
   Run with:  node server.js   (then open http://localhost:3000) */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const PORT = process.env.PORT || 3000;
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon'
};
const HIDDEN = new Set(['server.js', 'package.json', 'data']); // never served to the browser

/* ---------- small helpers ---------- */
const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
};
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- validation: one function per form ----------
   each returns { data, errors }; errors is empty when the submission is valid */
const FORMS = {
    contact(b) {
        const data = { firstName: str(b.firstName, 60), lastName: str(b.lastName, 60), email: str(b.email, 120), topic: str(b.topic, 60), message: str(b.message, 2000) };
        const errors = {};
        if (data.firstName.length < 2) errors.firstName = 'Enter your first name.';
        if (!data.lastName) errors.lastName = 'Enter your last name.';
        if (!EMAIL.test(data.email)) errors.email = 'Enter a valid email.';
        if (!data.topic) errors.topic = 'Choose a topic.';
        if (data.message.length < 10) errors.message = 'Message must be at least 10 characters.';
        return { data, errors };
    },
    newsletter(b) {
        const data = { email: str(b.email, 120) };
        return { data, errors: EMAIL.test(data.email) ? {} : { email: 'Enter a valid email.' } };
    },
    orders(b) {
        const c = b.customer || {}, p = b.payment || {}, t = b.totals || {};
        const customer = { name: str(c.name, 80), email: str(c.email, 120), phone: str(c.phone, 10), address: str(c.address, 200), city: str(c.city, 60), pin: str(c.pin, 6) };
        const payment = { method: str(p.method, 4) };
        const errors = {};
        if (customer.name.length < 2) errors.name = 'Enter your name.';
        if (!EMAIL.test(customer.email)) errors.email = 'Enter a valid email.';
        if (!/^[6-9]\d{9}$/.test(customer.phone)) errors.phone = 'Enter a 10-digit mobile number.';
        if (customer.address.length < 8) errors.address = 'Enter your address.';
        if (customer.city.length < 2) errors.city = 'Enter your city.';
        if (!/^[1-9]\d{5}$/.test(customer.pin)) errors.pin = 'Enter a 6-digit PIN code.';
        if (!['cod', 'upi', 'card'].includes(payment.method)) errors.payment = 'Choose a payment method.';
        if (payment.method === 'upi') {
            payment.upi = str(p.upi, 60);
            if (!/^[A-Za-z0-9.\-_]{2,}@[A-Za-z]{2,}$/.test(payment.upi)) errors.upi = 'Enter a valid UPI ID.';
        }
        if (payment.method === 'card') {            // only the last 4 digits are ever saved
            payment.cardLast4 = str(p.cardLast4, 4);
            if (!/^\d{4}$/.test(payment.cardLast4)) errors.card = 'Invalid card.';
        }
        const items = (Array.isArray(b.items) ? b.items : []).slice(0, 50).map(i => ({
            id: str(i.id, 40), name: str(i.name, 100), size: i.size ? str(i.size, 10) : null, qty: Number(i.qty), price: Number(i.price)
        }));
        if (!items.length || items.some(i => !i.id || !(i.qty >= 1 && i.qty <= 10) || !(i.price > 0))) errors.items = 'Your cart is empty or invalid.';
        const totals = { subtotal: Number(t.subtotal), discount: Number(t.discount), shipping: Number(t.shipping), total: Number(t.total) };
        if (Object.values(totals).some(n => !Number.isFinite(n) || n < 0)) errors.totals = 'Invalid totals.';
        return { data: { customer, payment, items, totals, promo: b.promo ? str(b.promo, 20) : null }, errors };
    }
};

/* ---------- saving to JSON files ----------
   Requests are handled one at a time (queue) so two submissions can never overwrite each other. */
let queue = Promise.resolve();
const save = (name, build) => {
    const run = queue.then(async () => {
        const file = path.join(DATA, name + '.json');
        let list = [];
        try { list = JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; } // a damaged file is never overwritten
        if (!Array.isArray(list)) list = [];
        const result = build(list);
        if (result.record) {
            list.push(result.record);
            await fs.promises.writeFile(file + '.tmp', JSON.stringify(list, null, 2));
            await fs.promises.rename(file + '.tmp', file);   // swap in the finished file in one step
        }
        return result;
    });
    queue = run.catch(() => {});
    return run;
};
const BUILDERS = {
    contact: data => list => ({ record: { id: list.length + 1, submittedAt: new Date().toISOString(), ...data }, message: 'Thanks! We’ll get back to you within one business day.' }),
    newsletter: data => list => list.some(r => r.email.toLowerCase() === data.email.toLowerCase())
        ? { message: 'You’re already subscribed. Thanks!' }
        : { record: { id: list.length + 1, submittedAt: new Date().toISOString(), ...data }, message: 'You’re subscribed. Welcome to the club!' },
    orders: data => list => {
        const orderId = 'FH' + (1001 + list.length);
        return { record: { orderId, submittedAt: new Date().toISOString(), ...data }, orderId };
    }
};

/* ---------- POST /api/<form> ---------- */
const handleApi = (req, res, name) => {
    if (req.method !== 'POST' || !FORMS[name]) return send(res, 404, { ok: false, error: 'Not found.' });
    let body = '';
    req.on('data', chunk => {
        body += chunk;
        if (body.length > 50000) { send(res, 413, { ok: false, error: 'Request too large.' }); req.destroy(); }
    });
    req.on('end', async () => {
        let json;
        try { json = JSON.parse(body); } catch { return send(res, 400, { ok: false, error: 'Invalid data.' }); }
        const { data, errors } = FORMS[name](json || {});
        if (Object.keys(errors).length) return send(res, 400, { ok: false, error: 'Please check the form and try again.', errors });
        try {
            const result = await save(name, BUILDERS[name](data));
            send(res, 201, { ok: true, message: result.message, orderId: result.orderId });
        } catch (err) {
            console.error(err);
            send(res, 500, { ok: false, error: 'Could not save your data. Please try again.' });
        }
    });
};

/* ---------- static files ---------- */
const serveFile = (req, res, pathname) => {
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    const top = rel.split(/[\\/]/)[0];
    if (!file.startsWith(ROOT + path.sep) || HIDDEN.has(top) || top.startsWith('.')) { res.writeHead(404); return res.end('Not found'); }
    fs.stat(file, (err, stat) => {
        if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
};

http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) return handleApi(req, res, pathname.slice(5));
    serveFile(req, res, pathname);
}).listen(PORT, () => {
    fs.mkdirSync(DATA, { recursive: true });
    ['contact', 'newsletter', 'orders'].forEach(n => {
        const f = path.join(DATA, n + '.json');
        if (!fs.existsSync(f)) fs.writeFileSync(f, '[]');
    });
    console.log(`FOOTYHUB running at http://localhost:${PORT}`);
    console.log('Form submissions are saved in the data/ folder.');
});
