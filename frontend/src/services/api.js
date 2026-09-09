export async function getRankedTests(filters = {}) {
  const params = new URLSearchParams();
  if (filters.branch && filters.branch !== 'All') params.append('branch', filters.branch);
  if (filters.classification && filters.classification !== 'All') params.append('classification', filters.classification);
  if (filters.suite && filters.suite !== 'All' && filters.suite !== 'All Suites') params.append('suite', filters.suite);
  if (filters.from) params.append('from', filters.from);
  if (filters.to) params.append('to', filters.to);

  const queryString = params.toString();
  const url = queryString ? `/api/tests?${queryString}` : '/api/tests';

  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }
  return res.json();
}

export async function getTestDetail(testId) {
  if (!testId) {
    throw new Error('test_id is required');
  }

  const url = `/api/tests/detail?test_id=${encodeURIComponent(testId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }
  return res.json();
}

export async function updateTriageStatus(testId, triageStatus) {
  if (!testId) {
    throw new Error('test_id is required');
  }

  const url = `/api/tests/detail/triage?test_id=${encodeURIComponent(testId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ triage_status: triageStatus }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }
  return res.json();
}
