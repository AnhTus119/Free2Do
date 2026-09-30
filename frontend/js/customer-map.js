(function () {
  'use strict';

  const DEFAULT_POSITION = { latitude: 21.0285, longitude: 105.8542 };
  const TILE_SIZE = 256;
  const TILE_CACHE = new Map();

  function validCoordinate(latitude, longitude) {
    return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
      && Number(latitude) >= -90 && Number(latitude) <= 90
      && Number(longitude) >= -180 && Number(longitude) <= 180;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function zoomForRadius(latitude, radiusKm, width, height) {
    const usablePixels = Math.max(220, Math.min(width, height) - 48);
    const diameterMetres = Math.max(500, Number(radiusKm) * 2.08 * 1000);
    const metresPerPixel = diameterMetres / usablePixels;
    const latitudeScale = Math.max(0.15, Math.cos(Number(latitude) * Math.PI / 180));
    return clamp(Math.floor(Math.log2((156543.03392 * latitudeScale) / metresPerPixel)), 3, 18);
  }

  function worldPoint(latitude, longitude, zoom) {
    const size = 256 * (2 ** zoom);
    const safeLatitude = clamp(Number(latitude), -85.05112878, 85.05112878);
    const radians = safeLatitude * Math.PI / 180;
    return {
      x: (Number(longitude) + 180) / 360 * size,
      y: (1 - Math.log(Math.tan(radians) + (1 / Math.cos(radians))) / Math.PI) / 2 * size,
      size,
    };
  }

  function markerPosition(latitude, longitude, center, zoom, width, height) {
    const point = worldPoint(latitude, longitude, zoom);
    const origin = worldPoint(center.latitude, center.longitude, zoom);
    let deltaX = point.x - origin.x;
    if (deltaX > point.size / 2) deltaX -= point.size;
    if (deltaX < -point.size / 2) deltaX += point.size;
    return { left: width / 2 + deltaX, top: height / 2 + point.y - origin.y };
  }

  function loadTile(url) {
    if (TILE_CACHE.has(url)) return TILE_CACHE.get(url);
    const request = new Promise(resolve => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'origin';
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = url;
    });
    TILE_CACHE.set(url, request);
    return request;
  }

  async function drawBaseMap(canvas, center, zoom, width, height, drawToken, currentToken) {
    const origin = worldPoint(center.latitude, center.longitude, zoom);
    const topLeftX = origin.x - width / 2;
    const topLeftY = origin.y - height / 2;
    const startX = Math.floor(topLeftX / TILE_SIZE);
    const endX = Math.floor((topLeftX + width) / TILE_SIZE);
    const startY = Math.floor(topLeftY / TILE_SIZE);
    const endY = Math.floor((topLeftY + height) / TILE_SIZE);
    const tilesPerAxis = 2 ** zoom;
    const requests = [];

    for (let tileY = startY; tileY <= endY; tileY += 1) {
      if (tileY < 0 || tileY >= tilesPerAxis) continue;
      for (let tileX = startX; tileX <= endX; tileX += 1) {
        const wrappedX = ((tileX % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;
        requests.push(loadTile(`https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`)
          .then(image => ({ image, x: tileX * TILE_SIZE - topLeftX, y: tileY * TILE_SIZE - topLeftY })));
      }
    }

    const tiles = await Promise.all(requests);
    if (drawToken !== currentToken()) return;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#e9e5d8';
    context.fillRect(0, 0, width, height);
    tiles.forEach(tile => {
      if (tile.image) context.drawImage(tile.image, Math.round(tile.x), Math.round(tile.y), TILE_SIZE + 1, TILE_SIZE + 1);
    });
  }

  function createMarker(activity, position) {
    const link = document.createElement('a');
    link.className = 'free2do-static-map-marker';
    link.dataset.activityId = String(activity.activity_id);
    link.href = `activity-detail.html?id=${encodeURIComponent(activity.activity_id)}`;
    link.title = activity.name || 'Hoạt động';
    link.setAttribute('aria-label', activity.name || 'Xem hoạt động');
    link.style.left = `${position.left}px`;
    link.style.top = `${position.top}px`;

    const iconUrl = window.Free2DoActivityIcons?.urlFor(activity, activity.category_names);
    if (iconUrl) {
      const image = document.createElement('img');
      image.src = iconUrl;
      image.alt = '';
      image.addEventListener('error', () => {
        image.remove();
        link.classList.add('free2do-static-map-marker-default');
      }, { once: true });
      link.appendChild(image);
    } else {
      link.classList.add('free2do-static-map-marker-default');
    }
    return link;
  }

  async function create(containerId) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Không tìm thấy vùng bản đồ ${containerId}.`);

    container.querySelectorAll('.map-grid-bg').forEach(item => { item.style.display = 'none'; });
    container.querySelectorAll('.map-overlay-left,.map-overlay-bottom-left').forEach(item => {
      item.style.zIndex = '5';
      item.style.pointerEvents = 'none';
    });

    const layer = document.createElement('div');
    layer.className = 'free2do-static-map';
    layer.style.cssText = 'position:absolute;inset:0;z-index:1;overflow:hidden;background:#e9e5d8;';
    layer.innerHTML = '<canvas class="free2do-static-map-image" aria-label="Bản đồ hoạt động"></canvas><div class="free2do-static-map-markers"></div><div class="free2do-map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></div>';
    container.prepend(layer);

    const mapImage = layer.querySelector('.free2do-static-map-image');
    const markerLayer = layer.querySelector('.free2do-static-map-markers');
    const markers = new Map();
    let latestRender = { userPosition: DEFAULT_POSITION, radiusKm: 5, activities: [] };
    let resizeTimer;
    let drawToken = 0;
    let baseMapKey = '';
    let viewportKey = '';
    let zoomOffset = 0;
    let currentBaseZoom = 13;
    let wheelAccumulator = 0;
    let pinchStartDistance = null;
    let pinchLastDistance = null;

    function render(userPosition, radiusKm, activities) {
      const center = {
        latitude: Number(userPosition?.latitude),
        longitude: Number(userPosition?.longitude),
      };
      if (!validCoordinate(center.latitude, center.longitude)) return;

      latestRender = { userPosition: center, radiusKm: Number(radiusKm) || 5, activities: activities || [] };
      markers.clear();
      markerLayer.replaceChildren();

      const rect = container.getBoundingClientRect();
      const displayWidth = Math.max(320, Math.round(rect.width || container.clientWidth || 640));
      const displayHeight = Math.max(320, Math.round(rect.height || container.clientHeight || 640));
      const nextViewportKey = `${center.latitude.toFixed(5)}:${center.longitude.toFixed(5)}:${latestRender.radiusKm}`;
      currentBaseZoom = zoomForRadius(center.latitude, latestRender.radiusKm, displayWidth, displayHeight);
      if (nextViewportKey !== viewportKey) {
        viewportKey = nextViewportKey;
        zoomOffset = 0;
      }
      const zoom = clamp(currentBaseZoom + zoomOffset, 3, 18);
      const nextBaseMapKey = `${center.latitude.toFixed(5)}:${center.longitude.toFixed(5)}:${zoom}:${displayWidth}:${displayHeight}`;
      if (nextBaseMapKey !== baseMapKey) {
        baseMapKey = nextBaseMapKey;
        const token = ++drawToken;
        drawBaseMap(mapImage, center, zoom, displayWidth, displayHeight, token, () => drawToken)
          .catch(error => console.warn('Không thể tải nền OpenStreetMap:', error));
      }

      const currentPosition = markerPosition(center.latitude, center.longitude, center, zoom, displayWidth, displayHeight);
      const userMarker = document.createElement('span');
      userMarker.className = 'free2do-static-map-user';
      userMarker.title = 'Vị trí của bạn';
      userMarker.style.left = `${currentPosition.left}px`;
      userMarker.style.top = `${currentPosition.top}px`;
      markerLayer.appendChild(userMarker);

      latestRender.activities.forEach(activity => {
        if (!validCoordinate(activity.latitude, activity.longitude)) return;
        const position = markerPosition(Number(activity.latitude), Number(activity.longitude), center, zoom, displayWidth, displayHeight);
        if (position.left < -30 || position.left > displayWidth + 30 || position.top < -30 || position.top > displayHeight + 30) return;
        const marker = createMarker(activity, position);
        markerLayer.appendChild(marker);
        markers.set(String(activity.activity_id), marker);
      });
    }

    function highlight(activityId, highlighted) {
      const marker = markers.get(String(activityId));
      if (marker) marker.classList.toggle('is-highlighted', Boolean(highlighted));
    }

    function invalidate() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => render(latestRender.userPosition, latestRender.radiusKm, latestRender.activities), 50);
    }

    function zoomBy(step) {
      const nextZoom = clamp(currentBaseZoom + zoomOffset + step, 3, 18);
      if (nextZoom === currentBaseZoom + zoomOffset) return;
      zoomOffset = nextZoom - currentBaseZoom;
      render(latestRender.userPosition, latestRender.radiusKm, latestRender.activities);
    }

    container.addEventListener('wheel', event => {
      event.preventDefault();
      wheelAccumulator -= event.deltaY;
      if (Math.abs(wheelAccumulator) < 80) return;
      zoomBy(wheelAccumulator > 0 ? 1 : -1);
      wheelAccumulator = 0;
    }, { passive: false });
    container.addEventListener('dblclick', event => {
      event.preventDefault();
      zoomBy(1);
    });
    container.addEventListener('touchstart', event => {
      if (event.touches.length !== 2) return;
      pinchStartDistance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );
      pinchLastDistance = pinchStartDistance;
    }, { passive: true });
    container.addEventListener('touchmove', event => {
      if (event.touches.length !== 2 || pinchStartDistance == null) return;
      event.preventDefault();
      pinchLastDistance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY,
      );
    }, { passive: false });
    container.addEventListener('touchend', () => {
      if (pinchStartDistance && pinchLastDistance) {
        const ratio = pinchLastDistance / pinchStartDistance;
        if (ratio > 1.15) zoomBy(1);
        if (ratio < 0.85) zoomBy(-1);
      }
      pinchStartDistance = null;
      pinchLastDistance = null;
    });

    if ('ResizeObserver' in window) new ResizeObserver(invalidate).observe(container);
    window.addEventListener('resize', invalidate);
    return { render, highlight, invalidate, zoomIn: () => zoomBy(1), zoomOut: () => zoomBy(-1) };
  }

  function getCurrentPosition() {
    if (!navigator.geolocation) return Promise.reject(new Error('Trình duyệt không hỗ trợ định vị.'));
    return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
      result => resolve({ latitude: result.coords.latitude, longitude: result.coords.longitude }),
      () => reject(new Error('Hãy cho phép truy cập vị trí để tìm hoạt động quanh bạn.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
    ));
  }

  window.Free2DoMap = { create, getCurrentPosition, validCoordinate };
})();
