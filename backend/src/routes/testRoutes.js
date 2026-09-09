const express = require('express');
const { getRankedTests } = require('../services/testService');

const router = express.Router();

const VALID_CLASSIFICATIONS = new Set([
  'Likely Broken',
  'Likely Flaky',
  'Possible Flake',
  'Stable',
]);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', (req, res) => {
  try {
    const { branch, from, to, classification } = req.query;

    if (classification && !VALID_CLASSIFICATIONS.has(classification)) {
      return res.status(400).json({
        error: `Invalid classification filter: '${classification}'. Valid options: ${Array.from(VALID_CLASSIFICATIONS).join(', ')}`,
      });
    }

    if (from) {
      if (!DATE_REGEX.test(from) || isNaN(Date.parse(from))) {
        return res.status(400).json({
          error: "Invalid 'from' date format. Expected YYYY-MM-DD (e.g. 2026-07-15)",
        });
      }
    }

    if (to) {
      if (!DATE_REGEX.test(to) || isNaN(Date.parse(to))) {
        return res.status(400).json({
          error: "Invalid 'to' date format. Expected YYYY-MM-DD (e.g. 2026-07-31)",
        });
      }
    }

    if (from && to && from > to) {
      return res.status(400).json({
        error: "'from' date cannot be after 'to' date",
      });
    }

    const filters = {
      branch: branch ? branch.trim() : undefined,
      from: from ? from.trim() : undefined,
      to: to ? to.trim() : undefined,
      classification: classification ? classification.trim() : undefined,
    };

    const tests = getRankedTests(filters);
    res.json(tests);
  } catch (err) {
    console.error('Error retrieving tests from database:', err);
    res.status(500).json({
      error: 'Failed to retrieve tests',
    });
  }
});

module.exports = router;
