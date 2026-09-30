(function () {
  'use strict';

  const LEAFLET_VERSION = '1.9.4';
  let leafletPromise;

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
      css.integrity = 'sha256-p4NxAoJBhIINfQ3ynhFwGNjfMZc4Ew5xF5jz8V4p6uM=';
      css.crossOrigin = '';
      document.head.appendChild(css);

      const script = document.createElement('script');
      script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error('Không tải được thư viện bản đồ.'));
      document.head.appendChild(script);
    });
    return leafletPromise;
  }

  function validCoordinate(latitude, longitude) {
    return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
      && Number(latitude) >= -90 && Number(latitude) <= 90
      && Number(longitude) >= -180 && Number(longitude) <= 180;
  }

  async function create(containerId, initialCenter) {
    const L = await loadLeaflet();
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Không tìm thấy vùng bản đồ ${containerId}.`);

    const layer = document.createElement('div');
    layer.className = 'free2do-leaflet-map';
    layer.style.cssText = 'position:absolute;inset:0;z-index:1;';
    container.prepend(layer);
    container.querySelectorAll('.map-grid-bg').forEach(item => { item.style.display = 'none'; });
    container.querySelectorAll('.map-overlay-left,.map-overlay-bottom-left').forEach(item => {
      item.style.zIndex = '500';
      item.style.pointerEvents = 'none';
    });

    const center = initialCenter || { latitude: 21.0285, longitude: 105.8542 };
    const map = L.map(layer, { zoomControl: true }).setView([center.latitude, center.longitude], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    let userMarker;
    let radiusCircle;
    const activityMarkers = new Map();

    function render(userPosition, radiusKm, activities) {
      const latitude = Number(userPosition.latitude);
      const longitude = Number(userPosition.longitude);
      if (!validCoordinate(latitude, longitude)) return;

      if (userMarker) userMarker.remove();
      if (radiusCircle) radiusCircle.remove();
      activityMarkers.forEach(marker => marker.remove());
      activityMarkers.clear();

      userMarker = L.circleMarker([latitude, longitude], {
        radius: 8, color: '#fff', weight: 3, fillColor: '#e15b7b', fillOpacity: 1,
      }).addTo(map).bindTooltip('Vị trí của bạn');
      radiusCircle = L.circle([latitude, longitude], {
        radius: Number(radiusKm) * 1000,
        color: '#df5c7b', weight: 2, fillColor: '#df5c7b', fillOpacity: 0.08,
      }).addTo(map);

      activities.forEach(activity => {
        if (!validCoordinate(activity.latitude, activity.longitude)) return;
        const marker = L.marker([Number(activity.latitude), Number(activity.longitude)])
          .addTo(map)
          .bindPopup(`<a href="activity-detail.html?id=${encodeURIComponent(activity.activity_id)}" style="color:inherit;text-decoration:none"><b>${window.CustomerAPI.escapeHTML(activity.name)}</b><br>${window.CustomerAPI.escapeHTML(window.CustomerAPI.priceLabel(activity.price_text, activity.price))}<br>${activity.distance_km ?? '—'} km</a>`);
        activityMarkers.set(String(activity.activity_id), marker);
      });

      // Khung nhìn rộng hơn bán kính yêu cầu 4%: 5 km được hiển thị khoảng 5,2 km.
      const viewportCircle = L.circle([latitude, longitude], { radius: Number(radiusKm) * 1040 });
      map.fitBounds(viewportCircle.getBounds(), { padding: [12, 12], animate: false });
      setTimeout(() => map.invalidateSize(), 0);
    }

    function highlight(activityId, highlighted) {
      const marker = activityMarkers.get(String(activityId));
      if (!marker) return;
      if (highlighted) marker.openPopup();
      else marker.closePopup();
    }

    return { map, render, highlight };
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
