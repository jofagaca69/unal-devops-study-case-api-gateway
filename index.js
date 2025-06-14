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
  console.log(`\n--- INICIO PETICIÓN ---`);
  console.log(`Método: ${req.method}`);
  console.log(`Ruta: ${req.originalUrl}`);
  console.log(`Body:`, req.body);
  try {
    const email = req.body?.email || req.query?.email || req.headers['x-user-email'];

    if (!email) {
      console.log('Falta el email del usuario');
      return res.status(400).json({ error: 'Falta el email del usuario' });
    }

    // 1. Verificar en on-premise
    const checkOnPrem = await axios.post(`${ONPREM_BASE_URL}/checkUser`, { email });
    if (checkOnPrem.data.exists === true) {
      const response = await axios({
        method: req.method,
        url: `${ONPREM_BASE_URL}${req.originalUrl}`,
        headers: req.headers,
        data: req.body,
        validateStatus: () => true
      });
      console.log('--- FIN PETICIÓN (on-premise) ---\n');
      return res.status(response.status).set(response.headers).send(response.data);
    }

    // 2. Verificar en GCP
    const checkGCP = await axios.post(`${GCP_BASE_URL}/checkUser`, { email });
    if (checkGCP.data.exists === true) {
      const response = await axios({
        method: req.method,
        url: `${GCP_BASE_URL}${req.originalUrl}`,
        headers: req.headers,
        data: req.body,
        validateStatus: () => true
      });
      console.log('--- FIN PETICIÓN (GCP) ---\n');
      return res.status(response.status).set(response.headers).send(response.data);
    }

    console.log('Usuario no encontrado en ningún backend');
    return res.status(404).json({ error: 'Usuario no encontrado en ningún backend' });

  } catch (err) {
    if (err.response) {
      console.log('Error de backend:', err.response.status, err.response.data);
      res.status(err.response.status).json(err.response.data);
    } else {
      console.log('Error interno en el gateway:', err.message);
      res.status(500).json({ error: 'Error interno en el gateway', message: err.message });
    }
    console.log('--- FIN PETICIÓN (con error) ---\n');
  }
});

// Inicia el servidor
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`API Gateway escuchando en puerto ${PORT}`);
});
