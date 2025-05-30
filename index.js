const axios = require('axios');

const ONPREM_BASE_URL = 'https://onprem-backend.example.com';
const GCP_BASE_URL = 'https://gcp-backend.example.com';

exports.apiGateway = async (req, res) => {
  try {
    // Paso 1: Extraer información del usuario
    const email = req.body?.email || req.query?.email || req.headers['x-user-email'];

    if (!email) {
      return res.status(400).json({ error: 'Falta el email del usuario para enrutar' });
    }

    // Paso 2: Verificar si el usuario está en la base de datos on-premise
    const check = await axios.post(`${ONPREM_BASE_URL}/checkUser`, { email });

    const userExistsOnPrem = check.data.exists === true;

    // Paso 3: Construir el URL objetivo
    const baseUrl = userExistsOnPrem ? ONPREM_BASE_URL : GCP_BASE_URL;
    const targetUrl = `${baseUrl}${req.path}`;

    // Paso 4: Reenviar la petición original al backend correcto
    const forwardedRequest = await axios({
      method: req.method,
      url: targetUrl,
      headers: req.headers,
      data: req.body,
      validateStatus: () => true // evitar que axios lance error con 4xx o 5xx
    });

    // Paso 5: Reenviar la respuesta del backend al cliente
    res.status(forwardedRequest.status).set(forwardedRequest.headers).send(forwardedRequest.data);

  } catch (err) {
    console.error('Error en el API Gateway:', err.message);
    res.status(500).json({ error: 'Error interno en el gateway' });
  }
};
