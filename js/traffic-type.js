(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.normalizeTrafficType = factory().normalizeTrafficType;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CODE_LABELS = {
    B: 'Buss',
    BUS: 'Buss',
    J: 'Tåg',
    TAG: 'Tåg',
    TRAIN: 'Tåg',
  };

  function normalizeTrafficType(value) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || '';
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = normalizeTrafficType(item);
        if (normalized) return normalized;
      }
      return '';
    }

    if (!value || typeof value !== 'object') return '';

    const directKeys = ['Description', 'Text', 'Value', 'Label', 'DisplayName', 'Name'];
    for (const key of directKeys) {
      const normalized = normalizeTrafficType(value[key]);
      if (normalized) return normalized;
    }

    const nestedKeys = ['Object', 'TypeOfTraffic', 'TrafficType'];
    for (const key of nestedKeys) {
      const normalized = normalizeTrafficType(value[key]);
      if (normalized) return normalized;
    }

    const code = typeof value.Code === 'string' ? value.Code.trim().toUpperCase() : '';
    return CODE_LABELS[code] || '';
  }

  return { normalizeTrafficType };
});
