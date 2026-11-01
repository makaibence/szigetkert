/** One model and animation set, readable clothing and hair by role. No gameplay data. */
export function actorPalette(id) {
  if (id === 'shipwright') return { shirt: '#48989b', trousers: '#776349', hair: '#946a3f' };
  if (id === 'keeper') return { shirt: '#ad7560', trousers: '#6b6960', hair: '#c3bbac' };
  if (id === 'carpenter') return { shirt: '#4f7896', trousers: '#77583c', hair: '#bcb7aa' };
  if (id === 'merchant') return { shirt: '#91bda6', trousers: '#c4ad91', hair: '#8f6b3f' };
  return { shirt: '#d9b791', trousers: '#c4ad91', hair: '#8f6b3f' };
}
