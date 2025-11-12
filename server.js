const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/logins', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, login, on_turf AS "onTurf", off_turf AS "offTurf", updated_at AS "updatedAt" FROM logins ORDER BY id'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching logins', error);
    res.status(500).json({ message: 'Erro ao buscar dados.' });
  }
});

app.get('/api/logins/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT id, login, on_turf AS "onTurf", off_turf AS "offTurf", updated_at AS "updatedAt" FROM logins WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Login não encontrado.' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching login', error);
    res.status(500).json({ message: 'Erro ao buscar dados.' });
  }
});

app.patch('/api/logins/:id', async (req, res) => {
  const { id } = req.params;
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
       WHERE id = $3 
       RETURNING id, login, on_turf AS "onTurf", off_turf AS "offTurf", updated_at AS "updatedAt"`,
      [onTurf, offTurf, id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Login não encontrado.' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating login', error);
    res.status(500).json({ message: 'Erro ao atualizar dados.' });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

