const express = require('express');
const { getRankedTests, getTestDetail, updateTriageStatus } = require('../services/testService');

const router = express.Router();

const VALID_CLASSIFICATIONS = new Set([
  'Likely Broken',
  'Likely Flaky',
  'Possible Flake',
  'Stable',
]);

const VALID_TRIAGE_STATUSES = new Set([
  'untriaged',
  'triaged',
  'quarantined',
]);

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

router.patch('/detail/triage', (req, res) => {
  try {
    const testId = req.query.test_id;

    if (!testId || !testId.trim()) {
      return res.status(400).json({
        error: "test_id query parameter is required (e.g. /api/tests/detail/triage?test_id=tests/auth/test_oauth_callback_timeout)",
      });
    }

    const { triage_status } = req.body || {};

    if (!triage_status || typeof triage_status !== 'string' || !VALID_TRIAGE_STATUSES.has(triage_status.trim())) {
      return res.status(400).json({
        error: `Invalid or missing triage_status. Valid options: ${Array.from(VALID_TRIAGE_STATUSES).join(', ')}`,
      });
    }

    const updated = updateTriageStatus(testId.trim(), triage_status.trim());
    if (!updated) {
      return res.status(404).json({
        error: `Test with id '${testId}' not found`,
      });
    }

    res.json(updated);
  } catch (err) {
    console.error('Error updating triage status:', err);
    res.status(500).json({
      error: 'Failed to update triage status',
    });
  }
});

router.get('/detail', (req, res) => {
  try {
    const testId = req.query.test_id;

    if (!testId || !testId.trim()) {
      return res.status(400).json({
        error: "test_id query parameter is required (e.g. /api/tests/detail?test_id=tests/auth/test_oauth_callback_timeout)",
      });
    }

    const detail = getTestDetail(testId.trim());
    if (!detail) {
      return res.status(404).json({
        error: `Test with id '${testId}' not found`,
      });
    }

    res.json(detail);
  } catch (err) {
    console.error('Error retrieving test detail:', err);
    res.status(500).json({
      error: 'Failed to retrieve test details',
    });
  }
});

router.get('/', (req, res) => {
  try {
    const { branch, from, to, classification, suite } = req.query;

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
      suite: suite ? suite.trim() : undefined,
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
