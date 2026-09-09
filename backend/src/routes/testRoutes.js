const express = require('express');
const { getRankedTests } = require('../services/testService');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const tests = getRankedTests();
    res.json(tests);
  } catch (err) {
    console.error('Error retrieving tests from database:', err);
    res.status(500).json({
      error: 'Failed to retrieve tests',
    });
  }
});

module.exports = router;
