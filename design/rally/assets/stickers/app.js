(() => {
  'use strict';
  const manifest = window.RALLY_STICKER_MANIFEST;
  const assets = manifest.assets;
  const poses = document.querySelector('#poses');
  const bytes = value => `${(value / 1024 / 1024).toFixed(2)} MB`;
  let selected = 0;
  poses.innerHTML = assets.map((asset, index) => `<button class="pose" type="button" data-pose="${index}" aria-pressed="${index === 0}" aria-label="View ${asset.label} sticker"><img src="${asset.png}" alt="" width="54" height="62"><span>${asset.label}<small>${asset.id.split('-').at(-1).toUpperCase()} · approved</small></span></button>`).join('');

  function showPose(index) {
    selected = index;
    const asset = assets[index];
    document.querySelector('#pose-title').textContent = asset.label;
    document.querySelector('#pose-index').textContent = String(index + 1).padStart(2, '0');
    document.querySelectorAll('[data-pose]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.pose) === index)));
    for (const format of ['png', 'svg']) {
      const image = document.querySelector(`#${format}-preview`);
      image.src = asset[format];
      image.alt = `${asset.label}: The Regular, ${format === 'png' ? 'approved original PNG' : 'automated SVG vector trace'}`;
      image.width = asset.width;
      image.height = asset.height;
      document.querySelector(`#download-${format}`).href = asset[format];
      document.querySelector(`#download-${format}`).setAttribute('aria-label', `Download ${asset.label} ${format.toUpperCase()}`);
    }
    document.querySelector('#asset-facts').innerHTML = `<span><strong>${asset.width} × ${asset.height}</strong> original</span><span><strong>${asset.total_path_count.toLocaleString()}</strong> SVG paths</span><span><strong>PNG</strong> ${bytes(asset.png_bytes)}</span><span><strong>SVG</strong> ${bytes(asset.svg_bytes)}</span><span><strong>Alpha</strong> vector mask</span>`;
  }

  poses.addEventListener('click', event => {
    const button = event.target.closest('[data-pose]');
    if (button) showPose(Number(button.dataset.pose));
  });
  poses.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? assets.length - 1 : (selected + (event.key === 'ArrowRight' ? 1 : -1) + assets.length) % assets.length;
    showPose(index);
    poses.querySelector(`[data-pose="${index}"]`).focus();
  });
  document.querySelector('.toolbar').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const key = button.dataset.format ? 'format' : 'theme';
    document.body.dataset[key] = button.dataset[key];
    document.querySelectorAll(`button[data-${key}]`).forEach(peer => peer.setAttribute('aria-pressed', String(peer === button)));
  });
  document.querySelector('#size').addEventListener('change', event => { document.body.dataset.size = event.target.value; });
  showPose(0);
})();
