function ownFrame(wc, origin, details = {}) {
  return !!wc && wc.getURL().startsWith(origin + '/') && details.isMainFrame !== false &&
    (!details.requestingUrl || details.requestingUrl.startsWith(origin + '/'));
}
exports.allowRequest = (wc, permission, origin, details = {}) => ownFrame(wc, origin, details) &&
  (permission === 'midi' || (permission === 'media' && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'));
exports.allowCheck = (wc, permission, requestOrigin, origin, details = {}) => requestOrigin === origin &&
  ownFrame(wc, origin, details) && (permission === 'midi' || (permission === 'media' && details.mediaType === 'audio'));
