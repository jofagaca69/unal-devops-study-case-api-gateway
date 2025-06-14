const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configuración de CORS
const corsOptions = {
  origin: '*', // Permite todos los orígenes por defecto
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-email', 'Origin', 'Accept'],
  exposedHeaders: ['Content-Type', 'Authorization', 'x-user-email'],
  credentials: true,
  maxAge: 86400 // 24 horas
};

app.use(cors(corsOptions));

// Middleware para manejar preflight requests
app.options('*', cors(corsOptions));

app.use(express.json());

// Asegurarse de que las URLs usen HTTPS
const ONPREM_BASE_URL = process.env.ONPREM_BASE_URL || 'https://35.209.18.19:8080';
const GCP_BASE_URL = process.env.GCP_BASE_URL || 'https://35.209.18.19:8080';

// Función para propagar headers relevantes
const propagateHeaders = (sourceHeaders) => {
  const headersToPropagate = [
    'content-type',
    'authorization',
    'x-user-email',
    'x-request-id',
    'x-correlation-id'
  ];
  
  return headersToPropagate.reduce((acc, header) => {
    if (sourceHeaders[header]) {
      acc[header] = sourceHeaders[header];
    }
    return acc;
  }, {});
};

app.all('*', async (req, res) => {
  try {
    const email = req.body?.email || req.query?.email || req.headers['x-user-email'];

    if (!email) {
      return res.status(400).json({ 
        error: 'Falta el email del usuario',
        status: 400,
        message: 'Falta el email del usuario'
      });
    }

    // Primero verificar en onpremise
    let baseUrl;
    try {
      const onPremCheck = await axios.post(`${ONPREM_BASE_URL}/checkUser`, { email });
      if (onPremCheck.data.exists === true) {
        baseUrl = ONPREM_BASE_URL;
      } else {
        // Si no existe en onpremise, verificar en GCP
        const gcpCheck = await axios.post(`${GCP_BASE_URL}/checkUser`, { email });
        if (gcpCheck.data.exists === true) {
          baseUrl = GCP_BASE_URL;
        } else {
          return res.status(404).json({
            error: 'Usuario no encontrado',
            status: 404,
            message: 'El usuario no existe en ningún ambiente'
          });
        }
      }
    } catch (checkError) {
      console.error('Error al verificar usuario:', checkError.message);
      return res.status(500).json({
        error: 'Error al verificar el usuario',
        status: 500,
        message: 'Error al verificar la existencia del usuario'
      });
    }

    const targetUrl = `${baseUrl}${req.path}`;

    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: propagateHeaders(req.headers),
      data: req.body,
      validateStatus: () => true
    });

    // Propagar todos los headers de la respuesta
    Object.entries(response.headers).forEach(([key, value]) => {
      res.set(key, value);
    });

    // Mantener el formato de respuesta consistente
    const responseData = response.data;
    if (typeof responseData === 'object') {
      responseData.status = response.status;
    }

    res.status(response.status).json(responseData);

  } catch (err) {
    console.error('Error en el gateway:', err.message);
    
    // Si el error viene del backend, propagar su mensaje
    if (err.response) {
      return res.status(err.response.status).json({
        error: err.response.data.error || 'Error en el servidor',
        status: err.response.status,
        message: err.response.data.message || err.response.data.error || 'Error en el servidor'
      });
    }

    // Error interno del gateway
    res.status(500).json({
      error: 'Error interno en el gateway',
      status: 500,
      message: 'Error interno en el gateway'
    });
  }
});

// Inicia el servidor en el puerto que Cloud Run espera
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API Gateway escuchando en puerto ${PORT}`);
});
