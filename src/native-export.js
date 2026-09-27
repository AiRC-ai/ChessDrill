/** Save text through Android's document picker when the app is installed. */
export function saveTextFile(name, text, type = 'text/plain') {
  if (typeof window !== 'undefined' && window.ChessStudioNative?.postMessage) {
    window.ChessStudioNative.postMessage(JSON.stringify({action:'save', name, text, type}));
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([text], {type}));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}
