(function () {
  'use strict';

  const TILE_SIZE = 256;
  const VIETNAM_BOUNDS = Object.freeze({
    south: 8.1790665,
    west: 102.14441,
    north: 23.393395,
    east: 109.464638,
  });
  const VIETNAM_MIN_ZOOM = 8;

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
    return clamp(Math.floor(Math.log2((156543.03392 * latitudeScale) / metresPerPixel)), VIETNAM_MIN_ZOOM, 18);
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

  function clampToVietnam(position) {
    return {
      latitude: clamp(Number(position.latitude), VIETNAM_BOUNDS.south, VIETNAM_BOUNDS.north),
      longitude: clamp(Number(position.longitude), VIETNAM_BOUNDS.west, VIETNAM_BOUNDS.east),
    };
  }

  function constrainCenterToVietnam(center, zoom, width, height) {
    const northWest = worldPoint(VIETNAM_BOUNDS.north, VIETNAM_BOUNDS.west, zoom);
    const southEast = worldPoint(VIETNAM_BOUNDS.south, VIETNAM_BOUNDS.east, zoom);
    const minX = northWest.x + width / 2;
    const maxX = southEast.x - width / 2;
    const minY = northWest.y + height / 2;
    const maxY = southEast.y - height / 2;
    const point = worldPoint(center.latitude, center.longitude, zoom);
    const x = minX <= maxX ? clamp(point.x, minX, maxX) : (northWest.x + southEast.x) / 2;
    const y = minY <= maxY ? clamp(point.y, minY, maxY) : (northWest.y + southEast.y) / 2;
    return coordinateFromWorldPoint(x, y, zoom);
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
  // Giữ số request đồng thời ở mức vừa phải để nguồn tile cộng đồng không
  // giới hạn trình duyệt. Hàng đợi luôn ưu tiên đúng lớp zoom hiện tại.
  const MAX_PARALLEL_TILES = 6;
  const MAX_TILE_RETRIES = 5;
  const TILE_LOAD_TIMEOUT_MS = 8000;
  const BACKGROUND_RETRY_MS = 2500;
  const BACKGROUND_RETRY_ROUNDS = 6;
  // Không dùng CARTO làm nguồn dự phòng: từ cuối 09/2026 CARTO trả một ảnh
  // "API KEY REQUIRED" (HTTP 200) cho URL không có key, khiến trình duyệt hiểu
  // nhầm là tile đã tải thành công và phủ ảnh cảnh báo lên bản đồ.
  // Hai nguồn dưới đây đều là tile OpenStreetMap miễn phí; nguồn thứ hai chỉ
  // được gọi khi nguồn chính thật sự phát sinh lỗi tải.
  const TILE_SOURCES = [
    (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    (z, x, y) => `https://tile.openstreetmap.de/${z}/${x}/${y}.png`,
    (z, x, y) => `https://tile.openstreetmap.fr/osmfr/${z}/${x}/${y}.png`,
  ];
  const TILE_PADDING = 0;
  const PREVIOUS_LAYER_TIMEOUT = 30000;

  function createTileLayer(root) {
    let current = null;
    let previous = null;
    let previousTimer = null;
    let lastCenter = { x: 0, y: 0 };
    const queue = [];
    const loadingTiles = new Set();
    let active = 0;

    function isVisibleLayer(layer) {
      return layer === current || layer === previous;
    }

    function discardStaleWork() {
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (!isVisibleLayer(queue[index].layer)) queue.splice(index, 1);
      }
    }

    function cancelLayerWork(layer) {
      if (!layer) return;
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (queue[index].layer === layer) queue.splice(index, 1);
      }
      [...loadingTiles].forEach(tile => {
        if (tile.layer !== layer) return;
        clearTimeout(tile.loadTimer);
        tile.image.onload = null;
        tile.image.onerror = null;
        tile.image.remove();
        active = Math.max(0, active - 1);
        tile.state = 'cancelled';
        loadingTiles.delete(tile);
      });
    }

    function releasePrevious() {
      clearTimeout(previousTimer);
      cancelLayerWork(previous);
      previous?.el.remove();
      previous = null;
    }

    function maybeReleasePrevious() {
      if (previous && current && current.pending <= 0 && current.failed <= 0) releasePrevious();
    }

    function makeImage(tile) {
      const image = document.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.loading = 'eager';
      image.decoding = 'async';
      image.style.cssText = `position:absolute;left:${tile.left}px;top:${tile.top}px;width:${TILE_SIZE + 1}px;height:${TILE_SIZE + 1}px;max-width:none;user-select:none;`;
      tile.layer.el.appendChild(image);
      tile.image = image;
    }

    function settle(tile, ok) {
      tile.state = ok ? 'loaded' : 'failed';
      tile.layer.pending -= 1;
      if (!ok) tile.layer.failed += 1;
      if (tile.layer === current) maybeReleasePrevious();
    }

    function startLoad(tile) {
      if (!isVisibleLayer(tile.layer) || !tile.layer.el.isConnected) return;
      active += 1;
      tile.state = 'loading';
      loadingTiles.add(tile);
      const image = tile.image;
      let finished = false;

      const finish = ok => {
        if (finished) return;
        finished = true;
        clearTimeout(tile.loadTimer);
        image.onload = image.onerror = null;
        active = Math.max(0, active - 1);
        loadingTiles.delete(tile);
        if (ok) {
          settle(tile, true);
          pump();
          return;
        }
        image.remove();
        if (tile.retries < MAX_TILE_RETRIES && isVisibleLayer(tile.layer) && tile.layer.el.isConnected) {
          const delay = 300 * (tile.retries + 1);
          tile.retries += 1;
          tile.url = TILE_SOURCES[tile.retries % TILE_SOURCES.length](tile.z, tile.x, tile.y);
          tile.state = 'waiting';
          setTimeout(() => {
            if (!isVisibleLayer(tile.layer) || !tile.layer.el.isConnected) return;
            makeImage(tile);
            queue.push(tile);
            pump();
          }, delay);
        } else {
          settle(tile, false);
          // Mạng/nguồn tile có thể chỉ chặn tạm thời: thử lại ngầm sau vài giây.
          if (tile.rounds < BACKGROUND_RETRY_ROUNDS) {
            tile.rounds += 1;
            setTimeout(() => {
              if (tile.state === 'failed' && isVisibleLayer(tile.layer) && tile.layer.el.isConnected) {
                tile.retries = 0;
                tile.url = TILE_SOURCES[0](tile.z, tile.x, tile.y);
                tile.state = 'queued';
                tile.layer.failed = Math.max(0, tile.layer.failed - 1);
                tile.layer.pending += 1;
                makeImage(tile);
                queue.push(tile);
                pump();
              }
            }, BACKGROUND_RETRY_MS * tile.rounds);
          }
        }
        pump();
      };

      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      tile.loadTimer = setTimeout(() => finish(false), TILE_LOAD_TIMEOUT_MS);
      image.src = tile.url;
    }

    function pump() {
      while (active < MAX_PARALLEL_TILES && queue.length) {
        const currentIndex = queue.findIndex(tile => tile.layer === current);
        const index = currentIndex >= 0 ? currentIndex : 0;
        const tile = queue.splice(index, 1)[0];
        if (isVisibleLayer(tile.layer) && tile.layer.el.isConnected) startLoad(tile);
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
        existing.url = TILE_SOURCES[0](existing.z, existing.x, existing.y);
        existing.state = 'queued';
        existing.image?.remove();
        layer.failed = Math.max(0, layer.failed - 1);
        layer.pending += 1;
        makeImage(existing);
        queue.push(existing);
        return;
      }
      const wrappedX = ((tileX % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;
      const tile = {
        layer,
        z: layer.zoom,
        x: wrappedX,
        y: tileY,
        url: TILE_SOURCES[0](layer.zoom, wrappedX, tileY),
        rounds: 0,
        left: tileX * TILE_SIZE - layer.originX,
        top: tileY * TILE_SIZE - layer.originY,
        centerX: (tileX + 0.5) * TILE_SIZE,
        centerY: (tileY + 0.5) * TILE_SIZE,
        retries: 0,
        state: 'queued',
        image: null,
        loadTimer: null,
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
          previous.el.style.opacity = '1';
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
          failed: 0,
        };
        discardStaleWork();
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
    layer.innerHTML = '<div class="free2do-static-map-image" role="img" aria-label="Bản đồ hoạt động"></div><div class="free2do-static-map-markers"></div><div class="free2do-map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a></div>';
    container.prepend(layer);

    const mapImage = layer.querySelector('.free2do-static-map-image');
    const markerLayer = layer.querySelector('.free2do-static-map-markers');
    const tiles = createTileLayer(mapImage);
    const markers = new Map();
    let latestRender = null;
    let resizeTimer;
    let baseMapKey = '';
    let viewportKey = '';
    let zoomOffset = 0;
    let currentBaseZoom = 13;
    let wheelAccumulator = 0;
    let pinchStartDistance = null;
    let pinchLastDistance = null;
    let viewCenter = null;
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
      if (!viewCenter || nextViewportKey !== viewportKey) {
        viewportKey = nextViewportKey;
        zoomOffset = 0;
        viewCenter = { ...center };
      }
      const zoom = clamp(currentBaseZoom + zoomOffset, VIETNAM_MIN_ZOOM, 18);
      viewCenter = constrainCenterToVietnam(viewCenter, zoom, displayWidth, displayHeight);
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
      if (!latestRender) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => render(latestRender.userPosition, latestRender.radiusKm, latestRender.activities), 50);
    }

    function zoomBy(step) {
      if (!latestRender || !viewCenter) return;
      const nextZoom = clamp(currentBaseZoom + zoomOffset + step, VIETNAM_MIN_ZOOM, 18);
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
      if (!latestRender || !viewCenter || event.button !== 0 || event.target.closest('.free2do-static-map-marker')) return;
      const zoom = clamp(currentBaseZoom + zoomOffset, VIETNAM_MIN_ZOOM, 18);
      dragStart = {
        x: event.clientX,
        y: event.clientY,
        centerPoint: worldPoint(viewCenter.latitude, viewCenter.longitude, zoom),
        zoom,
        offsetX: 0,
        offsetY: 0,
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
      const box = container.getBoundingClientRect();
      const candidate = coordinateFromWorldPoint(
        dragStart.centerPoint.x - dx,
        dragStart.centerPoint.y - dy,
        dragStart.zoom,
      );
      const bounded = constrainCenterToVietnam(
        candidate,
        dragStart.zoom,
        Math.max(320, Math.round(box.width)),
        Math.max(320, Math.round(box.height)),
      );
      const boundedPoint = worldPoint(bounded.latitude, bounded.longitude, dragStart.zoom);
      dragStart.offsetX = dragStart.centerPoint.x - boundedPoint.x;
      dragStart.offsetY = dragStart.centerPoint.y - boundedPoint.y;
      mapImage.style.transform = `translate(${dragStart.offsetX}px, ${dragStart.offsetY}px)`;
      markerLayer.style.transform = `translate(${dragStart.offsetX}px, ${dragStart.offsetY}px)`;
      tiles.extend(
        dragStart.zoom,
        boundedPoint,
        Math.max(320, Math.round(box.width)),
        Math.max(320, Math.round(box.height)),
      );
    });
    const finishPointer = event => {
      if (!dragStart) return;
      const rawDx = event.clientX - dragStart.x;
      const rawDy = event.clientY - dragStart.y;
      const dx = dragging ? dragStart.offsetX : rawDx;
      const dy = dragging ? dragStart.offsetY : rawDy;
      mapImage.style.transform = '';
      markerLayer.style.transform = '';
      layer.style.cursor = 'grab';
      if (dragging) {
        viewCenter = constrainCenterToVietnam(coordinateFromWorldPoint(
          dragStart.centerPoint.x - dx,
          dragStart.centerPoint.y - dy,
          dragStart.zoom,
        ), dragStart.zoom, container.clientWidth, container.clientHeight);
        baseMapKey = '';
        render(latestRender.userPosition, latestRender.radiusKm, latestRender.activities);
      } else if (selectPositionHandler) {
        const rect = container.getBoundingClientRect();
        const viewPoint = worldPoint(viewCenter.latitude, viewCenter.longitude, dragStart.zoom);
        const selected = clampToVietnam(coordinateFromWorldPoint(
          viewPoint.x + event.clientX - rect.left - rect.width / 2,
          viewPoint.y + event.clientY - rect.top - rect.height / 2,
          dragStart.zoom,
        ));
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
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    ));
  }

  window.Free2DoMap = { create, getCurrentPosition, validCoordinate, vietnamBounds: VIETNAM_BOUNDS };
})();
