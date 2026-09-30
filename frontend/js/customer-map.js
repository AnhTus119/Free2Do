(function () {
  'use strict';

  const DEFAULT_POSITION = { latitude: 21.0285, longitude: 105.8542 };
  const TILE_SIZE = 256;

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

  function coordinateFromWorldPoint(x, y, zoom) {
    const size = TILE_SIZE * (2 ** zoom);
    const longitude = x / size * 360 - 180;
    const mercator = Math.PI * (1 - 2 * y / size);
    const latitude = Math.atan(Math.sinh(mercator)) * 180 / Math.PI;
    return { latitude: clamp(latitude, -85.05112878, 85.05112878), longitude };
  }

  function markerPosition(latitude, longitude, center, zoom, width, height) {
    const point = worldPoint(latitude, longitude, zoom);
    const origin = worldPoint(center.latitude, center.longitude, zoom);
    let deltaX = point.x - origin.x;
    if (deltaX > point.size / 2) deltaX -= point.size;
    if (deltaX < -point.size / 2) deltaX += point.size;
    return { left: width / 2 + deltaX, top: height / 2 + point.y - origin.y };
  }

  // Lớp tile dùng lại giữa các lần kéo/thu phóng thay vì vẽ lại cả khung:
  // - phủ rộng hơn khung nhìn và bù thêm tile khi kéo, nên không lộ ô trống;
  // - tải tối đa MAX_PARALLEL_TILES ô cùng lúc, ô gần tâm được tải trước để
  //   tránh bị OpenStreetMap giới hạn tốc độ (HTTP 429) rồi rớt ô;
  // - ô lỗi được thử lại nhiều lần với thời gian chờ tăng dần và được thử lại
  //   khi người dùng kéo/phóng bản đồ tiếp;
  // - lớp cũ chỉ bị gỡ khi lớp mới tải xong (hoặc quá thời gian chờ).
  const MAX_PARALLEL_TILES = 6;
  const MAX_TILE_RETRIES = 4;
  const TILE_PADDING = 1;
  const PREVIOUS_LAYER_TIMEOUT = 8000;

  function createTileLayer(root) {
    let current = null;
    let previous = null;
    let previousTimer = null;
    let lastCenter = { x: 0, y: 0 };
    const queue = [];
    let active = 0;

    function releasePrevious() {
      clearTimeout(previousTimer);
      previous?.el.remove();
      previous = null;
    }

    function maybeReleasePrevious() {
      if (previous && current && current.pending <= 0) releasePrevious();
    }

    function makeImage(tile) {
      const image = document.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.decoding = 'async';
      image.style.cssText = `position:absolute;left:${tile.left}px;top:${tile.top}px;width:${TILE_SIZE + 1}px;height:${TILE_SIZE + 1}px;max-width:none;user-select:none;`;
      tile.layer.el.appendChild(image);
      tile.image = image;
    }

    function settle(tile, ok) {
      tile.state = ok ? 'loaded' : 'failed';
      tile.layer.pending -= 1;
      if (tile.layer === current) maybeReleasePrevious();
    }

    function startLoad(tile) {
      active += 1;
      tile.state = 'loading';
      const image = tile.image;
      image.onload = () => {
        image.onload = image.onerror = null;
        active -= 1;
        settle(tile, true);
        pump();
      };
      image.onerror = () => {
        image.onload = image.onerror = null;
        active -= 1;
        image.remove();
        if (tile.retries < MAX_TILE_RETRIES && tile.layer.el.isConnected) {
          const delay = 400 * (2 ** tile.retries);
          tile.retries += 1;
          tile.state = 'waiting';
          setTimeout(() => {
            if (!tile.layer.el.isConnected) return;
            makeImage(tile);
            queue.push(tile);
            pump();
          }, delay);
        } else {
          settle(tile, false);
        }
        pump();
      };
      image.src = tile.url;
    }

    function pump() {
      while (active < MAX_PARALLEL_TILES && queue.length) {
        const tile = queue.shift();
        if (tile.layer.el.isConnected) startLoad(tile);
      }
    }

    function addTile(layer, tileX, tileY) {
      const tilesPerAxis = 2 ** layer.zoom;
      if (tileY < 0 || tileY >= tilesPerAxis) return;
      const key = `${tileX}:${tileY}`;
      const existing = layer.tiles.get(key);
      if (existing) {
        if (existing.state !== 'failed') return;
        // Ô từng lỗi hẳn: thử lại khi khu vực này hiện ra lần nữa.
        existing.retries = 0;
        existing.state = 'queued';
        existing.image?.remove();
        layer.pending += 1;
        makeImage(existing);
        queue.push(existing);
        return;
      }
      const wrappedX = ((tileX % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;
      const tile = {
        layer,
        url: `https://tile.openstreetmap.org/${layer.zoom}/${wrappedX}/${tileY}.png`,
        left: tileX * TILE_SIZE - layer.originX,
        top: tileY * TILE_SIZE - layer.originY,
        centerX: (tileX + 0.5) * TILE_SIZE,
        centerY: (tileY + 0.5) * TILE_SIZE,
        retries: 0,
        state: 'queued',
        image: null,
      };
      layer.tiles.set(key, tile);
      layer.pending += 1;
      makeImage(tile);
      queue.push(tile);
    }

    // Bảo đảm mọi tile quanh tâm (kèm vùng đệm) đã có mặt trong lớp hiện tại.
    function ensure(centerWorld, width, height) {
      const layer = current;
      if (!layer) return;
      lastCenter = centerWorld;
      const pad = TILE_PADDING * TILE_SIZE;
      const startX = Math.floor((centerWorld.x - width / 2 - pad) / TILE_SIZE);
      const endX = Math.floor((centerWorld.x + width / 2 + pad) / TILE_SIZE);
      const startY = Math.floor((centerWorld.y - height / 2 - pad) / TILE_SIZE);
      const endY = Math.floor((centerWorld.y + height / 2 + pad) / TILE_SIZE);
      for (let tileY = startY; tileY <= endY; tileY += 1) {
        for (let tileX = startX; tileX <= endX; tileX += 1) addTile(layer, tileX, tileY);
      }
      queue.sort((a, b) => (
        Math.hypot(a.centerX - lastCenter.x, a.centerY - lastCenter.y)
        - Math.hypot(b.centerX - lastCenter.x, b.centerY - lastCenter.y)
      ));
      pump();
    }

    function show(center, zoom, width, height) {
      const centerWorld = worldPoint(center.latitude, center.longitude, zoom);
      if (!current || current.zoom !== zoom) {
        releasePrevious();
        if (current) {
          previous = current;
          previous.el.style.opacity = '0.35';
          const stale = previous;
          previousTimer = setTimeout(() => { if (previous === stale) releasePrevious(); }, PREVIOUS_LAYER_TIMEOUT);
        }
        const el = document.createElement('div');
        el.className = 'free2do-map-tile-viewport';
        el.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;';
        root.appendChild(el);
        current = {
          el,
          zoom,
          originX: Math.floor(centerWorld.x),
          originY: Math.floor(centerWorld.y),
          tiles: new Map(),
          pending: 0,
        };
      }
      const shiftX = Math.round(width / 2 - (centerWorld.x - current.originX));
      const shiftY = Math.round(height / 2 - (centerWorld.y - current.originY));
      current.el.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
      ensure(centerWorld, width, height);
    }

    // Dùng khi đang kéo: khung đã dịch bằng transform nên chỉ cần bù thêm tile.
    function extend(zoom, centerWorld, width, height) {
      if (current && current.zoom === zoom) ensure(centerWorld, width, height);
    }

    return { show, extend };
  }

  function createMarker(activity, position, searchPosition) {
    const link = document.createElement('a');
    link.className = 'free2do-static-map-marker';
    link.dataset.activityId = String(activity.activity_id);
    const query = new URLSearchParams({ id: activity.activity_id });
    if (validCoordinate(searchPosition?.latitude, searchPosition?.longitude)) {
      query.set('latitude', searchPosition.latitude);
      query.set('longitude', searchPosition.longitude);
    }
    link.href = `activity-detail.html?${query}`;
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
    layer.innerHTML = '<div class="free2do-static-map-image" role="img" aria-label="Bản đồ hoạt động"></div><div class="free2do-static-map-markers"></div><div class="free2do-map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></div>';
    container.prepend(layer);

    const mapImage = layer.querySelector('.free2do-static-map-image');
    const markerLayer = layer.querySelector('.free2do-static-map-markers');
    const tiles = createTileLayer(mapImage);
    const markers = new Map();
    let latestRender = { userPosition: DEFAULT_POSITION, radiusKm: 5, activities: [] };
    let resizeTimer;
    let baseMapKey = '';
    let viewportKey = '';
    let zoomOffset = 0;
    let currentBaseZoom = 13;
    let wheelAccumulator = 0;
    let pinchStartDistance = null;
    let pinchLastDistance = null;
    let viewCenter = { ...DEFAULT_POSITION };
    let selectPositionHandler = null;
    let dragStart = null;
    let dragging = false;
    let selectionTimer = null;

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
        viewCenter = { ...center };
      }
      const zoom = clamp(currentBaseZoom + zoomOffset, 3, 18);
      const nextBaseMapKey = `${viewCenter.latitude.toFixed(6)}:${viewCenter.longitude.toFixed(6)}:${zoom}:${displayWidth}:${displayHeight}`;
      if (nextBaseMapKey !== baseMapKey) {
        baseMapKey = nextBaseMapKey;
        tiles.show(viewCenter, zoom, displayWidth, displayHeight);
      }

      const currentPosition = markerPosition(center.latitude, center.longitude, viewCenter, zoom, displayWidth, displayHeight);
      const userMarker = document.createElement('span');
      userMarker.className = 'free2do-static-map-user';
      userMarker.title = 'Vị trí của bạn';
      userMarker.style.left = `${currentPosition.left}px`;
      userMarker.style.top = `${currentPosition.top}px`;
      markerLayer.appendChild(userMarker);

      latestRender.activities.forEach(activity => {
        if (!validCoordinate(activity.latitude, activity.longitude)) return;
        const position = markerPosition(Number(activity.latitude), Number(activity.longitude), viewCenter, zoom, displayWidth, displayHeight);
        if (position.left < -30 || position.left > displayWidth + 30 || position.top < -30 || position.top > displayHeight + 30) return;
        const marker = createMarker(activity, position, center);
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
      clearTimeout(selectionTimer);
      zoomBy(1);
    });
    layer.style.cursor = 'grab';
    layer.style.touchAction = 'none';
    layer.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('.free2do-static-map-marker')) return;
      const zoom = clamp(currentBaseZoom + zoomOffset, 3, 18);
      dragStart = {
        x: event.clientX,
        y: event.clientY,
        centerPoint: worldPoint(viewCenter.latitude, viewCenter.longitude, zoom),
        zoom,
      };
      dragging = false;
      layer.setPointerCapture?.(event.pointerId);
      layer.style.cursor = 'grabbing';
    });
    layer.addEventListener('pointermove', event => {
      if (!dragStart) return;
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      if (Math.hypot(dx, dy) > 4) dragging = true;
      if (!dragging) return;
      mapImage.style.transform = `translate(${dx}px, ${dy}px)`;
      markerLayer.style.transform = `translate(${dx}px, ${dy}px)`;
      const box = container.getBoundingClientRect();
      tiles.extend(
        dragStart.zoom,
        { x: dragStart.centerPoint.x - dx, y: dragStart.centerPoint.y - dy },
        Math.max(320, Math.round(box.width)),
        Math.max(320, Math.round(box.height)),
      );
    });
    const finishPointer = event => {
      if (!dragStart) return;
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      mapImage.style.transform = '';
      markerLayer.style.transform = '';
      layer.style.cursor = 'grab';
      if (dragging) {
        viewCenter = coordinateFromWorldPoint(
          dragStart.centerPoint.x - dx,
          dragStart.centerPoint.y - dy,
          dragStart.zoom,
        );
        baseMapKey = '';
        render(latestRender.userPosition, latestRender.radiusKm, latestRender.activities);
      } else if (selectPositionHandler) {
        const rect = container.getBoundingClientRect();
        const viewPoint = worldPoint(viewCenter.latitude, viewCenter.longitude, dragStart.zoom);
        const selected = coordinateFromWorldPoint(
          viewPoint.x + event.clientX - rect.left - rect.width / 2,
          viewPoint.y + event.clientY - rect.top - rect.height / 2,
          dragStart.zoom,
        );
        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(() => selectPositionHandler(selected), 220);
      }
      dragStart = null;
      dragging = false;
    };
    layer.addEventListener('pointerup', finishPointer);
    layer.addEventListener('pointercancel', () => {
      mapImage.style.transform = '';
      markerLayer.style.transform = '';
      layer.style.cursor = 'grab';
      dragStart = null;
      dragging = false;
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
    return {
      render,
      highlight,
      invalidate,
      zoomIn: () => zoomBy(1),
      zoomOut: () => zoomBy(-1),
      onSelectPosition: handler => { selectPositionHandler = typeof handler === 'function' ? handler : null; },
    };
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
