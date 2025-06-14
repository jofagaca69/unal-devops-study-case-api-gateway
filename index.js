const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configuración de CORS
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*', // Permite todos los orígenes por defecto
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-email'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const ONPREM_BASE_URL = process.env.ONPREM_BASE_URL || 'http://35.209.18.19:8080';
const GCP_BASE_URL = process.env.GCP_BASE_URL || 'http://localhost:3001';

app.all('*', async (req, res) => {
  try {
    const email = req.body?.email || req.query?.email || req.headers['x-user-email'];

    if (!email) {
      return res.status(400).json({ error: 'Falta el email del usuario' });
    }

    const check = await axios.post(`${ONPREM_BASE_URL}/checkUser`, { email });
    const userExistsOnPrem = check.data.exists === true;

    const baseUrl = userExistsOnPrem ? ONPREM_BASE_URL : GCP_BASE_URL;
    const targetUrl = `${baseUrl}${req.path}`;

    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: req.headers,
      data: req.body,
      validateStatus: () => true
    });

    res.status(response.status).set(response.headers).send(response.data);

  } catch (err) {
    if (err.response) {
      // El backend respondió con un error (4xx, 5xx)
      res.status(err.response.status).json(err.response.data);
    } else {
      // Error de red u otro error inesperado
      res.status(500).json({ error: 'Error interno en el gateway', message: err.message });
    }
  }
});

// Inicia el servidor
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`API Gateway escuchando en puerto ${PORT}`);
});
