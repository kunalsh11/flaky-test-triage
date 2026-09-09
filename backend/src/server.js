const express = require('express');
const testRoutes = require('./routes/testRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
  });
});

app.use('/api/tests', testRoutes);

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server };
