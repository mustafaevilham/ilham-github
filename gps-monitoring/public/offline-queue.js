// Pure offline-queue helpers, shared by the browser tracking page and the
// Node test suite. No DOM, no network, no storage access here — just the
// list operations, so the tricky "don't drop a reading that arrived mid-send"
// logic is unit-testable.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OfflineQueue = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function pointKey(p) {
    return p.recorded_at + '|' + p.lat + '|' + p.lng;
  }

  function enqueue(queue, point) {
    return queue.concat([point]);
  }

  // Remove exactly the points that were just accepted by the server, matched
  // by identity (timestamp + coordinates) — NOT by count. This preserves any
  // points that were appended to the queue while the send was in flight, so a
  // reading is never recorded locally and then dropped before acceptance.
  function removeSent(currentQueue, sentPoints) {
    const sentKeys = new Set(sentPoints.map(pointKey));
    return currentQueue.filter(function (p) {
      return !sentKeys.has(pointKey(p));
    });
  }

  return { pointKey, enqueue, removeSent };
});
