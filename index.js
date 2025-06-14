const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Función para logging estructurado
const logRequest = (type, data) => {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({
    timestamp,
    type,
    ...data
  }));
};

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
const ONPREM_BASE_URL = process.env.ONPREM_BASE_URL || 'http://35.209.18.19:8080';
const GCP_BASE_URL = process.env.GCP_BASE_URL || 'http://34.42.37.99:8080';

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
  const requestId = Date.now().toString();
  logRequest('INCOMING_REQUEST', {
    requestId,
    method: req.method,
    path: req.path,
    email: req.body?.email || req.query?.email || req.headers['x-user-email'],
    headers: req.headers
  });

  try {
    const email = req.body?.email || req.query?.email || req.headers['x-user-email'];

    if (!email) {
      logRequest('VALIDATION_ERROR', {
        requestId,
        error: 'Email no proporcionado'
      });
      return res.status(400).json({ 
        error: 'Falta el email del usuario',
        status: 400,
        message: 'Falta el email del usuario'
      });
    }

    // Primero verificar en onpremise
    let baseUrl;
    try {
      logRequest('CHECKING_ONPREMISE', {
        requestId,
        email,
        url: `${ONPREM_BASE_URL}/checkuser`
      });

      const onPremCheck = await axios.post(`${ONPREM_BASE_URL}/checkuser`, { email });
      
      logRequest('ONPREMISE_RESPONSE', {
        requestId,
        status: onPremCheck.status,
        data: onPremCheck.data
      });

      if (onPremCheck.data.success && onPremCheck.data.exists) {
        baseUrl = ONPREM_BASE_URL;
        logRequest('USER_FOUND_ONPREMISE', {
          requestId,
          userId: onPremCheck.data.userId
        });
      } else {
        // Si no existe en onpremise, verificar en GCP
        logRequest('CHECKING_GCP', {
          requestId,
          email,
          url: `${GCP_BASE_URL}/checkuser`
        });

        const gcpCheck = await axios.post(`${GCP_BASE_URL}/checkuser`, { email });
        
        logRequest('GCP_RESPONSE', {
          requestId,
          status: gcpCheck.status,
          data: gcpCheck.data
        });

        if (gcpCheck.data.success && gcpCheck.data.exists) {
          baseUrl = GCP_BASE_URL;
          logRequest('USER_FOUND_GCP', {
            requestId,
            userId: gcpCheck.data.userId
          });
        } else {
          logRequest('USER_NOT_FOUND', {
            requestId,
            email
          });
          return res.status(404).json({
            error: 'Usuario no encontrado',
            status: 404,
            message: 'El usuario no existe en ningún ambiente'
          });
        }
      }
    } catch (checkError) {
      logRequest('CHECK_ERROR', {
        requestId,
        error: checkError.message,
        stack: checkError.stack
      });
      return res.status(500).json({
        error: 'Error al verificar el usuario',
        status: 500,
        message: 'Error al verificar la existencia del usuario'
      });
    }

    const targetUrl = `${baseUrl}${req.path}`;
    logRequest('FORWARDING_REQUEST', {
      requestId,
      method: req.method,
      targetUrl,
      baseUrl
    });

    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: propagateHeaders(req.headers),
      data: req.body,
      validateStatus: () => true
    });

    logRequest('BACKEND_RESPONSE', {
      requestId,
      status: response.status,
      headers: response.headers,
      data: response.data
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

    logRequest('SENDING_RESPONSE', {
      requestId,
      status: response.status,
      data: responseData
    });

    res.status(response.status).json(responseData);

  } catch (err) {
    logRequest('ERROR', {
      requestId,
      error: err.message,
      stack: err.stack,
      response: err.response?.data
    });
    
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
  logRequest('SERVER_START', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development'
  });
});
