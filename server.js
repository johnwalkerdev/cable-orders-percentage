const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
require('dotenv').config();

const pool = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;
const MAIN_DASHBOARD_SLUG = '90kKDLKJAlkafslhadsf';

const cache = {
  allLogins: null,
  loginsBySlug: new Map(),
  cacheTime: 0,
  TTL: 5000,
};

app.use(compression());
app.use(cors());
app.use(express.json());
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,
    maxAge: '1d',
    etag: true,
    lastModified: true,
  })
);

app.get('/api/logins', async (req, res) => {
  const now = Date.now();
  if (cache.allLogins && now - cache.cacheTime < cache.TTL) {
    res.set('X-Cache', 'HIT');
    return res.json(cache.allLogins);
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, login, slug, on_turf AS "onTurf", off_turf AS "offTurf", updated_at AS "updatedAt" FROM logins ORDER BY login'
    );
    cache.allLogins = rows;
    cache.cacheTime = now;
    res.set('X-Cache', 'MISS');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching logins', error);
    res.status(500).json({ message: 'Erro ao buscar dados.' });
  }
});

app.get('/api/logins/:slug', async (req, res) => {
  const { slug } = req.params;
  const now = Date.now();
  const cached = cache.loginsBySlug.get(slug);
  
  if (cached && now - cached.time < cache.TTL) {
    res.set('X-Cache', 'HIT');
    return res.json(cached.data);
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, login, slug, on_turf AS "onTurf", off_turf AS "offTurf", updated_at AS "updatedAt" FROM logins WHERE slug = $1',
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Login não encontrado.' });
    }

    cache.loginsBySlug.set(slug, { data: rows[0], time: now });
    res.set('X-Cache', 'MISS');
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching login', error);
    res.status(500).json({ message: 'Erro ao buscar dados.' });
  }
});

app.patch('/api/logins/:slug', async (req, res) => {
  const { slug } = req.params;
  const { onTurf, offTurf } = req.body;

  if (
    typeof onTurf !== 'number' ||
    typeof offTurf !== 'number' ||
    Number.isNaN(onTurf) ||
    Number.isNaN(offTurf)
  ) {
    return res.status(400).json({ message: 'Valores inválidos.' });
  }

  try {
    const { rowCount, rows } = await pool.query(
      `UPDATE logins 
       SET on_turf = $1, off_turf = $2, updated_at = NOW() 
       WHERE slug = $3 
       RETURNING id, login, slug, on_turf AS "onTurf", off_turf AS "offTurf", updated_at AS "updatedAt"`,
      [onTurf, offTurf, slug]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Login não encontrado.' });
    }

    cache.allLogins = null;
    cache.loginsBySlug.delete(slug);
    cache.cacheTime = 0;

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating login', error);
    res.status(500).json({ message: 'Erro ao atualizar dados.' });
  }
});

app.get('/', (req, res) => {
  res.redirect(`/${MAIN_DASHBOARD_SLUG}`);
});

app.get(`/${MAIN_DASHBOARD_SLUG}`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.redirect(`/${MAIN_DASHBOARD_SLUG}`);
});

app.get('/login/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

