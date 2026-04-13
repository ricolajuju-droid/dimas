require('dotenv').config();
const express = require('express');
const cors = require('cors');

const expedientesRoutes = require('./routes/expedientes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/expedientes', expedientesRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
