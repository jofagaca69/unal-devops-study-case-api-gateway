const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const ONPREM_BASE_URL = 'https://onprem-backend.example.com';
const GCP_BASE_URL = 'https://gcp-backend.example.com';

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
    console.error(err.message);
    res.status(500).json({ error: 'Error interno en el gateway' });
  }
});

// Inicia el servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`API Gateway escuchando en puerto ${PORT}`);
});
